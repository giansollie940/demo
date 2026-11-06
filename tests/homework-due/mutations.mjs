/**
 * Mutations of supabase/migrations/20261106090000_homework_due_not_past.sql. Each breaks exactly one part of the
 * rule; scripts/mutate.mjs re-runs the whole suite once per mutation. A mutation
 * that no test notices means a test is missing, not that the mutation is harmless.
 *
 * Every `find` must occur exactly the expected number of times, so a mutation
 * cannot silently stop applying when the migration is edited.
 */
const replace = (find, put, expected = 1) => text => {
  const count = text.split(find).length - 1;
  if (count !== expected) throw new Error(`mutation phải khớp ${expected} chỗ nhưng khớp ${count}:\n${find}`);
  return text.split(find).join(put);
};

export const mutations = {
  D1: {
    what: 'không có trigger — luật chỉ còn trong validate_revision',
    apply: replace(`create trigger homework_due_not_past
  before insert or update of due_at on public.homework_notices
  for each row execute function homework_private.due_not_past_guard();`, ''),
  },
  D2: {
    what: 'biên: hạn đúng bằng thời điểm đăng được cho qua (<= thành <)',
    apply: replace('  if p_new <= now() then', '  if p_new < now() then'),
  },
  D3: {
    what: 'bỏ ngoại lệ "hạn không đổi" — bài đã quá hạn không sửa nội dung được nữa',
    apply: replace('  if p_old is not null and p_new = p_old then return; end if;\n', ''),
  },
  D4: {
    what: 'bỏ kiểm tra request_id — gửi lại một bài đã nhận thành lỗi "hạn đã qua"',
    apply: replace(`    if exists (select 1 from public.homework_notices x
                where x.author_id = new.author_id and x.request_id = new.request_id) then
      return new;
    end if;
`, ''),
  },
  D5: {
    what: 'trigger chỉ chạy khi đăng mới — đổi hạn về quá khứ khi sửa lọt qua',
    apply: replace('  before insert or update of due_at on public.homework_notices',
      '  before insert on public.homework_notices'),
  },
  D6: {
    what: 'trigger không SECURITY DEFINER — mọi lần service_role ghi bảng đều gãy',
    apply: replace('language plpgsql security definer set search_path = pg_catalog, public as $$\nbegin\n  if tg_op',
      'language plpgsql set search_path = pg_catalog, public as $$\nbegin\n  if tg_op'),
  },
  D7: {
    what: 'validate_revision không gọi luật — tác giả chỉ biết lỗi khi GV bấm duyệt',
    apply: replace('  execute replace(def, anchor || eol, anchor || eol || line || eol);', '  null;'),
  },
  D8: {
    what: 'validate_revision so với NULL thay vì hạn cũ — bản sửa giữ hạn cũ đã qua bị chặn',
    apply: replace("assert_due_not_past((p->>'due_at')::timestamptz, n.due_at)",
      "assert_due_not_past((p->>'due_at')::timestamptz, null)"),
  },
  D9: {
    what: 'in hạn theo UTC thay vì giờ Việt Nam',
    apply: replace("to_char(p_new at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI DD/MM/YYYY')",
      "to_char(p_new at time zone 'UTC', 'HH24:MI DD/MM/YYYY')"),
  },
  D11: {
    what: 'luôn coi thân hàm là LF — thân hàm CRLF (dán từ SQL editor) không vá được',
    apply: replace("  eol := case when position(anchor || chr(13) || chr(10) in def) > 0 then chr(13) || chr(10) else chr(10) end;",
      '  eol := chr(10);'),
  },
  D12: {
    what: 'bỏ chốt "đã vá" — chạy migration lần hai chèn thêm một dòng luật nữa',
    apply: replace("  if position('assert_due_not_past' in def) > 0 then", '  if false then'),
  },
  D10: {
    what: 'cấp EXECUTE hàm luật cho authenticated',
    apply: replace('revoke all on function homework_private.assert_due_not_past(timestamptz, timestamptz) from public, anon, authenticated, service_role;',
      'revoke all on function homework_private.assert_due_not_past(timestamptz, timestamptz) from public, anon, service_role;\ngrant execute on function homework_private.assert_due_not_past(timestamptz, timestamptz) to authenticated;'),
  },
};
