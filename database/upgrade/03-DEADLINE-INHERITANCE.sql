-- Deadline inheritance for V8.8.0. Run before deploying the accompanying frontend.
-- Existing class-week overrides are preserved. No registration rows are changed.
begin;
do $preflight$
begin
  if to_regprocedure('public.registration_deadline_for_slot(uuid,uuid,integer)') is null
     or to_regclass('public.class_settings') is null or to_regclass('public.class_weeks') is null then
    raise exception 'V8.8.0_REQUIRED: missing class deadline schema';
  end if;
end
$preflight$;

alter table public.class_settings
  add column if not exists default_deadline_mode text not null default 'per_session_20';
alter table public.class_settings drop constraint if exists class_settings_default_deadline_mode_check;
alter table public.class_settings add constraint class_settings_default_deadline_mode_check
  check(default_deadline_mode in ('per_session_20','week_before_20'));

alter table public.class_weeks drop constraint if exists class_weeks_deadline_mode_check;
alter table public.class_weeks add constraint class_weeks_deadline_mode_check
  check(deadline_mode in ('inherit','per_session_20','week_before_20','specific'));
alter table public.class_weeks alter column deadline_mode set default 'inherit';

-- Keep the existing signature, security mode and grants used by registration guards.
-- Resolving a deadline does not override the separate open/locked/holiday checks.
create or replace function public.registration_deadline_for_slot(p_class_id uuid,p_week_id uuid,p_weekday int)
returns timestamptz language sql stable security definer set search_path=public as $$
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
$$;
commit;

-- Read-only postflight. Older explicit modes intentionally remain overrides.
select deadline_mode,count(*) as week_count from public.class_weeks group by deadline_mode;
select default_deadline_mode,count(*) as class_count from public.class_settings group by default_deadline_mode;
