-- ============================================================================
-- FEAT-010 test baseline — the registration subsystem, as production has it.
--
-- WHY THIS FILE EXISTS
-- The shared harness (tests/homework/fixture.mjs) models only what the homework
-- subsystem needs: six stub tables and auth.uid(). FEAT-010 lives on the other
-- side of the app — registrations, weeks, the timetable and the trigger chain
-- that runs on every registration write — and none of that is in the harness.
--
-- The repository cannot rebuild it either: `database/fresh-install/01-INSTALL-…`
-- is an *upgrade from a baseline*, and it refuses to run unless profiles, weeks,
-- registrations and periods already exist. That pre-baseline schema is not in
-- the repository.
--
-- So this file is built the only honest way available: every column shape,
-- constraint, function body, trigger and RLS policy below was read out of the
-- live database (`qhqqujozpqopahxscpks`) on 2026-09-19 with read-only catalog
-- queries — `information_schema.columns`, `pg_get_constraintdef`,
-- `pg_get_functiondef`, `pg_get_triggerdef`, `pg_policies` — and pasted here
-- verbatim. Nothing below was written from memory or inferred from the app.
--
-- WHAT THAT BUYS, AND WHAT IT DOES NOT
-- It buys: the four triggers that fire on a registration write, the four RLS
-- policies that gate one, and the session-start resolver that decides whether a
-- session has begun, all behave in the harness exactly as they behave in
-- production. Those are the objects FEAT-010 has to not break.
-- It does not buy: a complete copy of the database. Tables FEAT-010 never
-- touches are absent, and so is Supabase's auth stack (auth.users is a stub with
-- the one column profiles references). A test that needs something not here will
-- fail loudly rather than pass against a fiction.
--
-- PROVENANCE, CHECKED RATHER THAN CLAIMED
-- Production stores these bodies with CRLF line endings (they were applied from
-- a Windows copy); this file uses LF. So the comparison normalises line endings
-- on both sides and then compares md5 — the same technique that identified the
-- RC1 install of FEAT-007. On production:
--
--   select md5(replace(prosrc, chr(13)||chr(10), chr(10))),
--          proname||'('||pg_get_function_identity_arguments(oid)||')'
--   from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--   where n.nspname='public' and proname in (…);
--
-- All 18 behavioural objects below matched production on 2026-09-19:
--
--   bc9060953d6d11f96fffca9ee512a7d4  ai_automation_is_enabled(uuid)
--   8b4745ceb3832a09be3eb6461c826f91  apply_smart_approval()
--   c1cb3d1aaa7c4efc5c8d9b1575273874  can_manage_class(uuid)
--   78c8e40ed1cd50f4ab86cba575d87647  capture_ai_teacher_feedback()
--   88d6828804296dee94124622750f214b  class_week_effective_status(uuid,uuid)
--   cdb5684766cb9b9f26e66b60107e549e  current_app_role()
--   8e77df2c22eb5765f7c8ace308fea37d  current_student_class_id()
--   ddd32dab3610110359100cc8b5067593  guard_student_registration_update()
--   7e98ce482dd9869fff10b60d18d7a99a  is_root_admin()
--   d23d0d8a298831e8af208f5f162764da  registration_deadline_for_slot(uuid,uuid,int)
--   adca1ceeeb141186bf2a7475534de280  registration_emergency_flag_matches(uuid,bool)
--   8ff34b924e74174f14e3d5bc8d427a5f  resolved_timetable_periods(uuid,date)
--   a2e5c29dff13134b0675b39d4b9175c7  set_registration_class_id()
--   44508fd4b65c671b84c145aa35e4dc44  study_session_start(uuid,uuid,int,int)
--   d8b77925f4e7bba06054d0f45a54cba2  sync_teacher_review_notification()
--   f2963e2e170c4c00a0c95d6acfeae935  teacher_has_class(uuid)
--   b1300f8b6bcebeae0537cb8c40a2a441  validate_registration_class_week()
--   8002a4918f0c20752ee8a7a7d0fccedf  week_registration_is_open(uuid,uuid)
--
-- Production also has student-scoped overloads — study_session_start(3-arg),
-- registration_deadline_for_slot(week,weekday) and week_registration_is_open(week)
-- — which just forward to the class-scoped ones above with
-- current_student_class_id(). No RLS policy or trigger on registrations calls
-- them, so they are deliberately absent: a test that reached for one would get a
-- missing-function error rather than silently exercise a second code path.
-- ============================================================================

-- pgcrypto is a production extension; gen_random_uuid() is core since PG13 and
-- is all this baseline needs from it, so the harness does not load it.

create role anon;
create role authenticated;
create role service_role bypassrls;

create schema if not exists auth;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as
  $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;

create type public.app_role as enum ('student','monitor','teacher','admin');
create type public.registration_status as enum ('draft','submitted','needs_revision','approved');
create type public.week_status as enum ('upcoming','open','locked','holiday');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.school_years (
  id uuid default gen_random_uuid() not null,
  name text not null,
  start_date date not null,
  end_date date not null,
  is_active boolean default false not null,
  created_at timestamp with time zone default now() not null,
  archive_state text default 'active'::text not null
);

create table public.classes (
  id uuid default gen_random_uuid() not null,
  school_year_id uuid not null,
  code text not null,
  name text not null,
  active boolean default true not null,
  created_by uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  grade smallint not null
);

create table public.profiles (
  id uuid not null,
  student_code text,
  full_name text not null,
  email text,
  role public.app_role default 'student'::public.app_role not null,
  class_name text default '10A1'::text,
  active boolean default true not null,
  created_at timestamp with time zone default now() not null,
  class_id uuid,
  deleted_at timestamp with time zone,
  avatar_path text
);

