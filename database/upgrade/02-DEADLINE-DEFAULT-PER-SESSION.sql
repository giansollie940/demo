-- SỔ TỰ HỌC V8.8.0+
-- Chuẩn hóa deadline mặc định cho TẤT CẢ các tuần:
--   deadline của mỗi buổi = ngày liền trước ngày có buổi tự học
--   tại giờ per_session_deadline_time của lớp (mặc định 20:00).
--
-- Ví dụ:
--   Buổi Thứ 2 -> hạn Chủ nhật 20:00
--   Buổi Thứ 4 -> hạn Thứ 3 20:00
--   Buổi Thứ 6 -> hạn Thứ 5 20:00
--
-- Script này chủ động đưa các tuần hiện có về chế độ mặc định per_session_20.
-- Vì vậy các deadline 'specific' cũ ở cấp tuần cũng được xóa. Sau khi chạy,
-- GV vẫn có thể đặt lại 'Hạn cụ thể' cho một tuần nếu thật sự cần ngoại lệ.
-- Có thể chạy lại an toàn.

begin;

do $preflight$
begin
  if to_regclass('public.weeks') is null then
    raise exception 'DEADLINE_PATCH_NOT_READY: missing public.weeks';
  end if;
  if to_regclass('public.class_weeks') is null then
    raise exception 'DEADLINE_PATCH_NOT_READY: missing public.class_weeks';
  end if;
  if to_regclass('public.class_settings') is null then
    raise exception 'DEADLINE_PATCH_NOT_READY: missing public.class_settings';
  end if;
  if to_regprocedure('public.registration_deadline_for_slot(uuid,uuid,integer)') is null then
    raise exception 'DEADLINE_PATCH_NOT_READY: missing public.registration_deadline_for_slot(uuid,uuid,integer)';
  end if;
end
$preflight$;

-- 1) Bảo đảm default schema cho dữ liệu mới.
alter table public.weeks
  alter column deadline_mode set default 'per_session_20';

alter table public.class_weeks
  alter column deadline_mode set default 'per_session_20';

-- 2) Chuẩn hóa toàn bộ tuần hiện có về deadline theo từng buổi.
update public.weeks
set deadline_mode='per_session_20',
    registration_deadline=null
where deadline_mode is distinct from 'per_session_20'
   or registration_deadline is not null;

update public.class_weeks
set deadline_mode='per_session_20',
    registration_deadline=null,
    updated_at=now()
where deadline_mode is distinct from 'per_session_20'
   or registration_deadline is not null;

-- 3) Giờ deadline của lớp: chỉ điền 20:00 nếu dữ liệu cũ đang NULL.
update public.class_settings
set per_session_deadline_time=time '20:00',
    updated_at=now()
where per_session_deadline_time is null;

notify pgrst,'reload schema';

commit;

-- 4) Kiểm tra sau khi chạy.
with checks as (
  select 'weeks_all_per_session'::text as item,
         not exists (
           select 1 from public.weeks
           where deadline_mode is distinct from 'per_session_20'
              or registration_deadline is not null
         ) as ok
  union all
  select 'class_weeks_all_per_session',
         not exists (
           select 1 from public.class_weeks
           where deadline_mode is distinct from 'per_session_20'
              or registration_deadline is not null
         )
  union all
  select 'class_deadline_time_not_null',
         not exists (
           select 1 from public.class_settings
           where per_session_deadline_time is null
         )
  union all
  select 'deadline_function_available',
         to_regprocedure('public.registration_deadline_for_slot(uuid,uuid,integer)') is not null
)
select item,ok,case when ok then 'ok' else 'CHECK_REQUIRED' end as detail
from checks
union all
select 'overall_deadline_default',bool_and(ok),case when bool_and(ok) then 'true' else 'false' end
from checks;
