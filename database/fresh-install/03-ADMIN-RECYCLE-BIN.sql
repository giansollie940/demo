-- V8.8.0 feature
-- Thùng rác cho Admin: xem và khôi phục những thứ GV đã xoá.
--
-- App vốn đã xoá mềm chứ không xoá thật:
--   * registrations: is_deleted / deleted_at / deleted_by (delete_registration_safely)
--   * profiles: active=false + deleted_at (Edge admin-delete-user)
-- Nhưng chưa có đường nào để xem lại hay khôi phục, nên một thao tác xoá nhầm
-- của GV coi như mất luôn dù dữ liệu vẫn nằm nguyên trong database.
--
-- Script này thêm 4 RPC, TẤT CẢ chỉ dành cho Admin (is_root_admin):
--   admin_list_deleted_registrations() / admin_restore_registration()
--   admin_list_deleted_users()         / admin_restore_user()
--
-- Hai lưu ý về va chạm khi khôi phục:
--   * uq_registrations_active_student_slot là unique một phần trên
--     (student_id,week_id,weekday,period_number) WHERE is_deleted=false. Nếu HS
--     đã đăng ký lại đúng ô đó thì khôi phục sẽ đụng khoá. RPC phát hiện trước
--     và báo bằng tiếng Việt, thay vì để Postgres ném lỗi 23505 khó hiểu; hàm
--     list cũng trả sẵn cờ can_restore để giao diện làm mờ nút.
--   * uq_profiles_student_code_ci KHÔNG lọc theo deleted_at, nên mã HS vẫn được
--     giữ chỗ khi tài khoản bị xoá mềm — khôi phục tài khoản không thể đụng mã.
--
-- Không sửa dữ liệu sẵn có. An toàn chạy lại nhiều lần.

begin;

do $preflight$
begin
  if to_regprocedure('public.is_root_admin()') is null then
    raise exception 'V8.8.0_NOT_READY: missing public.is_root_admin().';
  end if;
  if to_regclass('public.registrations') is null then
    raise exception 'V8.8.0_NOT_READY: missing public.registrations.';
  end if;
  if to_regclass('public.profiles') is null then
    raise exception 'V8.8.0_NOT_READY: missing public.profiles.';
  end if;
end
$preflight$;

-- ---------------------------------------------------------------------
-- 1. Danh sách đăng ký đã bị xoá mềm
-- ---------------------------------------------------------------------
create or replace function public.admin_list_deleted_registrations(p_limit integer default 200)
returns table(
  id uuid,
  class_id uuid,
  student_id uuid,
  student_code text,
  student_name text,
  week_number integer,
  weekday integer,
  period_number integer,
  content text,
  status text,
  deleted_at timestamptz,
  deleted_by uuid,
  deleted_by_name text,
  can_restore boolean,
  blocked_reason text
)
language sql
stable
security definer
set search_path=public,pg_temp
as $$
  select
    r.id,
    r.class_id,
    r.student_id,
    s.student_code::text,
    coalesce(s.full_name,'Học sinh')::text,
    w.week_number,
    r.weekday,
    r.period_number,
    r.content,
    r.status::text,
    r.deleted_at,
    r.deleted_by,
    coalesce(d.full_name, 'Không rõ')::text,
    not exists(
      select 1 from public.registrations a
      where a.student_id=r.student_id and a.week_id=r.week_id
        and a.weekday=r.weekday and a.period_number=r.period_number
        and a.is_deleted=false
    ) as can_restore,
    case when exists(
      select 1 from public.registrations a
      where a.student_id=r.student_id and a.week_id=r.week_id
        and a.weekday=r.weekday and a.period_number=r.period_number
        and a.is_deleted=false
    ) then 'Học sinh đã có đăng ký khác đang hoạt động ở đúng tiết này.'
    else null end
  from public.registrations r
  left join public.profiles s on s.id=r.student_id
  left join public.profiles d on d.id=r.deleted_by
  left join public.weeks w on w.id=r.week_id
  where public.is_root_admin()
    and r.is_deleted=true
  order by r.deleted_at desc nulls last, r.updated_at desc
  limit greatest(1, least(coalesce(p_limit,200), 500))
$$;

revoke all on function public.admin_list_deleted_registrations(integer) from public,anon;
grant execute on function public.admin_list_deleted_registrations(integer) to authenticated,service_role;

