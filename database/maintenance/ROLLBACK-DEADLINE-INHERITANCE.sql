-- Roll back AFTER restoring the previous frontend and admin-manage-classes function.
-- Materialize inherited modes first so that existing deadlines keep their meaning.
begin;
update public.class_weeks cw
set deadline_mode=coalesce((select cs.default_deadline_mode from public.class_settings cs where cs.class_id=cw.class_id),'per_session_20')
where cw.deadline_mode='inherit';
alter table public.class_weeks alter column deadline_mode set default 'per_session_20';
alter table public.class_weeks drop constraint if exists class_weeks_deadline_mode_check;
alter table public.class_weeks add constraint class_weeks_deadline_mode_check
  check(deadline_mode in ('per_session_20','week_before_20','specific'));
create or replace function public.registration_deadline_for_slot(p_class_id uuid,p_week_id uuid,p_weekday int)
returns timestamptz language sql stable security definer set search_path=public as $$
  select case cw.deadline_mode
    when 'per_session_20' then ((w.start_date+(greatest(1,least(5,p_weekday))-1)-1+cs.per_session_deadline_time) at time zone 'Asia/Ho_Chi_Minh')
    when 'week_before_20' then ((w.start_date-1+cs.per_session_deadline_time) at time zone 'Asia/Ho_Chi_Minh')
    when 'specific' then cw.registration_deadline
    else cw.registration_deadline end
  from public.weeks w join public.class_weeks cw on cw.week_id=w.id and cw.class_id=p_class_id
  join public.class_settings cs on cs.class_id=p_class_id where w.id=p_week_id
$$;
-- Retain the additive class_settings column so rollback does not discard defaults.
commit;
