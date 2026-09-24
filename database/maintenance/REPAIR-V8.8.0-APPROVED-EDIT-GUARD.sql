-- V8.8.0 targeted repair
-- Fix: students can never save an edit to a registration once it has been
-- approved. Every such save is rejected by Postgres with a permission error
-- (42501), even though the app explicitly supports "student edits an
-- approved registration -> it reverts to submitted for re-review".
--
-- Root cause: guard_student_registration_update() (trigger
-- trg_05_guard_student_registration_update, BEFORE UPDATE) blanket-rejects
-- any student UPDATE that changes approval_source or approved_at, with no
-- exception for the one case where changing them is legitimate. The
-- frontend's full-row sync (public/supabase-service.js dbReg()) always
-- sends approval_source and a status-derived approved_at on every save, so
-- the moment a previously-approved row is edited, that UPDATE always
-- differs from the stored row on these two columns and the guard trigger
-- always fires -- before apply_smart_approval() (the trigger that is
-- actually supposed to perform this exact reset) even gets a chance to run,
-- because triggers fire in name order and "05_guard" sorts before
-- "apply_smart_approval".
--
-- Fix: allow approval_source/approved_at to change ONLY when the row being
-- edited was previously approved (old.status = 'approved'), and ONLY to
-- their one safe reset value each ('manual' / null -- exactly what
-- apply_smart_approval() forces regardless of what the client sends). Any
-- other attempted value, or any attempt on a row that was not approved, is
-- still rejected exactly as before. No other column's protection changes.
--
-- Safe to rerun. This script does not modify registrations data, timetable
-- assignments, or any other table -- it only replaces one trigger function.

begin;

-- ---------------------------------------------------------------------
-- Preflight: the V8.8.0 class-specific guard function must already exist.
-- ---------------------------------------------------------------------
do $preflight$
begin
  if to_regprocedure('public.guard_student_registration_update()') is null then
    raise exception
      'V8.8.0_NOT_READY: missing public.guard_student_registration_update(). Run the full V8.8.0 upgrade first.';
  end if;

  if to_regclass('public.registrations') is null then
    raise exception 'V8.8.0_NOT_READY: missing public.registrations.';
  end if;
end
$preflight$;

-- ---------------------------------------------------------------------
-- Replace the guard trigger function with the narrowly-scoped fix.
-- ---------------------------------------------------------------------
create or replace function public.guard_student_registration_update()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $guard$
begin
  if auth.uid() is not null
     and public.current_app_role()::text in ('student','monitor')
     and old.student_id=auth.uid()
  then
    -- The only student-side soft delete path is canceling their own
    -- emergency registration before that class session actually starts.
    if old.is_emergency=true and old.is_deleted=false and new.is_deleted=true
       and new.deleted_by=auth.uid() and new.deleted_at is not null
       and now()<public.study_session_start(old.class_id,old.week_id,old.weekday,old.period_number)
       and (to_jsonb(new)-'is_deleted'-'deleted_at'-'deleted_by'-'updated_at')
           =(to_jsonb(old)-'is_deleted'-'deleted_at'-'deleted_by'-'updated_at')
    then return new; end if;

    if new.id is distinct from old.id or new.student_id is distinct from old.student_id
       or new.class_id is distinct from old.class_id or new.week_id is distinct from old.week_id
       or new.weekday is distinct from old.weekday or new.period_number is distinct from old.period_number
    then raise exception 'Không được thay đổi chủ sở hữu, lớp hoặc ô thời khóa biểu của đăng ký.' using errcode='42501'; end if;

    if new.teacher_comment is distinct from old.teacher_comment
       or new.auto_review_reason is distinct from old.auto_review_reason
       or new.ai_review_status is distinct from old.ai_review_status
       or new.ai_decision is distinct from old.ai_decision
       or new.ai_category is distinct from old.ai_category
       or new.ai_confidence is distinct from old.ai_confidence
       or new.ai_revision_status is distinct from old.ai_revision_status
       or new.ai_revision_confidence is distinct from old.ai_revision_confidence
       or new.ai_reason is distinct from old.ai_reason
       or new.ai_model is distinct from old.ai_model
       or new.ai_reviewed_at is distinct from old.ai_reviewed_at
       or new.ai_review_count is distinct from old.ai_review_count
       or new.is_emergency is distinct from old.is_emergency
       or new.emergency_reason is distinct from old.emergency_reason
       or new.emergency_requested_at is distinct from old.emergency_requested_at
       or new.device_detection_source is distinct from old.device_detection_source
       or new.device_detection_confidence is distinct from old.device_detection_confidence
       or new.revision_overdue_at is distinct from old.revision_overdue_at
       or new.approved_by is distinct from old.approved_by
       or new.is_deleted is distinct from old.is_deleted
       or new.deleted_at is distinct from old.deleted_at
       or new.deleted_by is distinct from old.deleted_by
    then raise exception 'Không được thay đổi trường do giáo viên hoặc máy chủ quản lý.' using errcode='42501'; end if;

    -- Resubmitting a previously-approved registration is a supported student
    -- action: apply_smart_approval() always reverts it to 'submitted' and
    -- clears the approval trail, forcing approval_source to 'manual' and
    -- approved_at to null regardless of what the client sends. It is
    -- therefore safe to let exactly that reset shape through here; any other
    -- value for these two columns, on any row, is still rejected.
    if old.status = 'approved' then
      if (new.approval_source is distinct from old.approval_source and new.approval_source is distinct from 'manual')
         or (new.approved_at is distinct from old.approved_at and new.approved_at is not null)
      then raise exception 'Không được thay đổi trường do giáo viên hoặc máy chủ quản lý.' using errcode='42501'; end if;
    else
      if new.approval_source is distinct from old.approval_source
         or new.approved_at is distinct from old.approved_at
      then raise exception 'Không được thay đổi trường do giáo viên hoặc máy chủ quản lý.' using errcode='42501'; end if;
    end if;
  end if;
  return new;
end$guard$;

revoke all on function public.guard_student_registration_update() from public,anon;
grant execute on function public.guard_student_registration_update() to authenticated,service_role;

commit;

-- ---------------------------------------------------------------------
-- Targeted post-repair verification.
-- ---------------------------------------------------------------------
with def as (
  select lower(regexp_replace(
    coalesce(pg_get_functiondef(to_regprocedure('public.guard_student_registration_update()')),''),
    '\s+','','g'
  )) as guard_def
),
checks as (
  select 'class_aware_session_check_kept'::text as item,
    guard_def like '%study_session_start(old.class_id,old.week_id,old.weekday,old.period_number)%' as ok
  from def
  union all
  select 'approved_edit_reset_allowed',
    guard_def like '%ifold.status=''approved''then%'
    and guard_def like '%new.approval_sourceisdistinctfrom''manual''%'
    and guard_def like '%new.approved_atisnotnull%'
  from def
  union all
  select 'approval_source_no_longer_in_blanket_block',
    guard_def not like '%new.approval_sourceisdistinctfromold.approval_source%new.auto_review_reason%'
  from def
)
select item,ok,case when ok then 'ok' else 'CHECK_REQUIRED' end as detail
from checks
union all
select 'overall_repair', bool_and(ok), case when bool_and(ok) then 'true' else 'false' end
from checks;
