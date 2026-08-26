-- SỔ TỰ HỌC V8.4.0 — CHUYỂN QUYỀN ROOT ADMIN
-- Chạy trong Supabase SQL Editor.
-- Admin mới phải là tài khoản teacher đang hoạt động.
-- Chỉ sửa đúng 1 dòng NEW_ADMIN_EMAIL bên dưới.

begin;

do $transfer$
declare
  NEW_ADMIN_EMAIL constant text := 'THAY_EMAIL_GIAO_VIEN_NHAN_QUYEN_ADMIN_O_DAY';
  v_new_admin_id uuid;
begin
  select u.id into v_new_admin_id
  from auth.users u
  where lower(u.email)=lower(btrim(NEW_ADMIN_EMAIL));

  if v_new_admin_id is null then
    raise exception 'Không tìm thấy tài khoản Auth có email: %',NEW_ADMIN_EMAIL;
  end if;

  perform public.transfer_root_admin(v_new_admin_id);
  raise notice 'Đã chuyển root admin sang: % (%)',NEW_ADMIN_EMAIL,v_new_admin_id;
end
$transfer$;

commit;

select p.id,p.student_code,p.full_name,p.role,p.active
from public.profiles p
where p.role='admin';
