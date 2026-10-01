-- Báo bài · Góc tuyên dương theo tháng và năm học (thay cho theo tuần).
--
-- · `load` nhận thêm `month` ('YYYY-MM'). Khung tuyên dương = tháng đó, cắt theo năm học của lớp.
--   Không gửi `month` (và không gửi `week_id`) = cả năm học. `week_id` vẫn được nhận để bản
--   giao diện cũ không lỗi, nhưng giao diện mới không dùng nữa.
-- · Mọi thứ được tính theo thời điểm bài được duyệt (`published_at`, gán một lần khi bài chuyển
--   sang 'published'): 🐦 số bài được duyệt trong tháng, và ⭐ số tim của các bài được duyệt
--   trong tháng (trước đây tim tính theo lúc bấm tim).
-- · `award_months`: các tháng của năm học, từ tháng bắt đầu tới tháng hiện tại (giờ Việt Nam).
--
-- homework_private.api_v3 dài ~25 KB và chỉ cần sửa 4 chỗ, nên bản vá đọc định nghĩa đang chạy,
-- thay đúng 4 đoạn (mỗi đoạn phải xuất hiện đúng một lần, nếu không thì dừng) rồi tạo lại hàm.
-- CREATE OR REPLACE giữ nguyên quyền (grant), SECURITY DEFINER và search_path. Chạy lại lần
-- hai thì không làm gì.
do $patch$
declare
  def text := pg_get_functiondef('homework_private.api_v3(text,jsonb)'::regprocedure);
  anchor text;
  replacement text;
  pairs text[][] := array[
    -- 1. biến mới
    array[
      'win_start timestamptz;win_end timestamptz;wk public.weeks;',
      'win_start timestamptz;win_end timestamptz;wk public.weeks;m_start date;'
    ],
    -- 2. khung theo tháng (sau khối week_id) + danh sách tháng trả về cho giao diện
    array[
      'r:=jsonb_build_object(''settings'',jsonb_build_object(''seed_threshold'',st.seed_threshold),',
      'if nullif(p_data->>''month'','''') is not null then' || chr(13) || chr(10) ||
      '  if (p_data->>''month'') !~ ''^[0-9]{4}-(0[1-9]|1[0-2])$'' then raise exception ''Tháng không hợp lệ'' using errcode=''22023'';end if;' || chr(13) || chr(10) ||
      '  m_start:=to_date((p_data->>''month'')||''-01'',''YYYY-MM-DD'');' || chr(13) || chr(10) ||
      '  win_start:=greatest(win_start,m_start::timestamp at time zone ''Asia/Ho_Chi_Minh'');' || chr(13) || chr(10) ||
      '  win_end:=least(win_end,(m_start+interval ''1 month'')::timestamp at time zone ''Asia/Ho_Chi_Minh'');' || chr(13) || chr(10) ||
      '  if win_end<win_start then win_end:=win_start;end if; -- tháng ngoài năm học: khung rỗng' || chr(13) || chr(10) ||
      ' end if;' || chr(13) || chr(10) ||
      ' r:=jsonb_build_object(''settings'',jsonb_build_object(''seed_threshold'',st.seed_threshold),' || chr(13) || chr(10) ||
      '  ''award_months'',coalesce((select jsonb_agg(to_char(mm,''YYYY-MM'') order by mm) from public.school_years sy,' ||
      ' generate_series(date_trunc(''month'',sy.start_date::timestamp),date_trunc(''month'',least(sy.end_date,(now() at time zone ''Asia/Ho_Chi_Minh'')::date)::timestamp),interval ''1 month'') mm' ||
      ' where sy.id=y),''[]''),'
    ],
    -- 3. tim: theo thời điểm bài được duyệt
    array[
      'hr.created_at>=win_start and hr.created_at<win_end',
      'x.published_at>=win_start and x.published_at<win_end'
    ]
  ];
  i int;
  hits int;
begin
  if position('m_start date;' in def) > 0 then
    raise notice 'homework awards by month: already applied';
    return;
  end if;
  for i in 1 .. array_length(pairs, 1) loop
    anchor := pairs[i][1];
    replacement := pairs[i][2];
    hits := (length(def) - length(replace(def, anchor, ''))) / length(anchor);
    if hits <> 1 then
      raise exception 'homework awards by month: anchor % found % times, expected 1', i, hits;
    end if;
    def := replace(def, anchor, replacement);
  end loop;
  execute def;
end
$patch$;