-- ---------------------------------------------------------------------
-- 2. Khôi phục một đăng ký
-- ---------------------------------------------------------------------
create or replace function public.admin_restore_registration(p_registration_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path=public,pg_temp
as $admin_restore_registration$
declare
  v_registration public.registrations%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Bạn chưa đăng nhập.' using errcode='42501';
  end if;

  if not public.is_root_admin() then
    raise exception 'Chỉ Admin mới khôi phục được dữ liệu đã xoá.' using errcode='42501';
  end if;

  select * into v_registration
  from public.registrations
  where id=p_registration_id
  for update;

  if not found then
    raise exception 'Không tìm thấy đăng ký.' using errcode='P0002';
  end if;

  if coalesce(v_registration.is_deleted,false)=false then
    raise exception 'Đăng ký này chưa bị xoá.' using errcode='22023';
  end if;

  -- Chặn trước va chạm với uq_registrations_active_student_slot để lỗi đọc được.
  if exists(
    select 1 from public.registrations a
    where a.student_id=v_registration.student_id
      and a.week_id=v_registration.week_id
      and a.weekday=v_registration.weekday
      and a.period_number=v_registration.period_number
      and a.is_deleted=false
  ) then
    raise exception 'Học sinh đã có đăng ký khác đang hoạt động ở đúng tiết này; hãy xử lý đăng ký đó trước.'
      using errcode='23505';
  end if;

  update public.registrations
  set is_deleted=false,
      deleted_at=null,
      deleted_by=null,
      updated_at=now()
  where id=v_registration.id;

  return true;
end;
$admin_restore_registration$;

revoke all on function public.admin_restore_registration(uuid) from public,anon;
grant execute on function public.admin_restore_registration(uuid) to authenticated,service_role;

-- ---------------------------------------------------------------------
-- 3. Danh sách tài khoản đã bị xoá mềm
-- ---------------------------------------------------------------------
create or replace function public.admin_list_deleted_users(p_limit integer default 200)
returns table(
  id uuid,
  student_code text,
  full_name text,
  role text,
  class_id uuid,
  class_code text,
  deleted_at timestamptz
)
language sql
stable
security definer
set search_path=public,pg_temp
as $$
  select
    p.id,
    p.student_code::text,
    coalesce(p.full_name,'Không tên')::text,
    p.role::text,
    p.class_id,
    c.code::text,
    p.deleted_at
  from public.profiles p
  left join public.classes c on c.id=p.class_id
  where public.is_root_admin()
    and p.deleted_at is not null
  order by p.deleted_at desc
  limit greatest(1, least(coalesce(p_limit,200), 500))
$$;

revoke all on function public.admin_list_deleted_users(integer) from public,anon;
grant execute on function public.admin_list_deleted_users(integer) to authenticated,service_role;

-- ---------------------------------------------------------------------
-- 4. Khôi phục một tài khoản
-- ---------------------------------------------------------------------
create or replace function public.admin_restore_user(p_user_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path=public,pg_temp
as $admin_restore_user$
declare
  v_profile public.profiles%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Bạn chưa đăng nhập.' using errcode='42501';
  end if;

  if not public.is_root_admin() then
    raise exception 'Chỉ Admin mới khôi phục được dữ liệu đã xoá.' using errcode='42501';
  end if;

  select * into v_profile from public.profiles where id=p_user_id for update;

  if not found then
    raise exception 'Không tìm thấy tài khoản.' using errcode='P0002';
  end if;

  if v_profile.deleted_at is null then
    raise exception 'Tài khoản này chưa bị xoá.' using errcode='22023';
  end if;

  -- Xoá mềm đặt active=false + deleted_at; khôi phục trả lại đúng cặp đó.
  update public.profiles
  set deleted_at=null,
      active=true
  where id=v_profile.id;

  return true;
end;
$admin_restore_user$;

revoke all on function public.admin_restore_user(uuid) from public,anon;
grant execute on function public.admin_restore_user(uuid) to authenticated,service_role;

notify pgrst,'reload schema';

commit;

-- ---------------------------------------------------------------------
-- Kiểm tra sau khi cài.
-- ---------------------------------------------------------------------
with checks as (
  select 'list_deleted_registrations_exists'::text as item,
    to_regprocedure('public.admin_list_deleted_registrations(integer)') is not null as ok
  union all
  select 'restore_registration_exists',
    to_regprocedure('public.admin_restore_registration(uuid)') is not null
  union all
  select 'list_deleted_users_exists',
    to_regprocedure('public.admin_list_deleted_users(integer)') is not null
  union all
  select 'restore_user_exists',
    to_regprocedure('public.admin_restore_user(uuid)') is not null
  union all
  select 'restore_registration_is_admin_only',
    lower(regexp_replace(pg_get_functiondef(to_regprocedure('public.admin_restore_registration(uuid)')),'\s+','','g'))
      like '%ifnotpublic.is_root_admin()then%'
  union all
  select 'restore_user_is_admin_only',
    lower(regexp_replace(pg_get_functiondef(to_regprocedure('public.admin_restore_user(uuid)')),'\s+','','g'))
      like '%ifnotpublic.is_root_admin()then%'
  union all
  select 'restore_registration_guards_slot_collision',
    lower(regexp_replace(pg_get_functiondef(to_regprocedure('public.admin_restore_registration(uuid)')),'\s+','','g'))
      like '%a.is_deleted=false%'
  union all
  select 'execute_granted_to_authenticated',
    has_function_privilege('authenticated','public.admin_restore_registration(uuid)','execute')
    and has_function_privilege('authenticated','public.admin_list_deleted_registrations(integer)','execute')
    and has_function_privilege('authenticated','public.admin_restore_user(uuid)','execute')
    and has_function_privilege('authenticated','public.admin_list_deleted_users(integer)','execute')
  union all
  select 'not_granted_to_anon',
    not has_function_privilege('anon','public.admin_restore_registration(uuid)','execute')
    and not has_function_privilege('anon','public.admin_restore_user(uuid)','execute')
)
select item,ok,case when ok then 'ok' else 'CHECK_REQUIRED' end as detail
from checks
union all
select 'overall_install', bool_and(ok), case when bool_and(ok) then 'true' else 'false' end
from checks;
