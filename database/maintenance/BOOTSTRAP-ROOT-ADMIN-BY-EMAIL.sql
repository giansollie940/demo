-- SỔ TỰ HỌC V8.4.0 — THIẾT LẬP ROOT ADMIN DUY NHẤT
-- Chạy trong Supabase SQL Editor SAU PATCH/MIGRATION V8.4.0.
-- Chỉ sửa đúng 1 dòng ADMIN_EMAIL bên dưới.

begin;

do $bootstrap$
declare
  ADMIN_EMAIL constant text := 'THAY_EMAIL_TAI_KHOAN_GIAO_VIEN_O_DAY';
  v_user_id uuid;
  v_role text;
  v_active boolean;
begin
  select u.id into v_user_id
  from auth.users u
  where lower(u.email)=lower(btrim(ADMIN_EMAIL));

  if v_user_id is null then
    raise exception 'Không tìm thấy tài khoản Auth có email: %', ADMIN_EMAIL;
  end if;

  select p.role::text,p.active into v_role,v_active
  from public.profiles p
  where p.id=v_user_id;

  if v_role is null then
    raise exception 'Tài khoản Auth chưa có profile ứng dụng.';
  end if;
  if v_role<>'teacher' or v_active is not true then
    raise exception 'Tài khoản root admin ban đầu phải là giáo viên đang hoạt động. role=%, active=%',v_role,v_active;
  end if;

  perform public.bootstrap_root_admin(v_user_id);
  raise notice 'Đã thiết lập root admin: % (%)',ADMIN_EMAIL,v_user_id;
end
$bootstrap$;

commit;

select p.id,p.student_code,p.full_name,p.role,p.active
from public.profiles p
where p.role='admin';
