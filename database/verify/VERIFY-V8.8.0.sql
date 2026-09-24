-- READ-ONLY verifier for V8.8.0
-- Require the final row `overall = true` before deploying Edge/frontend.
with function_defs as (
  select
    lower(regexp_replace(coalesce(pg_get_functiondef(to_regprocedure('public.guard_student_registration_update()')),''),'[[:space:]]+','','g')) guard_def,
    lower(regexp_replace(coalesce(pg_get_functiondef(to_regprocedure('public.sync_revision_overdue_reports()')),''),'[[:space:]]+','','g')) overdue_def,
    lower(regexp_replace(coalesce(pg_get_functiondef(to_regprocedure('public.delete_registration_safely(uuid)')),''),'[[:space:]]+','','g')) delete_def,
    lower(regexp_replace(coalesce(pg_get_functiondef(to_regprocedure('public.request_registration_revision(uuid,text)')),''),'[[:space:]]+','','g')) revision_def,
    lower(regexp_replace(coalesce(pg_get_functiondef(to_regprocedure('public.class_week_effective_status(uuid,uuid)')),''),'[[:space:]]+','','g')) lifecycle_def,
    lower(regexp_replace(coalesce(pg_get_functiondef(to_regprocedure('public.admin_assign_timetable_version(uuid,uuid,uuid,uuid,date,date)')),''),'[[:space:]]+','','g')) assign_def
), policy_defs as (
  select lower(regexp_replace(coalesce(pg_get_expr(p.polqual,p.polrelid),''),'[[:space:]]+','','g')) student_update_qual
  from pg_policy p
  join pg_class c on c.oid=p.polrelid
  join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relname='registrations' and p.polname='registrations_student_update_v840'
), checks as (
  select 'timetable_templates' item,to_regclass('public.timetable_templates') is not null ok
  union all select 'timetable_template_versions',to_regclass('public.timetable_template_versions') is not null
  union all select 'timetable_version_periods',to_regclass('public.timetable_version_periods') is not null
  union all select 'class_timetable_assignments',to_regclass('public.class_timetable_assignments') is not null
  union all select 'resolved_timetable_periods',to_regprocedure('public.resolved_timetable_periods(uuid,date)') is not null
  union all select 'study_session_start_class_specific',to_regprocedure('public.study_session_start(uuid,uuid,integer,integer)') is not null
  union all select 'admin_assign_timetable_version',to_regprocedure('public.admin_assign_timetable_version(uuid,uuid,uuid,uuid,date,date)') is not null
  union all select 'assignment_overlap_trigger',exists(select 1 from pg_trigger where tgname='trg_timetable_assignment_overlap' and not tgisinternal)
  union all select 'templates_have_versions',not exists(
    select 1 from public.timetable_templates t where t.active
    and not exists(select 1 from public.timetable_template_versions v where v.template_id=t.id)
  )
  union all select 'default_template_per_year',not exists(
    select 1 from public.school_years sy
    where not exists(
      select 1 from public.timetable_templates t
      where t.school_year_id=sy.id and t.name='TKB mặc định V8.8.0'
    )
  )
  union all select 'active_classes_have_timetable',not exists(
    select 1 from public.classes c where c.active
    and not exists(select 1 from public.class_timetable_assignments a where a.class_id=c.id and a.active)
  )
  union all select 'assignments_do_not_overlap',not exists(
    select 1 from public.class_timetable_assignments a
    join public.class_timetable_assignments b on a.class_id=b.class_id and a.id<b.id and a.active and b.active
    where daterange(a.effective_from,a.effective_to,'[]')&&daterange(b.effective_from,b.effective_to,'[]')
  )
  union all select 'assignment_ranges_within_school_year',not exists(
    select 1 from public.class_timetable_assignments a
    join public.school_years sy on sy.id=a.school_year_id
    where a.effective_from<sy.start_date or a.effective_to>sy.end_date
  )
  union all select 'assignment_function_enforces_year_range',exists(
    select 1 from function_defs
    where assign_def like '%p_effective_from<v_year_start%' and assign_def like '%p_effective_to>v_year_end%'
  )
  union all select 'guard_student_registration_class_specific',exists(
    select 1 from function_defs
    where guard_def like '%study_session_start(old.class_id,old.week_id,old.weekday,old.period_number)%'
  )
  union all select 'revision_overdue_class_specific',exists(
    select 1 from function_defs
    where overdue_def like '%study_session_start(r.class_id,r.week_id,r.weekday,r.period_number)%'
  )
  union all select 'delete_registration_class_specific',exists(
    select 1 from function_defs
    where delete_def like '%study_session_start(v_registration.class_id,v_registration.week_id,v_registration.weekday,v_registration.period_number)%'
  )
  union all select 'request_revision_class_specific',exists(
    select 1 from function_defs
    where revision_def like '%study_session_start(v_registration.class_id,v_registration.week_id,v_registration.weekday,v_registration.period_number)%'
  )
  union all select 'class_week_lifecycle_uses_resolved_timetable',exists(
    select 1 from function_defs where lifecycle_def like '%resolved_timetable_periods(p_class_id%'
  )
  union all select 'student_update_policy_class_specific',exists(
    select 1 from policy_defs
    where student_update_qual like '%study_session_start(class_id,week_id,weekday,period_number)%'
  )
  union all select 'migration_marker',exists(select 1 from public.audit_logs where action='TIMETABLE_TEMPLATE_MIGRATED')
), rows as(
  select item,ok,case when ok then 'ok' else 'CHECK_REQUIRED' end detail from checks
)
select * from rows
union all
select 'overall',bool_and(ok),case when bool_and(ok) then 'true' else 'false' end from rows;