create table public.class_teachers (
  class_id uuid not null,
  teacher_id uuid not null,
  active boolean default true not null,
  assigned_by uuid,
  assigned_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table public.class_settings (
  class_id uuid not null,
  ai_automation_enabled boolean default true not null,
  ai_auto_approve_threshold numeric default 0.90 not null,
  ai_revision_auto_approve_threshold numeric default 0.85 not null,
  ai_feedback_memory_enabled boolean default true not null,
  per_session_deadline_time time without time zone default '20:00:00'::time without time zone not null,
  announcement text default 'Chuẩn bị nội dung tự học trước hạn.'::text not null,
  updated_by uuid,
  updated_at timestamp with time zone default now() not null,
  default_deadline_mode text default 'per_session_20'::text not null
);

create table public.weeks (
  id uuid default gen_random_uuid() not null,
  school_year_id uuid not null,
  week_number integer not null,
  start_date date not null,
  end_date date not null,
  status public.week_status default 'upcoming'::public.week_status not null,
  registration_deadline timestamp with time zone,
  note text,
  deadline_mode text default 'per_session_20'::text not null
);

create table public.class_weeks (
  class_id uuid not null,
  week_id uuid not null,
  status public.week_status not null,
  deadline_mode text default 'per_session_20'::text not null,
  registration_deadline timestamp with time zone,
  note text,
  updated_by uuid,
  updated_at timestamp with time zone default now() not null,
  manual_status public.week_status
);

create table public.periods (
  period_number integer not null,
  start_time time without time zone not null,
  end_time time without time zone not null
);

create table public.school_year_periods (
  school_year_id uuid not null,
  period_number integer not null,
  start_time time without time zone not null,
  end_time time without time zone not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table public.timetable_templates (
  id uuid default gen_random_uuid() not null,
  school_year_id uuid not null,
  name text not null,
  active boolean default true not null,
  created_by uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table public.timetable_template_versions (
  id uuid default gen_random_uuid() not null,
  template_id uuid not null,
  version_number integer not null,
  config jsonb not null,
  created_by uuid,
  created_at timestamp with time zone default now() not null
);

create table public.timetable_version_periods (
  version_id uuid not null,
  weekday smallint not null,
  period_number smallint not null,
  start_time time without time zone not null,
  end_time time without time zone not null,
  session text default 'day'::text not null
);

create table public.class_timetable_assignments (
  id uuid default gen_random_uuid() not null,
  class_id uuid not null,
  school_year_id uuid not null,
  template_version_id uuid not null,
  effective_from date not null,
  effective_to date not null,
  active boolean default true not null,
  created_by uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table public.study_schedule (
  id uuid default gen_random_uuid() not null,
  weekday integer not null,
  period_number integer not null,
  is_study_period boolean default true not null,
  class_id uuid
);

create table public.week_schedule_overrides (
  id uuid default gen_random_uuid() not null,
  week_id uuid not null,
  weekday integer not null,
  period_number integer not null,
  is_study_period boolean default true not null,
  reason text,
  class_id uuid
);

create table public.registrations (
  id uuid default gen_random_uuid() not null,
  student_id uuid not null,
  week_id uuid not null,
  weekday integer not null,
  period_number integer not null,
  content text not null,
  note text,
  status public.registration_status default 'draft'::public.registration_status not null,
  teacher_comment text,
  submitted_at timestamp with time zone,
  updated_at timestamp with time zone default now() not null,
  approved_at timestamp with time zone,
  approved_by uuid,
  is_deleted boolean default false not null,
  deleted_at timestamp with time zone,
  deleted_by uuid,
  approval_source text default 'manual'::text not null,
  auto_review_reason text,
  ai_review_status text default 'not_needed'::text not null,
  ai_decision text,
  ai_category text,
  ai_confidence numeric,
  ai_reason text,
  ai_model text,
  ai_reviewed_at timestamp with time zone,
  ai_review_count integer default 0 not null,
  is_emergency boolean default false not null,
  emergency_reason text,
  emergency_requested_at timestamp with time zone,
  uses_electronic_device boolean default false not null,
  device_detection_source text default 'none'::text not null,
  device_detection_confidence numeric,
  revision_overdue_at timestamp with time zone,
  ai_revision_status text,
  ai_revision_confidence numeric,
  class_id uuid
);

create table public.teacher_notifications (
  id uuid default gen_random_uuid() not null,
  registration_id uuid not null,
  student_id uuid not null,
  week_id uuid not null,
  notification_type text default 'manual_review'::text not null,
  title text not null,
  message text,
  is_read boolean default false not null,
  created_at timestamp with time zone default now() not null,
  class_id uuid
);

create table public.ai_review_feedback (
  id bigint generated by default as identity not null,
  registration_id uuid,
  teacher_id uuid,
  feedback_type text not null,
  content text not null,
  note text,
  teacher_comment text,
  ai_decision text,
  ai_category text,
  ai_confidence numeric,
  ai_reason text,
  created_at timestamp with time zone default now() not null,
  ai_revision_status text,
  ai_revision_confidence numeric,
  class_id uuid
);

create table public.audit_logs (
  id bigint generated by default as identity not null,
  actor_id uuid,
  action text not null,
  entity_type text not null,
  entity_id text,
  old_data jsonb,
  new_data jsonb,
  created_at timestamp with time zone default now() not null,
  class_id uuid,
  source text default 'server'::text not null
);

-- ---------------------------------------------------------------------------
-- Constraints, verbatim from pg_get_constraintdef on production
-- ---------------------------------------------------------------------------

alter table public.school_years add constraint school_years_pkey primary key (id);
alter table public.school_years add constraint school_years_name_key unique (name);
alter table public.school_years add constraint school_years_archive_state_check check ((archive_state = any (array['active'::text, 'archiving'::text, 'archived_read_only'::text])));

alter table public.classes add constraint classes_pkey primary key (id);
alter table public.classes add constraint classes_school_year_id_code_key unique (school_year_id, code);
alter table public.classes add constraint classes_school_year_id_fkey foreign key (school_year_id) references school_years(id) on delete restrict;
alter table public.classes add constraint classes_grade_v1 check (((grade >= 6) and (grade <= 12)));
alter table public.classes add constraint classes_code_nonempty check (((length(btrim(code)) >= 1) and (length(btrim(code)) <= 40)));
alter table public.classes add constraint classes_name_nonempty check (((length(btrim(name)) >= 1) and (length(btrim(name)) <= 120)));

alter table public.profiles add constraint profiles_pkey primary key (id);
alter table public.profiles add constraint profiles_id_fkey foreign key (id) references auth.users(id) on delete cascade;
alter table public.profiles add constraint profiles_student_code_key unique (student_code);
alter table public.profiles add constraint profiles_class_id_fkey foreign key (class_id) references classes(id) on delete restrict;
alter table public.classes add constraint classes_created_by_fkey foreign key (created_by) references profiles(id) on delete set null;

alter table public.class_teachers add constraint class_teachers_pkey primary key (class_id, teacher_id);
alter table public.class_teachers add constraint class_teachers_class_id_fkey foreign key (class_id) references classes(id) on delete cascade;
alter table public.class_teachers add constraint class_teachers_teacher_id_fkey foreign key (teacher_id) references profiles(id) on delete cascade;
alter table public.class_teachers add constraint class_teachers_assigned_by_fkey foreign key (assigned_by) references profiles(id) on delete set null;

alter table public.class_settings add constraint class_settings_pkey primary key (class_id);
alter table public.class_settings add constraint class_settings_class_id_fkey foreign key (class_id) references classes(id) on delete cascade;
alter table public.class_settings add constraint class_settings_updated_by_fkey foreign key (updated_by) references profiles(id) on delete set null;
alter table public.class_settings add constraint class_settings_default_deadline_mode_check check ((default_deadline_mode = any (array['per_session_20'::text, 'week_before_20'::text])));

alter table public.weeks add constraint weeks_pkey primary key (id);
alter table public.weeks add constraint weeks_school_year_id_week_number_key unique (school_year_id, week_number);
alter table public.weeks add constraint weeks_school_year_id_fkey foreign key (school_year_id) references school_years(id) on delete cascade;
alter table public.weeks add constraint weeks_week_number_check check ((week_number > 0));
alter table public.weeks add constraint weeks_deadline_mode_check check ((deadline_mode = any (array['per_session_20'::text, 'week_before_20'::text, 'specific'::text])));

alter table public.class_weeks add constraint class_weeks_pkey primary key (class_id, week_id);
alter table public.class_weeks add constraint class_weeks_class_id_fkey foreign key (class_id) references classes(id) on delete cascade;
alter table public.class_weeks add constraint class_weeks_week_id_fkey foreign key (week_id) references weeks(id) on delete cascade;
alter table public.class_weeks add constraint class_weeks_updated_by_fkey foreign key (updated_by) references profiles(id) on delete set null;
alter table public.class_weeks add constraint class_weeks_deadline_mode_check check ((deadline_mode = any (array['inherit'::text, 'per_session_20'::text, 'week_before_20'::text, 'specific'::text])));
alter table public.class_weeks add constraint class_weeks_manual_status_check check (((manual_status is null) or (manual_status = any (array['open'::public.week_status, 'locked'::public.week_status]))));

alter table public.periods add constraint periods_pkey primary key (period_number);
alter table public.periods add constraint periods_period_number_check check (((period_number >= 1) and (period_number <= 9)));

alter table public.school_year_periods add constraint school_year_periods_pkey primary key (school_year_id, period_number);
alter table public.school_year_periods add constraint school_year_periods_school_year_id_fkey foreign key (school_year_id) references school_years(id) on delete cascade;
alter table public.school_year_periods add constraint school_year_periods_period_number_check check (((period_number >= 1) and (period_number <= 20)));
alter table public.school_year_periods add constraint school_year_periods_time_check check ((start_time < end_time));

alter table public.timetable_templates add constraint timetable_templates_pkey primary key (id);
alter table public.timetable_templates add constraint timetable_templates_name_unique unique (school_year_id, name);
alter table public.timetable_templates add constraint timetable_templates_school_year_id_fkey foreign key (school_year_id) references school_years(id) on delete cascade;
alter table public.timetable_templates add constraint timetable_templates_created_by_fkey foreign key (created_by) references profiles(id) on delete set null;
alter table public.timetable_templates add constraint timetable_templates_name_not_blank check ((btrim(name) <> ''::text));

alter table public.timetable_template_versions add constraint timetable_template_versions_pkey primary key (id);
alter table public.timetable_template_versions add constraint timetable_template_versions_unique unique (template_id, version_number);
alter table public.timetable_template_versions add constraint timetable_template_versions_template_id_fkey foreign key (template_id) references timetable_templates(id) on delete cascade;
alter table public.timetable_template_versions add constraint timetable_template_versions_created_by_fkey foreign key (created_by) references profiles(id) on delete set null;
alter table public.timetable_template_versions add constraint timetable_template_versions_version_number_check check ((version_number > 0));
alter table public.timetable_template_versions add constraint timetable_template_versions_config_object check ((jsonb_typeof(config) = 'object'::text));

alter table public.timetable_version_periods add constraint timetable_version_periods_pkey primary key (version_id, weekday, period_number);
alter table public.timetable_version_periods add constraint timetable_version_periods_version_id_fkey foreign key (version_id) references timetable_template_versions(id) on delete cascade;
alter table public.timetable_version_periods add constraint timetable_version_periods_weekday_check check (((weekday >= 1) and (weekday <= 7)));
alter table public.timetable_version_periods add constraint timetable_version_periods_period_number_check check (((period_number >= 1) and (period_number <= 40)));
alter table public.timetable_version_periods add constraint timetable_version_periods_session_check check ((session = any (array['morning'::text, 'afternoon'::text, 'day'::text])));
alter table public.timetable_version_periods add constraint timetable_version_periods_time_check check ((start_time < end_time));

alter table public.class_timetable_assignments add constraint class_timetable_assignments_pkey primary key (id);
alter table public.class_timetable_assignments add constraint class_timetable_assignments_class_id_fkey foreign key (class_id) references classes(id) on delete cascade;
alter table public.class_timetable_assignments add constraint class_timetable_assignments_school_year_id_fkey foreign key (school_year_id) references school_years(id) on delete cascade;
alter table public.class_timetable_assignments add constraint class_timetable_assignments_template_version_id_fkey foreign key (template_version_id) references timetable_template_versions(id) on delete restrict;
alter table public.class_timetable_assignments add constraint class_timetable_assignments_created_by_fkey foreign key (created_by) references profiles(id) on delete set null;
alter table public.class_timetable_assignments add constraint class_timetable_assignments_range check ((effective_from <= effective_to));

alter table public.study_schedule add constraint study_schedule_pkey primary key (id);
alter table public.study_schedule add constraint study_schedule_class_id_fkey foreign key (class_id) references classes(id) on delete cascade;
alter table public.study_schedule add constraint study_schedule_period_number_fkey foreign key (period_number) references periods(period_number);
alter table public.study_schedule add constraint study_schedule_weekday_check check (((weekday >= 1) and (weekday <= 5)));

alter table public.week_schedule_overrides add constraint week_schedule_overrides_pkey primary key (id);
alter table public.week_schedule_overrides add constraint week_schedule_overrides_class_id_fkey foreign key (class_id) references classes(id) on delete cascade;
alter table public.week_schedule_overrides add constraint week_schedule_overrides_week_id_fkey foreign key (week_id) references weeks(id) on delete cascade;
alter table public.week_schedule_overrides add constraint week_schedule_overrides_period_number_fkey foreign key (period_number) references periods(period_number);
alter table public.week_schedule_overrides add constraint week_schedule_overrides_weekday_check check (((weekday >= 1) and (weekday <= 5)));

alter table public.registrations add constraint registrations_pkey primary key (id);
alter table public.registrations add constraint registrations_student_id_fkey foreign key (student_id) references profiles(id) on delete cascade;
alter table public.registrations add constraint registrations_week_id_fkey foreign key (week_id) references weeks(id) on delete cascade;
alter table public.registrations add constraint registrations_class_id_fkey foreign key (class_id) references classes(id) on delete restrict;
alter table public.registrations add constraint registrations_period_number_fkey foreign key (period_number) references periods(period_number);
alter table public.registrations add constraint registrations_approved_by_fkey foreign key (approved_by) references profiles(id);
alter table public.registrations add constraint registrations_deleted_by_fkey foreign key (deleted_by) references profiles(id);
alter table public.registrations add constraint registrations_weekday_check check (((weekday >= 1) and (weekday <= 5)));
alter table public.registrations add constraint registrations_content_check check (((length(content) >= 1) and (length(content) <= 500)));
alter table public.registrations add constraint registrations_approval_source_check check ((approval_source = any (array['manual'::text, 'auto_rule'::text, 'ai'::text])));
alter table public.registrations add constraint registrations_ai_review_status_check check ((ai_review_status = any (array['not_needed'::text, 'pending'::text, 'processing'::text, 'completed'::text, 'error'::text])));
alter table public.registrations add constraint registrations_ai_decision_check check (((ai_decision is null) or (ai_decision = any (array['auto_approve'::text, 'request_revision'::text, 'manual_review'::text]))));
alter table public.registrations add constraint registrations_ai_revision_status_check check (((ai_revision_status is null) or (ai_revision_status = any (array['satisfied'::text, 'not_satisfied'::text, 'uncertain'::text]))));
alter table public.registrations add constraint registrations_ai_revision_confidence_check check (((ai_revision_confidence is null) or ((ai_revision_confidence >= (0)::numeric) and (ai_revision_confidence <= (1)::numeric))));
alter table public.registrations add constraint registrations_device_detection_source_check check ((device_detection_source = any (array['none'::text, 'student'::text, 'rule'::text, 'ai'::text])));
alter table public.registrations add constraint registrations_device_detection_confidence_check check (((device_detection_confidence is null) or ((device_detection_confidence >= (0)::numeric) and (device_detection_confidence <= (1)::numeric))));

alter table public.teacher_notifications add constraint teacher_notifications_pkey primary key (id);
alter table public.teacher_notifications add constraint teacher_notifications_registration_id_notification_type_key unique (registration_id, notification_type);
alter table public.teacher_notifications add constraint teacher_notifications_registration_id_fkey foreign key (registration_id) references registrations(id) on delete cascade;
alter table public.teacher_notifications add constraint teacher_notifications_student_id_fkey foreign key (student_id) references profiles(id) on delete cascade;
alter table public.teacher_notifications add constraint teacher_notifications_week_id_fkey foreign key (week_id) references weeks(id) on delete cascade;
alter table public.teacher_notifications add constraint teacher_notifications_class_id_fkey foreign key (class_id) references classes(id) on delete cascade;

alter table public.ai_review_feedback add constraint ai_review_feedback_pkey primary key (id);
alter table public.ai_review_feedback add constraint ai_review_feedback_registration_id_fkey foreign key (registration_id) references registrations(id) on delete set null;
alter table public.ai_review_feedback add constraint ai_review_feedback_teacher_id_fkey foreign key (teacher_id) references profiles(id) on delete set null;
alter table public.ai_review_feedback add constraint ai_review_feedback_class_id_fkey foreign key (class_id) references classes(id) on delete set null;
alter table public.ai_review_feedback add constraint ai_review_feedback_type_check check ((feedback_type = any (array['teacher_revision_after_ai_approve'::text, 'teacher_approve_after_ai_manual'::text, 'teacher_approve_after_ai_revision'::text, 'legacy_revision_after_ai_approve'::text])));

alter table public.audit_logs add constraint audit_logs_pkey primary key (id);
alter table public.audit_logs add constraint audit_logs_actor_id_fkey foreign key (actor_id) references profiles(id) on delete set null;
alter table public.audit_logs add constraint audit_logs_class_id_fkey foreign key (class_id) references classes(id) on delete set null;
alter table public.audit_logs add constraint audit_logs_source_check check ((source = any (array['server'::text, 'client'::text, 'system'::text])));

-- ---------------------------------------------------------------------------
-- Functions, verbatim from pg_get_functiondef on production.
-- CRLF line endings are preserved so md5(prosrc) matches production exactly.
-- ---------------------------------------------------------------------------

create or replace function public.current_app_role() returns public.app_role
 language sql stable security definer set search_path to 'public'
as $function$
  select role from public.profiles where id=auth.uid() and active=true
$function$;

create or replace function public.is_root_admin() returns boolean
 language sql stable security definer set search_path to 'public'
as $function$
  select coalesce(public.current_app_role()::text='admin',false)
$function$;

create or replace function public.teacher_has_class(p_class_id uuid) returns boolean
 language sql stable security definer set search_path to 'public'
as $function$
  select coalesce(exists(
    select 1
    from public.class_teachers ct
    join public.classes c on c.id=ct.class_id and c.active=true
    where ct.teacher_id=auth.uid() and ct.class_id=p_class_id and ct.active=true
  ),false)
$function$;

create or replace function public.can_manage_class(p_class_id uuid) returns boolean
 language sql stable security definer set search_path to 'public'
as $function$
  select public.is_root_admin() or public.teacher_has_class(p_class_id)
$function$;

create or replace function public.current_student_class_id() returns uuid
 language sql stable security definer set search_path to 'public'
as $function$
  select class_id from public.profiles where id=auth.uid() and active=true and role::text in ('student','monitor')
$function$;

create or replace function public.ai_automation_is_enabled(p_class_id uuid) returns boolean
 language sql stable security definer set search_path to 'public'
as $function$
  select coalesce((select ai_automation_enabled from public.class_settings where class_id=p_class_id),false)
$function$;

create or replace function public.resolved_timetable_periods(p_class_id uuid, p_date date)
 returns table(period_number smallint, start_time time without time zone, end_time time without time zone, session text)
 language sql stable security definer set search_path to 'public'
as $function$
  select vp.period_number,vp.start_time,vp.end_time,vp.session
  from public.class_timetable_assignments a
  join public.timetable_version_periods vp on vp.version_id=a.template_version_id
  where a.class_id=p_class_id and a.active and p_date between a.effective_from and a.effective_to
    and vp.weekday=extract(isodow from p_date)::int
  order by vp.period_number
$function$;

create or replace function public.study_session_start(p_class_id uuid, p_week_id uuid, p_weekday integer, p_period_number integer)
 returns timestamp with time zone
 language sql stable security definer set search_path to 'public'
as $function$
  select ((day_date::timestamp+coalesce(tp.start_time,yp.start_time,p.start_time)) at time zone 'Asia/Ho_Chi_Minh')
  from public.weeks w
  cross join lateral (select w.start_date+(greatest(1,least(7,p_weekday))-1) day_date) d
  left join lateral (
    select r.start_time from public.resolved_timetable_periods(p_class_id,d.day_date) r where r.period_number=p_period_number limit 1
  ) tp on true
  left join public.school_year_periods yp on yp.school_year_id=w.school_year_id and yp.period_number=p_period_number
  left join public.periods p on p.period_number=p_period_number
  where w.id=p_week_id and coalesce(tp.start_time,yp.start_time,p.start_time) is not null
$function$;

create or replace function public.class_week_effective_status(p_class_id uuid, p_week_id uuid)
 returns public.week_status
 language plpgsql stable security definer set search_path to 'public', 'pg_temp'
as $function$
declare v_year_id uuid;v_target_start date;v_target_status public.week_status;v_manual_status public.week_status;v_first_start date;v_target_seq int;v_current_seq int;
begin
  select w.school_year_id,w.start_date,cw.status,cw.manual_status into v_year_id,v_target_start,v_target_status,v_manual_status
  from public.weeks w join public.class_weeks cw on cw.week_id=w.id and cw.class_id=p_class_id where w.id=p_week_id;
  if not found then return null;end if;if v_target_status='holiday' then return 'holiday';end if;if v_manual_status='open' then return 'open';end if;if v_manual_status='locked' then return 'locked';end if;
  select min(start_date) into v_first_start from public.weeks where school_year_id=v_year_id;
  if (now() at time zone 'Asia/Ho_Chi_Minh')::date<v_first_start then return 'upcoming';end if;
  select count(*)::int into v_target_seq from public.weeks w where w.school_year_id=v_year_id and (w.start_date<v_target_start or(w.start_date=v_target_start and w.id<=p_week_id));
  with calendar as(
    select w.id,row_number()over(order by w.start_date,w.week_number,w.id)::int seq,
      coalesce((select max(((w.start_date+(slot.weekday-1))::timestamp+coalesce(tp.end_time,yp.end_time,p.end_time)) at time zone 'Asia/Ho_Chi_Minh')
        from(
          select o.weekday,o.period_number from public.week_schedule_overrides o where o.class_id=p_class_id and o.week_id=w.id and o.is_study_period=true
          union all select s.weekday,s.period_number from public.study_schedule s where s.class_id=p_class_id and s.is_study_period=true and not exists(select 1 from public.week_schedule_overrides ox where ox.class_id=p_class_id and ox.week_id=w.id)
        )slot
        left join lateral(select r.end_time from public.resolved_timetable_periods(p_class_id,w.start_date+(slot.weekday-1)) r where r.period_number=slot.period_number limit 1)tp on true
        left join public.school_year_periods yp on yp.school_year_id=w.school_year_id and yp.period_number=slot.period_number
        left join public.periods p on p.period_number=slot.period_number
        where coalesce(tp.end_time,yp.end_time,p.end_time)is not null),(w.end_date+time '23:59:59') at time zone 'Asia/Ho_Chi_Minh') end_ts
    from public.weeks w where w.school_year_id=v_year_id)
  select seq into v_current_seq from calendar where now()<end_ts order by seq limit 1;
  if v_current_seq is null then return 'locked';end if;if v_target_seq<v_current_seq then return 'locked';end if;if v_target_seq in(v_current_seq,v_current_seq+1) then return 'open';end if;return 'upcoming';
end$function$;

create or replace function public.week_registration_is_open(p_class_id uuid, p_week_id uuid) returns boolean
 language sql stable security definer set search_path to 'public'
as $function$
  select coalesce(
    exists(select 1 from public.classes c where c.id=p_class_id and c.active=true)
    and public.class_week_effective_status(p_class_id,p_week_id)='open'::public.week_status,
    false
  )
$function$;

create or replace function public.registration_deadline_for_slot(p_class_id uuid, p_week_id uuid, p_weekday integer)
 returns timestamp with time zone
 language sql stable security definer set search_path to 'public'
as $function$
  select case coalesce(nullif(cw.deadline_mode,'inherit'),cs.default_deadline_mode,'per_session_20')
    when 'per_session_20' then
      ((w.start_date+(greatest(1,least(5,p_weekday))-1)-1
        + coalesce(cs.per_session_deadline_time,time '20:00')) at time zone 'Asia/Ho_Chi_Minh')
    when 'week_before_20' then
      ((w.start_date-1 + coalesce(cs.per_session_deadline_time,time '20:00')) at time zone 'Asia/Ho_Chi_Minh')
    when 'specific' then cw.registration_deadline
    else cw.registration_deadline
  end
  from public.weeks w
  left join public.class_weeks cw on cw.week_id=w.id and cw.class_id=p_class_id
  left join public.class_settings cs on cs.class_id=p_class_id
  where w.id=p_week_id
$function$;

create or replace function public.registration_emergency_flag_matches(p_registration_id uuid, p_flag boolean) returns boolean
 language sql stable security definer set search_path to 'public'
as $function$
  select coalesce(
    (select r.is_emergency=p_flag
     from public.registrations r
     where r.id=p_registration_id),
    false
  )
$function$;

create or replace function public.set_registration_class_id() returns trigger
 language plpgsql security definer set search_path to 'public'
as $function$
declare v_class uuid;
begin
  if tg_op='UPDATE' then new.class_id:=old.class_id; return new; end if;
  select p.class_id into v_class
  from public.profiles p
  join public.classes c on c.id=p.class_id and c.active=true
  where p.id=new.student_id and p.active=true and p.role::text in ('student','monitor');
  if v_class is null then raise exception 'REGISTRATION_STUDENT_HAS_NO_ACTIVE_CLASS'; end if;
  new.class_id:=v_class;
  return new;
end; $function$;

create or replace function public.validate_registration_class_week() returns trigger
 language plpgsql security definer set search_path to 'public'
as $function$
begin
  if new.class_id is null then
    raise exception 'REGISTRATION_CLASS_REQUIRED';
  end if;
  if not exists(
    select 1
    from public.classes c
    join public.weeks w on w.id=new.week_id
    where c.id=new.class_id
      and c.school_year_id=w.school_year_id
  ) then
    raise exception 'REGISTRATION_CLASS_WEEK_MISMATCH';
  end if;
  return new;
end; $function$;

create or replace function public.guard_student_registration_update() returns trigger
 language plpgsql security definer set search_path to 'public'
as $function$
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
end$function$;

create or replace function public.apply_smart_approval() returns trigger
 language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_enabled boolean:=public.ai_automation_is_enabled(new.class_id);
  v_should_review boolean:=false;
  v_force boolean:=coalesce(current_setting('app.force_ai_rereview',true),'')='on';
begin
  if v_force and (public.is_root_admin() or public.teacher_has_class(new.class_id)) then
    new.status:='submitted'; new.approval_source:='manual'; new.ai_review_status:=case when v_enabled then 'pending' else 'not_needed' end;
    new.ai_decision:=null; new.ai_category:=null; new.ai_confidence:=null; new.ai_revision_status:=null; new.ai_revision_confidence:=null;
    new.ai_reason:=null; new.ai_model:=null; new.ai_reviewed_at:=null; new.approved_at:=null; new.approved_by:=null;
    new.auto_review_reason:=case when v_enabled then 'GV/Admin chủ động yêu cầu AI duyệt lại.' else 'AI đang tắt; chuyển giáo viên duyệt.' end;
    return new;
  end if;

  if tg_op='UPDATE' and new.status='needs_revision' and old.status is distinct from 'needs_revision'
     and (public.is_root_admin() or public.teacher_has_class(new.class_id)) then
    new.revision_overdue_at:=null; new.approval_source:='manual'; new.ai_review_status:='not_needed';
    new.ai_decision:=null; new.ai_category:=null; new.ai_confidence:=null; new.ai_revision_status:=null; new.ai_revision_confidence:=null;
    new.ai_reason:=null; new.ai_model:=null; new.ai_reviewed_at:=null; new.approved_at:=null; new.approved_by:=null;
  end if;

  if auth.uid()=new.student_id and new.status='approved' then
    new.status:='submitted'; new.approval_source:='manual'; new.approved_at:=null; new.approved_by:=null;
  end if;

  -- HS sửa một đăng ký đã duyệt: bản ghi phải quay về đúng trạng thái của một
  -- đăng ký mới, nên xoá luôn phản hồi cũ của giáo viên (phản hồi đó gắn với
  -- nội dung vừa bị thay). Nhờ vậy auto_review_reason bên dưới cũng rơi vào
  -- nhánh "đăng ký mới" thay vì "HS đã sửa theo phản hồi GV".
  -- ai_review_count cố ý KHÔNG reset: đó là hạn mức chống gọi AI lặp, không
  -- phải trạng thái duyệt.
  if tg_op='UPDATE' and old.status='approved' and auth.uid()=new.student_id then
    new.teacher_comment:=null;
  end if;

  if new.status='submitted' then
    if tg_op='INSERT' or old.status is distinct from 'submitted' or old.content is distinct from new.content
       or old.note is distinct from new.note or old.uses_electronic_device is distinct from new.uses_electronic_device then
      v_should_review:=true;
    end if;
  end if;

  if v_should_review then
    new.approval_source:='manual'; new.ai_decision:=null; new.ai_category:=null; new.ai_confidence:=null;
    new.ai_revision_status:=null; new.ai_revision_confidence:=null; new.ai_reason:=null; new.ai_model:=null; new.ai_reviewed_at:=null;
    new.approved_at:=null; new.approved_by:=null;
    if v_enabled then
      new.ai_review_status:='pending';
      new.auto_review_reason:=case when coalesce(new.teacher_comment,'')<>'' then 'HS đã sửa theo phản hồi GV; Groq AI duyệt lại.'
        when coalesce(new.is_emergency,false) then 'Đăng ký bổ sung; Groq AI kiểm tra trước.' else 'Groq AI kiểm tra đăng ký mới.' end;
    else
      new.ai_review_status:='not_needed'; new.auto_review_reason:='AI đang tắt; chuyển giáo viên duyệt.';
    end if;
  elsif new.status='approved' and auth.uid() is distinct from new.student_id and new.approval_source<>'ai' then
    new.approval_source:='manual';
  end if;
  return new;
end; $function$;

create or replace function public.capture_ai_teacher_feedback() returns trigger
 language plpgsql security definer set search_path to 'public'
as $function$
declare v_type text;
begin
  if not (public.is_root_admin() or public.teacher_has_class(old.class_id)) then return new; end if;
  if old.ai_review_status='completed' and old.ai_decision='auto_approve' and new.status='needs_revision' and old.status is distinct from 'needs_revision' then
    v_type:='teacher_revision_after_ai_approve';
  elsif old.ai_review_status='completed' and old.ai_decision='manual_review' and new.status='approved' and new.approval_source='manual' then
    v_type:='teacher_approve_after_ai_manual';
  elsif old.ai_review_status='completed' and old.ai_decision='request_revision' and new.status='approved' and new.approval_source='manual' then
    v_type:='teacher_approve_after_ai_revision';
  end if;
  if v_type is not null then
    insert into public.ai_review_feedback(registration_id,class_id,teacher_id,feedback_type,content,note,teacher_comment,
      ai_decision,ai_category,ai_confidence,ai_revision_status,ai_revision_confidence,ai_reason,created_at)
    values(old.id,old.class_id,auth.uid(),v_type,coalesce(old.content,''),old.note,new.teacher_comment,
      old.ai_decision,old.ai_category,old.ai_confidence,old.ai_revision_status,old.ai_revision_confidence,old.ai_reason,now());
  end if;
  return new;
end; $function$;

create or replace function public.sync_teacher_review_notification() returns trigger
 language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_title text;
  v_message text;
  v_type text;
  v_ai_pending boolean;
  v_manual_review boolean;
begin
  v_ai_pending := coalesce(new.ai_review_status::text,'') in ('pending','processing');
  v_manual_review := (
    new.status = 'submitted'
    or (
      new.status = 'needs_revision'
      and new.revision_overdue_at is not null
    )
  );

  delete from public.teacher_notifications
  where registration_id = new.id
    and notification_type in ('ai_watch','manual_review')
    and not (new.status = 'submitted' and v_ai_pending)
    and not (v_manual_review and not v_ai_pending);

  if new.is_deleted then
    return new;
  end if;

  if new.status = 'submitted' and v_ai_pending then
    v_type := 'ai_watch';
    v_title := '🤖 Đăng ký đang chờ AI';
  elsif v_manual_review and not v_ai_pending then
    v_type := 'manual_review';
    if new.status = 'needs_revision' and new.revision_overdue_at is not null then
      v_title := '⚠️ Quá hạn chỉnh sửa đăng ký';
    else
      v_title := '⚠️ Đăng ký cần giáo viên xem';
    end if;
  elsif new.is_emergency and new.status <> 'approved' then
    v_type := 'emergency_notice';
    v_title := '🚨 Đăng ký bổ sung';
  else
    return new;
  end if;

  select coalesce(full_name,'Học sinh') || ': ' || left(coalesce(new.content,''),160)
  into v_message
  from public.profiles
  where id = new.student_id;

  insert into public.teacher_notifications(
    registration_id,class_id,student_id,week_id,
    notification_type,title,message,is_read,created_at
  )
  values(
    new.id,new.class_id,new.student_id,new.week_id,
    v_type,v_title,v_message,false,now()
  )
  on conflict (registration_id,notification_type)
  do update set
    class_id = excluded.class_id,
    title = excluded.title,
    message = excluded.message,
    is_read = false;

  return new;
end;
$function$;

-- ---------------------------------------------------------------------------
-- Triggers, verbatim from pg_get_triggerdef on production.
-- The numeric name prefixes are load-bearing: Postgres fires BEFORE ROW
-- triggers in name order, so the chain is 00 → 01 → 05 → apply_smart_approval.
-- ---------------------------------------------------------------------------

create trigger trg_00_set_registration_class before insert or update of class_id on public.registrations
  for each row execute function public.set_registration_class_id();
create trigger trg_01_validate_registration_class_week before insert or update of class_id, week_id on public.registrations
  for each row execute function public.validate_registration_class_week();
create trigger trg_05_guard_student_registration_update before update on public.registrations
  for each row execute function public.guard_student_registration_update();
create trigger trg_apply_smart_approval before insert or update on public.registrations
  for each row execute function public.apply_smart_approval();
create trigger trg_capture_ai_teacher_feedback after update of status, approval_source on public.registrations
  for each row execute function public.capture_ai_teacher_feedback();
create trigger trg_sync_teacher_review_notification after insert or update of status, ai_review_status, ai_decision, is_deleted, revision_overdue_at on public.registrations
  for each row execute function public.sync_teacher_review_notification();

-- ---------------------------------------------------------------------------
-- RLS, verbatim from pg_policies on production.
-- ---------------------------------------------------------------------------

alter table public.registrations enable row level security;
alter table public.weeks enable row level security;
alter table public.class_weeks enable row level security;
alter table public.class_teachers enable row level security;

create policy registrations_select_v840 on public.registrations for select to authenticated
using ((is_deleted = false) and ((student_id = auth.uid()) or public.is_root_admin()
  or ((status <> 'draft'::public.registration_status) and public.teacher_has_class(class_id))
  or ((status <> 'draft'::public.registration_status) and ((public.current_app_role())::text = 'monitor'::text) and (class_id = public.current_student_class_id()))));

create policy registrations_student_insert_v840 on public.registrations for insert to authenticated
with check ((((public.current_app_role())::text = any (array['student'::text, 'monitor'::text]))
  and (student_id = auth.uid()) and (class_id = public.current_student_class_id())
  and (is_deleted = false) and (is_emergency = false)
  and (status = any (array['draft'::public.registration_status, 'submitted'::public.registration_status]))
  and public.week_registration_is_open(class_id, week_id)
  and ((public.registration_deadline_for_slot(class_id, week_id, weekday) is null)
    or (now() <= public.registration_deadline_for_slot(class_id, week_id, weekday)))));

create policy registrations_student_update_v840 on public.registrations for update to authenticated
using ((((public.current_app_role())::text = any (array['student'::text, 'monitor'::text]))
  and (student_id = auth.uid()) and (is_deleted = false) and (class_id = public.current_student_class_id())
  and (status = any (array['draft'::public.registration_status, 'submitted'::public.registration_status, 'needs_revision'::public.registration_status, 'approved'::public.registration_status]))
  and (((status = 'needs_revision'::public.registration_status) and (revision_overdue_at is null)
        and (now() < public.study_session_start(class_id, week_id, weekday, period_number)))
    or ((status <> 'needs_revision'::public.registration_status)
        and public.week_registration_is_open(class_id, week_id)
        and ((public.registration_deadline_for_slot(class_id, week_id, weekday) is null)
          or (now() <= public.registration_deadline_for_slot(class_id, week_id, weekday)))
        and (now() < public.study_session_start(class_id, week_id, weekday, period_number))))))
with check ((((public.current_app_role())::text = any (array['student'::text, 'monitor'::text]))
  and (student_id = auth.uid()) and (class_id = public.current_student_class_id())
  and (is_deleted = false) and (revision_overdue_at is null)
  and public.registration_emergency_flag_matches(id, is_emergency)
  and (status = any (array['draft'::public.registration_status, 'submitted'::public.registration_status]))));

create policy registrations_manager_update_v840 on public.registrations for update to authenticated
using (public.can_manage_class(class_id)) with check (public.can_manage_class(class_id));

create policy weeks_read_v840 on public.weeks for select to authenticated using (true);
create policy weeks_admin_write_v840 on public.weeks for all to authenticated using (public.is_root_admin()) with check (public.is_root_admin());
create policy class_weeks_select_v840 on public.class_weeks for select to authenticated
  using (public.can_manage_class(class_id) or (class_id = public.current_student_class_id()));
create policy class_weeks_manage_v840 on public.class_weeks for all to authenticated
  using (public.can_manage_class(class_id)) with check (public.can_manage_class(class_id));
create policy class_teachers_select_v840 on public.class_teachers for select to authenticated
  using (public.is_root_admin() or (teacher_id = auth.uid()));
create policy class_teachers_admin_write_v840 on public.class_teachers for all to authenticated
  using (public.is_root_admin()) with check (public.is_root_admin());

grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Sol RC3 R-002 — production's default privileges for NEW objects.
--
-- Read from the live database on 2026-09-20 (`pg_default_acl`), owner postgres,
-- schema public:
--
--   functions: {postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
--   tables:    {postgres=arwdDxtm/postgres,anon=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}
--   sequences: {postgres=rwU/postgres,anon=rwU/postgres,authenticated=rwU/postgres,service_role=rwU/postgres}
--
-- The `anon` grant is **explicit**, not inherited through PUBLIC, so
-- `revoke … from public` does not remove it. Until RC3 this harness did not
-- model that, so a migration that revoked only from PUBLIC looked correctly
-- locked down here and would have shipped with `anon = EXECUTE` on production.
-- The catalog test in database.test.mjs is only meaningful with this in place.
--
-- Deliberately placed at the end: it governs objects created **after** it, which
-- is exactly the set migration 13 creates. It makes no claim about the ACL of
-- the pre-existing tables above, which production granted at their own time and
-- which this file does not attempt to reproduce.
-- ---------------------------------------------------------------------------
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
