-- Read-only diagnostics for the two V8.8.0 registration guard checks.
-- No data or schema changes are performed.
with defs as (
  select
    pg_get_functiondef(to_regprocedure('public.delete_registration_safely(uuid)')) as delete_raw,
    lower(regexp_replace(
      coalesce(pg_get_functiondef(to_regprocedure('public.delete_registration_safely(uuid)')),''),
      '[[:space:]]+','','g'
    )) as delete_normalized,
    (
      select pg_get_expr(p.polqual,p.polrelid)
      from pg_policy p
      join pg_class c on c.oid=p.polrelid
      join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public'
        and c.relname='registrations'
        and p.polname='registrations_student_update_v840'
    ) as policy_raw,
    lower(regexp_replace(
      coalesce((
        select pg_get_expr(p.polqual,p.polrelid)
        from pg_policy p
        join pg_class c on c.oid=p.polrelid
        join pg_namespace n on n.oid=c.relnamespace
        where n.nspname='public'
          and c.relname='registrations'
          and p.polname='registrations_student_update_v840'
      ),''),
      '[[:space:]]+','','g'
    )) as policy_normalized
), checks as (
  select
    delete_normalized like '%study_session_start(v_registration.class_id,v_registration.week_id,v_registration.weekday,v_registration.period_number)%'
      as delete_registration_class_specific,
    policy_normalized like '%study_session_start(class_id,week_id,weekday,period_number)%'
      as student_update_policy_class_specific,
    delete_raw,
    policy_raw
  from defs
)
select
  delete_registration_class_specific,
  student_update_policy_class_specific,
  delete_raw,
  policy_raw
from checks;
