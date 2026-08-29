-- SỔ TỰ HỌC V8.8.0 — TIMETABLE TEMPLATE / UX BACKEND UPGRADE
-- Yêu cầu database đã ở final V8.7.1 (multi-class + school_year_periods + audit schema).
-- Idempotent: có thể chạy lại. Không chứa repair theo tên lớp cụ thể.

DO $v880_preflight$
BEGIN
  IF to_regclass('public.school_years') IS NULL OR to_regclass('public.classes') IS NULL
     OR to_regclass('public.school_year_periods') IS NULL OR to_regclass('public.study_schedule') IS NULL
     OR to_regclass('public.week_schedule_overrides') IS NULL OR to_regclass('public.audit_logs') IS NULL
  THEN RAISE EXCEPTION 'V8.8.0 yêu cầu V8.7.1 final đã được triển khai trước.'; END IF;
END
$v880_preflight$;

begin;

create table if not exists public.timetable_templates (
  id uuid primary key default gen_random_uuid(),
  school_year_id uuid not null references public.school_years(id) on delete cascade,
  name text not null,
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint timetable_templates_name_not_blank check (btrim(name)<>''),
  constraint timetable_templates_name_unique unique(school_year_id,name)
);

create table if not exists public.timetable_template_versions (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.timetable_templates(id) on delete cascade,
  version_number integer not null check(version_number>0),
  config jsonb not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint timetable_template_versions_unique unique(template_id,version_number),
  constraint timetable_template_versions_config_object check(jsonb_typeof(config)='object')
);

create table if not exists public.timetable_version_periods (
  version_id uuid not null references public.timetable_template_versions(id) on delete cascade,
  weekday smallint not null check(weekday between 1 and 7),
  period_number smallint not null check(period_number between 1 and 40),
  start_time time not null,
  end_time time not null,
  session text not null default 'day' check(session in ('morning','afternoon','day')),
  primary key(version_id,weekday,period_number),
  constraint timetable_version_periods_time_check check(start_time<end_time)
);

create table if not exists public.class_timetable_assignments (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  school_year_id uuid not null references public.school_years(id) on delete cascade,
  template_version_id uuid not null references public.timetable_template_versions(id) on delete restrict,
  effective_from date not null,
  effective_to date not null,
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint class_timetable_assignments_range check(effective_from<=effective_to)
);
create index if not exists class_timetable_assignments_lookup_idx on public.class_timetable_assignments(class_id,effective_from,effective_to) where active;
create index if not exists timetable_version_periods_lookup_idx on public.timetable_version_periods(version_id,weekday,period_number);

alter table public.timetable_templates enable row level security;
alter table public.timetable_template_versions enable row level security;
alter table public.timetable_version_periods enable row level security;
alter table public.class_timetable_assignments enable row level security;

do $policies$
begin
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='timetable_templates' and policyname='timetable_templates_read') then
    create policy timetable_templates_read on public.timetable_templates for select to authenticated using(true);
  end if;
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='timetable_template_versions' and policyname='timetable_template_versions_read') then
    create policy timetable_template_versions_read on public.timetable_template_versions for select to authenticated using(true);
  end if;
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='timetable_version_periods' and policyname='timetable_version_periods_read') then
    create policy timetable_version_periods_read on public.timetable_version_periods for select to authenticated using(true);
  end if;
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='class_timetable_assignments' and policyname='class_timetable_assignments_read') then
    create policy class_timetable_assignments_read on public.class_timetable_assignments for select to authenticated using(true);
  end if;
end
$policies$;

grant select on public.timetable_templates,public.timetable_template_versions,public.timetable_version_periods,public.class_timetable_assignments to authenticated;
grant all on public.timetable_templates,public.timetable_template_versions,public.timetable_version_periods,public.class_timetable_assignments to service_role;

create or replace function public.prevent_timetable_assignment_overlap()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  if new.active and exists(
    select 1 from public.class_timetable_assignments x
    where x.class_id=new.class_id and x.active and x.id<>coalesce(new.id,'00000000-0000-0000-0000-000000000000'::uuid)
      and daterange(x.effective_from,x.effective_to,'[]') && daterange(new.effective_from,new.effective_to,'[]')
  ) then raise exception 'Khoảng hiệu lực TKB của lớp không được chồng nhau.' using errcode='23P01'; end if;
  return new;
end$$;
drop trigger if exists trg_timetable_assignment_overlap on public.class_timetable_assignments;
create trigger trg_timetable_assignment_overlap before insert or update on public.class_timetable_assignments for each row execute function public.prevent_timetable_assignment_overlap();

