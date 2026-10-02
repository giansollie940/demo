-- SEC-REGISTRATION-INSERT-001
-- Additive INSERT boundary; existing rows, UPDATE guards, RLS and approval
-- pipeline are unchanged. The 02 prefix runs after class validation and before
-- device calculation / smart approval / all AFTER side effects.
begin;

create or replace function public.normalize_student_registration_insert()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  -- auth.uid() survives SECURITY DEFINER. Never infer a trusted caller from
  -- current_user: inside this function it is the function owner. A service
  -- writer with no student JWT keeps its existing pipeline and permissions.
  if auth.uid() is not null
     and public.current_app_role()::text in ('student', 'monitor') then
    -- Smart approval can turn a self-approved row into submitted before RLS.
    -- Reject that input here rather than making an invalid INSERT pass policy.
    if new.status is null or new.status::text not in ('draft', 'submitted') then
      raise exception 'Student registrations must start as draft or submitted.'
        using errcode = '42501';
    end if;

    new.teacher_comment := null;
    new.ai_review_count := 0;
    new.approval_source := 'manual';
    new.approved_by := null;
    new.approved_at := null;
    new.ai_review_status := 'not_needed';
    new.ai_decision := null;
    new.ai_category := null;
    new.ai_confidence := null;
    new.ai_revision_status := null;
    new.ai_revision_confidence := null;
    new.ai_reason := null;
    new.ai_model := null;
    new.ai_reviewed_at := null;
    new.auto_review_reason := null;
    new.revision_overdue_at := null;
    new.device_detection_source := 'none';
    new.device_detection_confidence := null;

    -- Do not rewrite owner/class/status/deletion/emergency flags or timestamps.
    -- Existing policy/RPC checks remain responsible for them. The next device
    -- trigger computes effective_uses_electronic_device; smart approval derives
    -- submitted AI/manual state from the class configuration.
  end if;
  return new;
end;
$function$;

-- Explicitly revoke Supabase default-privilege grants as well as PUBLIC.
-- Trigger execution needs no direct EXECUTE grant on this helper.
revoke all on function public.normalize_student_registration_insert()
  from public, anon, authenticated, service_role;

drop trigger if exists trg_02_normalize_student_registration_insert on public.registrations;
create trigger trg_02_normalize_student_registration_insert
before insert on public.registrations
for each row execute function public.normalize_student_registration_insert();

comment on function public.normalize_student_registration_insert() is
  'SEC-REGISTRATION-INSERT-001: normalize student/monitor teacher and AI metadata before approval; preserve trusted writers and existing UPDATE guards.';

commit;
