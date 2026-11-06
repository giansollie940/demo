-- Báo bài: hạn không được ở quá khứ so với thời điểm đăng.
--
-- Không đổi bảng, không đụng dữ liệu cũ, không backfill.
--   • Mọi người đăng (học sinh, cán sự, giáo viên) và mọi đường ghi: đăng mới, sửa, duyệt bản sửa của
--     GV (apply_correction) và service_role. Vì thế luật nằm ở một trigger trên bảng, không ở Edge
--     Function homework-review (AI): đây là phép so hai mốc thời gian, không phải một phán đoán, và
--     homework-review chỉ là một trong các đường vào. Bài hạn đã qua bị từ chối trước bước so trùng.
--   • Đăng mới: hạn phải SAU thời điểm đăng; hạn bằng hoặc trước thời điểm đăng → từ chối.
--   • Sửa: chỉ xét khi hạn ĐỔI. Sửa nội dung một bài đã quá hạn mà giữ hạn thì vẫn được.
--   • Hạn còn dưới 1 giờ: không chặn ở đây — trang Báo bài cảnh báo.
-- Lỗi: SQLSTATE 22023, câu tiếng Việt trong message (homework-review chuyển nguyên văn về client),
-- mã ổn định HOMEWORK_DUE_IN_PAST trong hint.

-- Nơi DUY NHẤT biết luật. p_old là hạn hiện có (NULL khi đăng mới). now() là thời điểm bắt đầu
-- transaction đăng bài, nên mọi câu trong cùng một lần đăng thấy cùng một "bây giờ".
create or replace function homework_private.assert_due_not_past(p_new timestamptz, p_old timestamptz)
returns void
language plpgsql stable set search_path = pg_catalog, public as $$
begin
  if p_old is not null and p_new = p_old then return; end if;
  if p_new <= now() then
    raise exception 'Hạn % đã qua. Hạn của Báo bài phải sau thời điểm đăng (%).',
      to_char(p_new at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI DD/MM/YYYY'),
      to_char(now() at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI DD/MM/YYYY')
      using errcode = '22023', hint = 'HOMEWORK_DUE_IN_PAST';
  end if;
end $$;

comment on function homework_private.assert_due_not_past(timestamptz, timestamptz) is
 'Báo bài: hạn mới phải sau thời điểm đăng; hạn không đổi thì không xét.';

-- SECURITY DEFINER như archive_guard bên cạnh: hàm trigger chạy với quyền người đang ghi, còn
-- homework_private chỉ cho postgres USAGE — thiếu definer thì mọi lần service_role ghi bảng đều gãy.
create or replace function homework_private.due_not_past_guard() returns trigger
language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  if tg_op = 'INSERT' then
    -- homework_api đăng bằng `on conflict (author_id, request_id) do nothing` để một lần gửi lại do
    -- mạng chập chờn trả về đúng bài đã nhận. BEFORE INSERT chạy trước khi xung đột được phát hiện,
    -- nên bỏ qua khi bài đó đã có: câu insert này đằng nào cũng không tạo dòng mới.
    if exists (select 1 from public.homework_notices x
                where x.author_id = new.author_id and x.request_id = new.request_id) then
      return new;
    end if;
    perform homework_private.assert_due_not_past(new.due_at, null);
  else
    perform homework_private.assert_due_not_past(new.due_at, old.due_at);
  end if;
  return new;
end $$;

-- `update of due_at`: đổi trạng thái (duyệt, gỡ, thay thế, purge) không chạy trigger này, nên một bài
-- quá hạn trong lúc chờ duyệt vẫn duyệt/gỡ được.
drop trigger if exists homework_due_not_past on public.homework_notices;
create trigger homework_due_not_past
  before insert or update of due_at on public.homework_notices
  for each row execute function homework_private.due_not_past_guard();

revoke all on function homework_private.assert_due_not_past(timestamptz, timestamptz) from public, anon, authenticated, service_role;
revoke all on function homework_private.due_not_past_guard() from public, anon, authenticated, service_role;

-- validate_revision (bản sửa theo yêu cầu GV: lưu nháp, gửi lại, và lúc GV duyệt) gọi luật để tác
-- giả biết lỗi ngay lúc gửi. Chèn đúng một dòng sau dòng kiểm tra hạn hợp lệ: đọc định nghĩa đang
-- chạy, neo phải xuất hiện đúng một lần (nếu không thì dừng), giữ kiểu xuống dòng của thân hàm.
-- CREATE OR REPLACE giữ nguyên quyền. Chạy lại lần hai thì không làm gì.
do $patch$
declare
  def text := pg_get_functiondef('homework_private.validate_revision(public.homework_notices,jsonb)'::regprocedure);
  anchor constant text := $a$or p->>'due_at' is null or not isfinite((p->>'due_at')::timestamptz) then raise exception 'Nội dung/hạn không hợp lệ';end if;$a$;
  line constant text := $l$ perform homework_private.assert_due_not_past((p->>'due_at')::timestamptz, n.due_at); -- [due-not-past] hạn không ở quá khứ$l$;
  eol text;
  hits int;
begin
  if position('assert_due_not_past' in def) > 0 then
    raise notice 'homework due not past: validate_revision already patched';
    return;
  end if;
  eol := case when position(anchor || chr(13) || chr(10) in def) > 0 then chr(13) || chr(10) else chr(10) end;
  hits := (length(def) - length(replace(def, anchor || eol, ''))) / length(anchor || eol);
  if hits <> 1 then
    raise exception 'homework due not past: validate_revision anchor found % times, expected 1', hits;
  end if;
  execute replace(def, anchor || eol, anchor || eol || line || eol);
end
$patch$;