-- Migrate current year periods into one immutable default template/version per school year.
insert into public.timetable_templates(school_year_id,name,active,created_at,updated_at)
select sy.id,'TKB mặc định V8.8.0',true,now(),now()
from public.school_years sy
where not exists(
  select 1 from public.timetable_templates t
  where t.school_year_id=sy.id and t.name='TKB mặc định V8.8.0'
);

with src as (
  select sy.id school_year_id,p.period_number,p.start_time,p.end_time
  from public.school_years sy
  join lateral (
    select yp.period_number,yp.start_time,yp.end_time from public.school_year_periods yp where yp.school_year_id=sy.id
    union all
    select p.period_number,p.start_time,p.end_time from public.periods p
    where not exists(select 1 from public.school_year_periods yp where yp.school_year_id=sy.id)
  ) p on true
), gap_scan as (
  select school_year_id,period_number,start_time,end_time,
    greatest(0,extract(epoch from(lead(start_time) over(partition by school_year_id order by period_number)-end_time))/60)::int gap_minutes
  from src
), largest_gap as (
  select distinct on (school_year_id) school_year_id,period_number split_after,gap_minutes
  from gap_scan
  where gap_minutes>=30
  order by school_year_id,gap_minutes desc,period_number
), agg as (
  select s.school_year_id,
    min(s.start_time) first_start,max(s.end_time) last_end,l.split_after,
    max(s.end_time) filter(where s.period_number=l.split_after) morning_end,
    min(s.start_time) filter(where l.split_after is not null and s.period_number>l.split_after) afternoon_start,
    max(s.end_time) filter(where l.split_after is not null and s.period_number>l.split_after) afternoon_end,
    jsonb_agg(jsonb_build_object('period',s.period_number,'minutes',greatest(1,extract(epoch from(s.end_time-s.start_time))/60)::int) order by s.period_number) duration_overrides
  from src s left join largest_gap l using(school_year_id)
  group by s.school_year_id,l.split_after
), gaps as (
  select g.school_year_id,coalesce(
    jsonb_agg(jsonb_build_object('afterPeriod',g.period_number,'type','custom','minutes',g.gap_minutes) order by g.period_number)
      filter(where g.gap_minutes>0 and (g.gap_minutes<30 or l.split_after is null or g.period_number<>l.split_after)),
    '[]'::jsonb
  ) break_rules
  from gap_scan g left join largest_gap l using(school_year_id)
  group by g.school_year_id
), configs as (
  select a.school_year_id,jsonb_build_object(
    'morningStart',to_char(a.first_start,'HH24:MI'),
    'morningEnd',to_char(coalesce(a.morning_end,a.last_end),'HH24:MI'),
    'afternoonStart',case when a.split_after is null then null else to_char(a.afternoon_start,'HH24:MI') end,
    'afternoonEnd',case when a.split_after is null then null else to_char(a.afternoon_end,'HH24:MI') end,
    'defaultPeriodMinutes',40,'shortBreakMinutes',5,'longBreakMinutes',15,
    'periodOverrides',a.duration_overrides,'breakRules',g.break_rules,'dayOverrides','{}'::jsonb
  ) config
  from agg a join gaps g using(school_year_id)
)
insert into public.timetable_template_versions(template_id,version_number,config,created_at)
select t.id,1,c.config,now() from public.timetable_templates t join configs c on c.school_year_id=t.school_year_id
where t.name='TKB mặc định V8.8.0'
  and not exists(select 1 from public.timetable_template_versions v where v.template_id=t.id);

with src as (
  select sy.id school_year_id,p.period_number,p.start_time,p.end_time
  from public.school_years sy
  join lateral (
    select yp.period_number,yp.start_time,yp.end_time from public.school_year_periods yp where yp.school_year_id=sy.id
    union all
    select p.period_number,p.start_time,p.end_time from public.periods p where not exists(select 1 from public.school_year_periods yp where yp.school_year_id=sy.id)
  ) p on true
), gap_scan as (
  select school_year_id,period_number,start_time,end_time,
    greatest(0,extract(epoch from(lead(start_time) over(partition by school_year_id order by period_number)-end_time))/60)::int gap_minutes
  from src
), largest_gap as (
  select distinct on (school_year_id) school_year_id,period_number split_after,gap_minutes
  from gap_scan where gap_minutes>=30
  order by school_year_id,gap_minutes desc,period_number
), defaults as (
  select t.school_year_id,v.id version_id from public.timetable_templates t join lateral(select id from public.timetable_template_versions v where v.template_id=t.id order by version_number limit 1)v on true
  where t.name='TKB mặc định V8.8.0'
)
insert into public.timetable_version_periods(version_id,weekday,period_number,start_time,end_time,session)
select d.version_id,w.dow,s.period_number,s.start_time,s.end_time,
  case when l.split_after is not null and s.period_number>l.split_after then 'afternoon' else 'morning' end
