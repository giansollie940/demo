-- V8.8.0 targeted repair
-- Fix only the two verifier failures:
--   1) delete_registration_class_specific
--   2) student_update_policy_class_specific
--
-- Safe to rerun. This script does not modify timetable assignments,
-- registrations data, or migrated timetable records.

begin;

-- ---------------------------------------------------------------------
-- Preflight: required V8.8.0 class-specific session resolver must exist.
-- ---------------------------------------------------------------------
do $preflight$
begin
  if to_regprocedure('public.study_session_start(uuid,uuid,integer,integer)') is null then
    raise exception
      'V8.8.0_NOT_READY: missing public.study_session_start(uuid,uuid,integer,integer). Run the full V8.8.0 upgrade first.';
  end if;

  if to_regclass('public.registrations') is null then
    raise exception 'V8.8.0_NOT_READY: missing public.registrations.';
  end if;
end
$preflight$;

-- ---------------------------------------------------------------------
-- 1. Safe registration deletion must resolve the session by class.
-- ---------------------------------------------------------------------
create or replace function public.delete_registration_safely(
  p_registration_id uuid
)
returns boolean
language plpgsql
volatile
security definer
set search_path=public,pg_temp
as $delete_registration$
declare
  v_actor uuid:=auth.uid();
  v_role public.app_role;
  v_registration public.registrations%rowtype;
  v_session_start timestamptz;
begin
  if v_actor is null then
    raise exception 'Bạn chưa đăng nhập.' using errcode='42501';
  end if;

  v_role:=public.current_app_role();

  if v_role is null then
    raise exception 'Tài khoản không còn hoạt động.' using errcode='42501';
  end if;

  select *
  into v_registration
  from public.registrations
  where id=p_registration_id
    and is_deleted=false
  for update;

  if not found then
    return false;
  end if;

  if v_role::text in ('admin','teacher') then
    if not public.can_manage_class(v_registration.class_id) then
      raise exception 'Bạn không có quyền xóa đăng ký của lớp này.'
        using errcode='42501';
    end if;

  elsif v_role::text in ('student','monitor')
        and v_registration.student_id=v_actor
        and v_registration.is_emergency=true then

    v_session_start:=public.study_session_start(
      v_registration.class_id,
      v_registration.week_id,
      v_registration.weekday,
      v_registration.period_number
    );

    if v_session_start is null or now()>=v_session_start then
      raise exception
        'Chỉ được hủy đăng ký bổ sung trước khi buổi tự học bắt đầu.'
        using errcode='42501';
    end if;

  else
    raise exception 'Bạn không có quyền hủy đăng ký này.'
      using errcode='42501';
  end if;

  update public.registrations
  set
    is_deleted=true,
    deleted_at=now(),
    deleted_by=v_actor,
    updated_at=now()
  where id=v_registration.id;

  return true;
end
$delete_registration$;

revoke all
on function public.delete_registration_safely(uuid)
from public,anon;

grant execute
on function public.delete_registration_safely(uuid)
to authenticated,service_role;

-- ---------------------------------------------------------------------
-- 2. Student/monitor UPDATE policy must resolve session time by class.
-- ---------------------------------------------------------------------
drop policy if exists registrations_student_update_v840
on public.registrations;

create policy registrations_student_update_v840
on public.registrations
for update
to authenticated
using (
  public.current_app_role()::text in ('student','monitor')
  and student_id=auth.uid()
  and is_deleted=false
  and class_id=public.current_student_class_id()
  and status in ('draft','submitted','needs_revision','approved')
  and (
    (
      status='needs_revision'
      and revision_overdue_at is null
      and now() < public.study_session_start(
        class_id,
        week_id,
        weekday,
        period_number
      )
    )
    or (
      status<>'needs_revision'
      and public.week_registration_is_open(class_id,week_id)
      and (
        public.registration_deadline_for_slot(class_id,week_id,weekday) is null
        or now() <= public.registration_deadline_for_slot(
          class_id,
          week_id,
          weekday
        )
      )
      and now() < public.study_session_start(
        class_id,
        week_id,
        weekday,
        period_number
      )
    )
  )
)
with check (
  public.current_app_role()::text in ('student','monitor')
  and student_id=auth.uid()
  and class_id=public.current_student_class_id()
  and is_deleted=false
  and revision_overdue_at is null
  and public.registration_emergency_flag_matches(id,is_emergency)
  and status in ('draft','submitted')
);

commit;

-- ---------------------------------------------------------------------
-- Targeted post-repair verification.
-- Both rows and overall_repair must be true.
-- ---------------------------------------------------------------------
with defs as (
  select
    lower(
      regexp_replace(
        coalesce(
          pg_get_functiondef(
            to_regprocedure('public.delete_registration_safely(uuid)')
          ),
          ''
        ),
        '\s+',
        '',
        'g'
      )
    ) as delete_def,
    lower(
      regexp_replace(
        coalesce(
          (
            select qual
            from pg_policies
            where schemaname='public'
              and tablename='registrations'
              and policyname='registrations_student_update_v840'
          ),
          ''
        ),
        '\s+',
        '',
        'g'
      )
    ) as policy_qual
),
checks as (
  select
    'delete_registration_class_specific'::text as item,
    delete_def like
      '%study_session_start(v_registration.class_id,v_registration.week_id,v_registration.weekday,v_registration.period_number)%'
      as ok
  from defs

  union all

  select
    'student_update_policy_class_specific',
    policy_qual like
      '%study_session_start(class_id,week_id,weekday,period_number)%'
  from defs
)
select item,ok,case when ok then 'ok' else 'CHECK_REQUIRED' end as detail
from checks

union all

select
  'overall_repair',
  bool_and(ok),
  case when bool_and(ok) then 'true' else 'false' end
from checks;