from defaults d
join src s on s.school_year_id=d.school_year_id
left join largest_gap l on l.school_year_id=s.school_year_id
cross join generate_series(1,7) w(dow)
on conflict(version_id,weekday,period_number) do nothing;

with defaults as (
  select t.school_year_id,v.id version_id from public.timetable_templates t join lateral(select id from public.timetable_template_versions v where v.template_id=t.id order by version_number limit 1)v on true
  where t.name='TKB mặc định V8.8.0'
)
insert into public.class_timetable_assignments(class_id,school_year_id,template_version_id,effective_from,effective_to,active,created_at,updated_at)
select c.id,c.school_year_id,d.version_id,sy.start_date,sy.end_date,true,now(),now()
from public.classes c join public.school_years sy on sy.id=c.school_year_id join defaults d on d.school_year_id=c.school_year_id
where not exists(select 1 from public.class_timetable_assignments a where a.class_id=c.id and a.active);

create or replace function public.admin_assign_timetable_version(
  p_actor_id uuid,p_class_id uuid,p_school_year_id uuid,p_template_version_id uuid,p_effective_from date,p_effective_to date
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.class_timetable_assignments%rowtype;v_id uuid;v_template_year uuid;v_class_year uuid;v_year_start date;v_year_end date;
begin
  if p_effective_from is null or p_effective_to is null or p_effective_from>p_effective_to then raise exception 'Khoảng hiệu lực TKB không hợp lệ.';end if;
  select school_year_id into v_class_year from public.classes where id=p_class_id;
  select start_date,end_date into v_year_start,v_year_end from public.school_years where id=p_school_year_id;
  select t.school_year_id into v_template_year from public.timetable_template_versions v join public.timetable_templates t on t.id=v.template_id where v.id=p_template_version_id;
  if v_class_year is null or v_class_year<>p_school_year_id then raise exception 'Lớp không thuộc năm học đã chọn.';end if;
  if v_year_start is null or v_year_end is null then raise exception 'Không tìm thấy năm học đã chọn.';end if;
  if p_effective_from<v_year_start or p_effective_to>v_year_end then raise exception 'Khoảng hiệu lực TKB phải nằm trong năm học đã chọn.';end if;
  if v_template_year is null or v_template_year<>p_school_year_id then raise exception 'Mẫu TKB không thuộc năm học của lớp.';end if;
  for r in select * from public.class_timetable_assignments where class_id=p_class_id and active and daterange(effective_from,effective_to,'[]')&&daterange(p_effective_from,p_effective_to,'[]') for update loop
    if r.effective_from<p_effective_from and r.effective_to>p_effective_to then
      update public.class_timetable_assignments set effective_to=p_effective_from-1,updated_at=now() where id=r.id;
      insert into public.class_timetable_assignments(class_id,school_year_id,template_version_id,effective_from,effective_to,active,created_by,created_at,updated_at)
      values(r.class_id,r.school_year_id,r.template_version_id,p_effective_to+1,r.effective_to,true,p_actor_id,now(),now());
    elsif r.effective_from<p_effective_from then
      update public.class_timetable_assignments set effective_to=p_effective_from-1,updated_at=now() where id=r.id;
    elsif r.effective_to>p_effective_to then
      update public.class_timetable_assignments set effective_from=p_effective_to+1,updated_at=now() where id=r.id;
    else
      update public.class_timetable_assignments set active=false,updated_at=now() where id=r.id;
    end if;
  end loop;
  insert into public.class_timetable_assignments(class_id,school_year_id,template_version_id,effective_from,effective_to,active,created_by,created_at,updated_at)
  values(p_class_id,p_school_year_id,p_template_version_id,p_effective_from,p_effective_to,true,p_actor_id,now(),now()) returning id into v_id;
  return v_id;
end$$;
revoke all on function public.admin_assign_timetable_version(uuid,uuid,uuid,uuid,date,date) from public,anon,authenticated;
grant execute on function public.admin_assign_timetable_version(uuid,uuid,uuid,uuid,date,date) to service_role;

create or replace function public.resolved_timetable_periods(p_class_id uuid,p_date date)
returns table(period_number smallint,start_time time,end_time time,session text)
language sql stable security definer set search_path=public,pg_temp as $$
  select vp.period_number,vp.start_time,vp.end_time,vp.session
  from public.class_timetable_assignments a
  join public.timetable_version_periods vp on vp.version_id=a.template_version_id
  where a.class_id=p_class_id and a.active and p_date between a.effective_from and a.effective_to
    and vp.weekday=extract(isodow from p_date)::int
  order by vp.period_number
$$;
revoke all on function public.resolved_timetable_periods(uuid,date) from public,anon;
grant execute on function public.resolved_timetable_periods(uuid,date) to authenticated,service_role;

create or replace function public.study_session_start(
  p_class_id uuid,p_week_id uuid,p_weekday int,p_period_number int
) returns timestamptz language sql stable security definer set search_path=public,pg_temp as $$
  select ((day_date::timestamp+coalesce(tp.start_time,yp.start_time,p.start_time)) at time zone 'Asia/Ho_Chi_Minh')
  from public.weeks w
  cross join lateral (select w.start_date+(greatest(1,least(7,p_weekday))-1) day_date) d
  left join lateral (
    select r.start_time from public.resolved_timetable_periods(p_class_id,d.day_date) r where r.period_number=p_period_number limit 1
  ) tp on true
  left join public.school_year_periods yp on yp.school_year_id=w.school_year_id and yp.period_number=p_period_number
  left join public.periods p on p.period_number=p_period_number
  where w.id=p_week_id and coalesce(tp.start_time,yp.start_time,p.start_time) is not null
$$;
revoke all on function public.study_session_start(uuid,uuid,integer,integer) from public,anon;
grant execute on function public.study_session_start(uuid,uuid,integer,integer) to authenticated,service_role;

create or replace function public.class_week_effective_status(p_class_id uuid,p_week_id uuid)
returns public.week_status language plpgsql stable security definer set search_path=public,pg_temp as $fn$
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
end$fn$;


-- ---------------------------------------------------------------------
-- V8.8.0 registration guards: every session boundary must resolve using
-- the registration/class timetable, never the legacy global period only.
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
       or new.approval_source is distinct from old.approval_source
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
       or new.approved_at is distinct from old.approved_at
       or new.approved_by is distinct from old.approved_by
       or new.is_deleted is distinct from old.is_deleted
       or new.deleted_at is distinct from old.deleted_at
       or new.deleted_by is distinct from old.deleted_by
    then raise exception 'Không được thay đổi trường do giáo viên hoặc máy chủ quản lý.' using errcode='42501'; end if;
  end if;
  return new;
end$guard$;

create or replace function public.sync_revision_overdue_reports()
returns integer language plpgsql security definer set search_path=public,pg_temp as $overdue$
declare v_changed integer:=0;
begin
  update public.registrations r
  set revision_overdue_at=coalesce(r.revision_overdue_at,now()),updated_at=now()
  where r.is_deleted=false and r.status='needs_revision' and r.revision_overdue_at is null
    and public.class_week_effective_status(r.class_id,r.week_id)<>'holiday'
    and public.study_session_start(r.class_id,r.week_id,r.weekday,r.period_number) is not null
    and now()>=public.study_session_start(r.class_id,r.week_id,r.weekday,r.period_number);
  get diagnostics v_changed=row_count;
  return v_changed;
end$overdue$;

create or replace function public.delete_registration_safely(p_registration_id uuid)
returns boolean language plpgsql volatile security definer set search_path=public,pg_temp as $delete_registration$
declare
  v_actor uuid:=auth.uid();
  v_role public.app_role;
  v_registration public.registrations%rowtype;
  v_session_start timestamptz;
begin
  if v_actor is null then raise exception 'Bạn chưa đăng nhập.' using errcode='42501'; end if;
  v_role:=public.current_app_role();
  if v_role is null then raise exception 'Tài khoản không còn hoạt động.' using errcode='42501'; end if;

  select * into v_registration
  from public.registrations
  where id=p_registration_id and is_deleted=false
  for update;
  if not found then return false; end if;

  if v_role::text in ('admin','teacher') then
    if not public.can_manage_class(v_registration.class_id) then
      raise exception 'Bạn không có quyền xóa đăng ký của lớp này.' using errcode='42501';
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
      raise exception 'Chỉ được hủy đăng ký bổ sung trước khi buổi tự học bắt đầu.' using errcode='42501';
    end if;
  else
    raise exception 'Bạn không có quyền hủy đăng ký này.' using errcode='42501';
  end if;

  update public.registrations
  set is_deleted=true,deleted_at=now(),deleted_by=v_actor,updated_at=now()
  where id=v_registration.id;
  return true;
end$delete_registration$;

-- Recreate the final student update RLS policy with class-aware session time.
drop policy if exists registrations_student_update_v840 on public.registrations;
create policy registrations_student_update_v840 on public.registrations
for update to authenticated
using(
  public.current_app_role()::text in ('student','monitor')
  and student_id=auth.uid()
  and is_deleted=false
  and class_id=public.current_student_class_id()
  and status in ('draft','submitted','needs_revision','approved')
  and (
    (
      status='needs_revision'
      and revision_overdue_at is null
      and now()<public.study_session_start(class_id,week_id,weekday,period_number)
    )
    or (
      status<>'needs_revision'
      and public.week_registration_is_open(class_id,week_id)
      and (
        public.registration_deadline_for_slot(class_id,week_id,weekday) is null
        or now()<=public.registration_deadline_for_slot(class_id,week_id,weekday)
      )
      and now()<public.study_session_start(class_id,week_id,weekday,period_number)
    )
  )
)
with check(
  public.current_app_role()::text in ('student','monitor')
  and student_id=auth.uid()
  and class_id=public.current_student_class_id()
  and is_deleted=false
  and revision_overdue_at is null
  and public.registration_emergency_flag_matches(id,is_emergency)
  and status in ('draft','submitted')
);

revoke all on function public.guard_student_registration_update() from public,anon;
grant execute on function public.guard_student_registration_update() to authenticated,service_role;
revoke all on function public.sync_revision_overdue_reports() from public,anon;
grant execute on function public.sync_revision_overdue_reports() to authenticated,service_role;
revoke all on function public.delete_registration_safely(uuid) from public,anon;
grant execute on function public.delete_registration_safely(uuid) to authenticated,service_role;

-- Revision requests must use the class-specific timetable.
create or replace function public.request_registration_revision(p_registration_id uuid,p_teacher_comment text)
returns boolean language plpgsql volatile security definer set search_path=public,pg_temp as $fn$
declare v_actor uuid:=auth.uid();v_registration public.registrations%rowtype;v_comment text:=btrim(coalesce(p_teacher_comment,''));v_session_start timestamptz;v_status text;
begin
  if v_actor is null then raise exception 'Bạn chưa đăng nhập.' using errcode='42501';end if;if v_comment='' then raise exception 'Vui lòng nhập nội dung yêu cầu chỉnh sửa.' using errcode='22023';end if;
  select * into v_registration from public.registrations where id=p_registration_id for update;
  if not found or coalesce(v_registration.is_deleted,false) then raise exception 'Không tìm thấy đăng ký đang hoạt động.' using errcode='P0002';end if;
  if not public.can_manage_class(v_registration.class_id) then raise exception 'Bạn không có quyền yêu cầu sửa đăng ký của lớp này.' using errcode='42501';end if;
  v_status:=v_registration.status::text;if v_status not in('submitted','needs_revision','approved') then raise exception 'Trạng thái đăng ký hiện tại không hỗ trợ yêu cầu sửa.' using errcode='22023';end if;
  if v_registration.revision_overdue_at is not null then raise exception 'Đăng ký đã quá hạn chỉnh sửa.' using errcode='22023';end if;
  v_session_start:=public.study_session_start(v_registration.class_id,v_registration.week_id,v_registration.weekday,v_registration.period_number);
  if v_session_start is null then raise exception 'Không xác định được thời điểm bắt đầu buổi tự học.' using errcode='22023';end if;if now()>=v_session_start then raise exception 'Buổi tự học đã bắt đầu; không thể yêu cầu học sinh sửa đăng ký.' using errcode='22023';end if;
  update public.registrations set status='needs_revision',approval_source='manual',approved_at=null,approved_by=null,teacher_comment=v_comment,ai_review_status='not_needed',ai_decision=null,ai_category=null,ai_confidence=null,ai_revision_status=null,ai_revision_confidence=null,ai_reason=null,ai_model=null,ai_reviewed_at=null,revision_overdue_at=null,updated_at=now() where id=v_registration.id;
  return true;
end$fn$;

insert into public.audit_logs(actor_id,class_id,action,entity_type,entity_id,old_data,new_data,source,created_at)
select null,null,'TIMETABLE_TEMPLATE_MIGRATED','system',null,null,jsonb_build_object('version','8.8.0'),'system',now()
where not exists(select 1 from public.audit_logs where action='TIMETABLE_TEMPLATE_MIGRATED');

notify pgrst,'reload schema';
commit;
