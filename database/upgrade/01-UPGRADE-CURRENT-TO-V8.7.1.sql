-- SỔ TỰ HỌC V8.7.1 — CURRENT V8.4.x-FAMILY UPGRADE
-- Dùng cho database hiện tại đã có backend multi-class V8.4.x.
-- Script có preflight và chỉ hợp nhất các thay đổi reusable còn là final state ở V8.7.1.
-- Không chứa bất kỳ repair dữ liệu lớp theo tên cụ thể nào.
-- Có thể chạy lại: các DDL/function bên dưới là idempotent hoặc replace có kiểm soát.

DO $v871_preflight$
BEGIN
  IF to_regclass('public.profiles') IS NULL
     OR to_regclass('public.registrations') IS NULL
     OR to_regclass('public.classes') IS NULL
     OR to_regclass('public.class_teachers') IS NULL
     OR to_regclass('public.class_settings') IS NULL
     OR to_regclass('public.class_weeks') IS NULL
     OR to_regclass('public.audit_logs') IS NULL
  THEN
    RAISE EXCEPTION 'V8.7.1 upgrade yêu cầu backend multi-class V8.4.x đã tồn tại.';
  END IF;

  IF to_regprocedure('public.can_manage_class(uuid)') IS NULL
     OR to_regprocedure('public.study_session_start(uuid,integer,integer)') IS NULL
     OR to_regprocedure('public.transfer_root_admin(uuid)') IS NULL
  THEN
    RAISE EXCEPTION 'V8.7.1 upgrade thiếu RPC nền V8.4.x; không tiếp tục để tránh trạng thái nửa vời.';
  END IF;
END
$v871_preflight$;

-- SỔ TỰ HỌC V8.4.1
-- Daily online quote cache for Cú Thông Thái.
-- Safe to run more than once.

begin;

create table if not exists public.daily_quotes (
  quote_date date primary key,
  quote_id text not null,
  quote_text text not null,
  author text not null default 'Khuyết danh',
  source_url text not null,
  created_at timestamptz not null default now(),
  constraint daily_quotes_quote_id_not_blank
    check (btrim(quote_id) <> ''),
  constraint daily_quotes_quote_text_length
    check (char_length(btrim(quote_text)) between 12 and 600),
  constraint daily_quotes_author_length
    check (char_length(btrim(author)) between 1 and 120),
  constraint daily_quotes_source_url_https
    check (source_url ~ '^https://')
);

comment on table public.daily_quotes is
  'One server-selected online quote per Vietnam calendar day for Cú Thông Thái.';

alter table public.daily_quotes enable row level security;

-- Browser clients never access this cache directly. All reads/writes go through
-- the quote-feed Edge Function using the server/service role.
revoke all on table public.daily_quotes from public, anon, authenticated;
grant select, insert on table public.daily_quotes to service_role;

commit;

notify pgrst, 'reload schema';

-- =====================================================================
-- SỔ TỰ HỌC V8.4.2 — REGISTRATION MANAGER ACTIONS
-- Reusable patch. Safe to run after V8.4.0b / V8.4.1.
-- Adds one authoritative RPC for GV/Root Admin to request a revision.
-- =====================================================================

begin;

create or replace function public.request_registration_revision(
  p_registration_id uuid,
  p_teacher_comment text
)
returns boolean
language plpgsql
volatile
security definer
set search_path=public,pg_temp
as $request_registration_revision$
declare
  v_actor uuid:=auth.uid();
  v_registration public.registrations%rowtype;
  v_comment text:=btrim(coalesce(p_teacher_comment,''));
  v_session_start timestamptz;
  v_status text;
begin
  if v_actor is null then
    raise exception 'Bạn chưa đăng nhập.' using errcode='42501';
  end if;

  if v_comment='' then
    raise exception 'Vui lòng nhập nội dung yêu cầu chỉnh sửa.' using errcode='22023';
  end if;

  select *
  into v_registration
  from public.registrations
  where id=p_registration_id
  for update;

  if not found or coalesce(v_registration.is_deleted,false)=true then
    raise exception 'Không tìm thấy đăng ký đang hoạt động.' using errcode='P0002';
  end if;

  if not public.can_manage_class(v_registration.class_id) then
    raise exception 'Bạn không có quyền yêu cầu sửa đăng ký của lớp này.' using errcode='42501';
  end if;

  v_status:=v_registration.status::text;
  if v_status not in ('submitted','needs_revision','approved') then
    raise exception 'Trạng thái đăng ký hiện tại không hỗ trợ yêu cầu sửa.' using errcode='22023';
  end if;

  if v_registration.revision_overdue_at is not null then
    raise exception 'Đăng ký đã quá hạn chỉnh sửa.' using errcode='22023';
  end if;

  v_session_start:=public.study_session_start(
    v_registration.week_id,
    v_registration.weekday,
    v_registration.period_number
  );

  if v_session_start is null then
    raise exception 'Không xác định được thời điểm bắt đầu buổi tự học.' using errcode='22023';
  end if;

  if now()>=v_session_start then
    raise exception 'Buổi tự học đã bắt đầu; không thể yêu cầu học sinh sửa đăng ký.' using errcode='22023';
  end if;

  update public.registrations
  set
    status='needs_revision',
    approval_source='manual',
    approved_at=null,
    approved_by=null,
    teacher_comment=v_comment,
    ai_review_status='not_needed',
    ai_decision=null,
    ai_category=null,
    ai_confidence=null,
    ai_revision_status=null,
    ai_revision_confidence=null,
    ai_reason=null,
    ai_model=null,
    ai_reviewed_at=null,
    revision_overdue_at=null,
    updated_at=now()
  where id=v_registration.id;

  return true;
end;
$request_registration_revision$;

revoke all on function public.request_registration_revision(uuid,text) from public,anon;
grant execute on function public.request_registration_revision(uuid,text) to authenticated,service_role;

notify pgrst,'reload schema';

commit;

-- SO TU HOC V8.4.2 hotfix
-- Fix invalid registration_status enum comparison: revision_overdue is a derived UI state,
-- persisted by registrations.revision_overdue_at while status remains needs_revision.

begin;

create or replace function public.sync_teacher_review_notification()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
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
$$;

drop trigger if exists trg_sync_teacher_review_notification on public.registrations;
create trigger trg_sync_teacher_review_notification
after insert or update of status,ai_review_status,ai_decision,is_deleted,revision_overdue_at
on public.registrations
for each row
execute function public.sync_teacher_review_notification();

notify pgrst, 'reload schema';
commit;

-- SỔ TỰ HỌC V8.4.2c HOTFIX
-- Giữ audit log khi hard-delete một tài khoản/profile.
-- audit_logs.actor_id đã nullable; chuyển FK từ NO ACTION sang ON DELETE SET NULL.
-- Xóa mềm trong ứng dụng vẫn là luồng mặc định.

begin;

do $preflight$
begin
  if to_regclass('public.audit_logs') is null
     or to_regclass('public.profiles') is null then
    raise exception 'Thiếu public.audit_logs hoặc public.profiles.';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema='public'
      and table_name='audit_logs'
      and column_name='actor_id'
      and is_nullable='YES'
  ) then
    raise exception 'audit_logs.actor_id phải cho phép NULL trước khi dùng ON DELETE SET NULL.';
  end if;
end
$preflight$;

alter table public.audit_logs
  drop constraint if exists audit_logs_actor_id_fkey;

alter table public.audit_logs
  add constraint audit_logs_actor_id_fkey
  foreign key (actor_id)
  references public.profiles(id)
  on delete set null;

notify pgrst, 'reload schema';
commit;

-- V8.7.1 database final state complete. Deploy Edge Functions after this script.

-- V8.7.1 school-year administration -------------------------------------------------
begin;

create or replace function public.admin_set_active_school_year(
  p_actor_id uuid,
  p_school_year_id uuid
)
returns void
language plpgsql
security definer
set search_path=public,pg_temp
as $admin_set_active_school_year$
declare
  v_actor_role text;
  v_actor_active boolean;
begin
  select role::text,active into v_actor_role,v_actor_active
  from public.profiles where id=p_actor_id;
  if v_actor_role is distinct from 'admin' or v_actor_active is distinct from true then
    raise exception 'ROOT_ADMIN_REQUIRED' using errcode='42501';
  end if;
  if not exists(select 1 from public.school_years where id=p_school_year_id) then
    raise exception 'SCHOOL_YEAR_NOT_FOUND' using errcode='22023';
  end if;

  update public.school_years set is_active=false where is_active=true and id<>p_school_year_id;
  update public.school_years set is_active=true where id=p_school_year_id;
end;
$admin_set_active_school_year$;

create or replace function public.admin_create_school_year(
  p_actor_id uuid,
  p_name text,
  p_start_date date,
  p_end_date date,
  p_set_active boolean default false
)
returns uuid
language plpgsql
security definer
set search_path=public,pg_temp
as $admin_create_school_year$
declare
  v_actor_role text;
  v_actor_active boolean;
  v_name text:=btrim(coalesce(p_name,''));
  v_year_id uuid;
  v_today date:=(now() at time zone 'Asia/Ho_Chi_Minh')::date;
begin
  select role::text,active into v_actor_role,v_actor_active
  from public.profiles where id=p_actor_id;
  if v_actor_role is distinct from 'admin' or v_actor_active is distinct from true then
    raise exception 'ROOT_ADMIN_REQUIRED' using errcode='42501';
  end if;
  if length(v_name)<4 or length(v_name)>40 then
    raise exception 'SCHOOL_YEAR_NAME_INVALID' using errcode='22023';
  end if;
  if p_start_date is null or p_end_date is null or p_end_date<p_start_date then
    raise exception 'SCHOOL_YEAR_DATES_INVALID' using errcode='22023';
  end if;
  if exists(select 1 from public.school_years where lower(name)=lower(v_name)) then
    raise exception 'SCHOOL_YEAR_ALREADY_EXISTS' using errcode='23505';
  end if;

  insert into public.school_years(name,start_date,end_date,is_active)
  values(v_name,p_start_date,p_end_date,false)
  returning id into v_year_id;

  insert into public.weeks(
    school_year_id,week_number,start_date,end_date,status,
    deadline_mode,registration_deadline,note
  )
  select
    v_year_id,
    g.i+1,
    p_start_date+(g.i*7),
    least(p_start_date+(g.i*7)+4,p_end_date),
    case
      when p_start_date+(g.i*7)+6 < v_today then 'locked'::public.week_status
      when v_today between p_start_date+(g.i*7) and p_start_date+(g.i*7)+6 then 'open'::public.week_status
      else 'upcoming'::public.week_status
    end,
    'per_session_20',
    null,
    null
  from generate_series(0,greatest(0,floor((p_end_date-p_start_date)/7.0)::int)) as g(i)
  where p_start_date+(g.i*7)<=p_end_date;

  if coalesce(p_set_active,false) then
    perform public.admin_set_active_school_year(p_actor_id,v_year_id);
  end if;

  return v_year_id;
end;
$admin_create_school_year$;

revoke all on function public.admin_create_school_year(uuid,text,date,date,boolean) from public,anon,authenticated;
revoke all on function public.admin_set_active_school_year(uuid,uuid) from public,anon,authenticated;
grant execute on function public.admin_create_school_year(uuid,text,date,date,boolean) to service_role;
grant execute on function public.admin_set_active_school_year(uuid,uuid) to service_role;


-- =====================================================================
-- V8.7.1 ROLE/WEEK PATCH — class-level manual override + auto lifecycle
-- =====================================================================
alter table public.class_weeks
  add column if not exists manual_status public.week_status;

do $manual_status_constraint$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.class_weeks'::regclass
      and conname='class_weeks_manual_status_check'
  ) then
    alter table public.class_weeks
      add constraint class_weeks_manual_status_check
      check (manual_status is null or manual_status in ('open'::public.week_status,'locked'::public.week_status));
  end if;
end
$manual_status_constraint$;

create or replace function public.class_week_effective_status(p_class_id uuid,p_week_id uuid)
returns public.week_status
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $class_week_effective_status$
declare
  v_year_id uuid;
  v_target_start date;
  v_target_status public.week_status;
  v_manual_status public.week_status;
  v_first_start date;
  v_target_seq integer;
  v_current_seq integer;
begin
  select w.school_year_id,w.start_date,cw.status,cw.manual_status
  into v_year_id,v_target_start,v_target_status,v_manual_status
  from public.weeks w
  join public.class_weeks cw on cw.week_id=w.id and cw.class_id=p_class_id
  where w.id=p_week_id;

  if not found then return null; end if;
  if v_target_status='holiday'::public.week_status then return 'holiday'::public.week_status; end if;
  if v_manual_status='open'::public.week_status then return 'open'::public.week_status; end if;
  if v_manual_status='locked'::public.week_status then return 'locked'::public.week_status; end if;

  select min(w.start_date) into v_first_start
  from public.weeks w where w.school_year_id=v_year_id;

  if (now() at time zone 'Asia/Ho_Chi_Minh')::date < v_first_start then
    return 'upcoming'::public.week_status;
  end if;

  select count(*)::integer into v_target_seq
  from public.weeks w
  where w.school_year_id=v_year_id
    and (w.start_date<v_target_start or (w.start_date=v_target_start and w.id<=p_week_id));

  with calendar as (
    select
      w.id,
      row_number() over(order by w.start_date,w.week_number,w.id)::integer as seq,
      coalesce(
        (
          select max(((w.start_date+(slot.weekday-1)) + p.end_time) at time zone 'Asia/Ho_Chi_Minh')
          from (
            select o.weekday,o.period_number
            from public.week_schedule_overrides o
            where o.class_id=p_class_id and o.week_id=w.id and o.is_study_period=true
            union all
            select s.weekday,s.period_number
            from public.study_schedule s
            where s.class_id=p_class_id and s.is_study_period=true
              and not exists(
                select 1 from public.week_schedule_overrides ox
                where ox.class_id=p_class_id and ox.week_id=w.id
              )
          ) slot
          join public.periods p on p.period_number=slot.period_number
        ),
        (w.end_date + time '23:59:59') at time zone 'Asia/Ho_Chi_Minh'
      ) as end_ts
    from public.weeks w
    where w.school_year_id=v_year_id
  )
  select c.seq into v_current_seq
  from calendar c
  where now()<c.end_ts
  order by c.seq
  limit 1;

  if v_current_seq is null then return 'locked'::public.week_status; end if;
  if v_target_seq<v_current_seq then return 'locked'::public.week_status; end if;
  if v_target_seq in (v_current_seq,v_current_seq+1) then return 'open'::public.week_status; end if;
  return 'upcoming'::public.week_status;
end;
$class_week_effective_status$;


-- =====================================================================
-- V8.7.1 SCHOOL-YEAR PERIOD PATCH — per-year period times
-- =====================================================================
create table if not exists public.school_year_periods (
  school_year_id uuid not null references public.school_years(id) on delete cascade,
  period_number integer not null check (period_number between 1 and 20),
  start_time time not null,
  end_time time not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (school_year_id,period_number),
  constraint school_year_periods_time_check check (start_time < end_time)
);

alter table public.school_year_periods enable row level security;
grant select on public.school_year_periods to authenticated;
grant all on public.school_year_periods to service_role;

do $school_year_periods_read_policy$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='school_year_periods' and policyname='school_year_periods_read_authenticated'
  ) then
    create policy school_year_periods_read_authenticated
      on public.school_year_periods for select to authenticated using (true);
  end if;
end
$school_year_periods_read_policy$;

-- Preserve the current global timetable as the baseline for every existing year.
insert into public.school_year_periods(school_year_id,period_number,start_time,end_time)
select y.id,p.period_number,p.start_time,p.end_time
from public.school_years y
cross join public.periods p
on conflict (school_year_id,period_number) do nothing;

create or replace function public.admin_replace_school_year_periods(
  p_actor_id uuid,
  p_school_year_id uuid,
  p_periods jsonb
)
returns void
language plpgsql
security definer
set search_path=public,pg_temp
as $admin_replace_school_year_periods$
declare
  v_actor_role text;
  v_actor_active boolean;
  v_total integer;
  v_distinct integer;
  v_overlap boolean;
begin
  select role::text,active into v_actor_role,v_actor_active
  from public.profiles where id=p_actor_id;
  if v_actor_role is distinct from 'admin' or v_actor_active is distinct from true then
    raise exception 'ROOT_ADMIN_REQUIRED' using errcode='42501';
  end if;
  if not exists(select 1 from public.school_years where id=p_school_year_id) then
    raise exception 'SCHOOL_YEAR_NOT_FOUND' using errcode='22023';
  end if;
  if p_periods is null or jsonb_typeof(p_periods)<>'array' or jsonb_array_length(p_periods)=0 or jsonb_array_length(p_periods)>20 then
    raise exception 'PERIODS_INVALID' using errcode='22023';
  end if;

  with parsed as (
    select
      (x->>'number')::integer as period_number,
      (x->>'start')::time as start_time,
      (x->>'end')::time as end_time
    from jsonb_array_elements(p_periods) x
  )
  select count(*),count(distinct period_number)
  into v_total,v_distinct
  from parsed
  where period_number between 1 and 20 and start_time<end_time;

  if v_total<>jsonb_array_length(p_periods) or v_distinct<>v_total then
    raise exception 'PERIODS_INVALID' using errcode='22023';
  end if;

  with parsed as (
    select
      (x->>'number')::integer as period_number,
      (x->>'start')::time as start_time,
      (x->>'end')::time as end_time
    from jsonb_array_elements(p_periods) x
  ), ordered as (
    select *,lag(end_time) over(order by start_time,period_number) as previous_end
    from parsed
  )
  select exists(select 1 from ordered where previous_end is not null and start_time<previous_end)
  into v_overlap;
  if v_overlap then
    raise exception 'PERIODS_OVERLAP' using errcode='22023';
  end if;

  delete from public.school_year_periods where school_year_id=p_school_year_id;
  insert into public.school_year_periods(school_year_id,period_number,start_time,end_time,updated_at)
  select p_school_year_id,(x->>'number')::integer,(x->>'start')::time,(x->>'end')::time,now()
  from jsonb_array_elements(p_periods) x;
end;
$admin_replace_school_year_periods$;

revoke all on function public.admin_replace_school_year_periods(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.admin_replace_school_year_periods(uuid,uuid,jsonb) to service_role;

-- New years inherit the system baseline periods. Admin can edit them afterwards without touching history.
create or replace function public.admin_create_school_year(
  p_actor_id uuid,
  p_name text,
  p_start_date date,
  p_end_date date,
  p_set_active boolean default false
)
returns uuid
language plpgsql
security definer
set search_path=public,pg_temp
as $admin_create_school_year$
declare
  v_actor_role text;
  v_actor_active boolean;
  v_name text:=btrim(coalesce(p_name,''));
  v_year_id uuid;
  v_today date:=(now() at time zone 'Asia/Ho_Chi_Minh')::date;
begin
  select role::text,active into v_actor_role,v_actor_active
  from public.profiles where id=p_actor_id;
  if v_actor_role is distinct from 'admin' or v_actor_active is distinct from true then
    raise exception 'ROOT_ADMIN_REQUIRED' using errcode='42501';
  end if;
  if length(v_name)<4 or length(v_name)>40 then raise exception 'SCHOOL_YEAR_NAME_INVALID' using errcode='22023'; end if;
  if p_start_date is null or p_end_date is null or p_end_date<p_start_date then raise exception 'SCHOOL_YEAR_DATES_INVALID' using errcode='22023'; end if;
  if exists(select 1 from public.school_years where lower(name)=lower(v_name)) then raise exception 'SCHOOL_YEAR_ALREADY_EXISTS' using errcode='23505'; end if;

  insert into public.school_years(name,start_date,end_date,is_active)
  values(v_name,p_start_date,p_end_date,false) returning id into v_year_id;

  insert into public.school_year_periods(school_year_id,period_number,start_time,end_time)
  select v_year_id,p.period_number,p.start_time,p.end_time from public.periods p
  on conflict (school_year_id,period_number) do nothing;

  insert into public.weeks(school_year_id,week_number,start_date,end_date,status,deadline_mode,registration_deadline,note)
  select v_year_id,g.i+1,p_start_date+(g.i*7),least(p_start_date+(g.i*7)+4,p_end_date),
    case when p_start_date+(g.i*7)+6<v_today then 'locked'::public.week_status
         when v_today between p_start_date+(g.i*7) and p_start_date+(g.i*7)+6 then 'open'::public.week_status
         else 'upcoming'::public.week_status end,
    'per_session_20',null,null
  from generate_series(0,greatest(0,floor((p_end_date-p_start_date)/7.0)::int)) as g(i)
  where p_start_date+(g.i*7)<=p_end_date;

  if coalesce(p_set_active,false) then perform public.admin_set_active_school_year(p_actor_id,v_year_id); end if;
  return v_year_id;
end;
$admin_create_school_year$;

revoke all on function public.admin_create_school_year(uuid,text,date,date,boolean) from public,anon,authenticated;
grant execute on function public.admin_create_school_year(uuid,text,date,date,boolean) to service_role;

create or replace function public.study_session_start(
  p_week_id uuid,
  p_weekday int,
  p_period_number int
)
returns timestamptz
language sql
stable
security definer
set search_path=public,pg_temp
as $$
  select (
    ((w.start_date+(greatest(1,least(5,p_weekday))-1))::timestamp + coalesce(yp.start_time,p.start_time))
  ) at time zone 'Asia/Ho_Chi_Minh'
  from public.weeks w
  left join public.school_year_periods yp
    on yp.school_year_id=w.school_year_id and yp.period_number=p_period_number
  left join public.periods p on p.period_number=p_period_number
  where w.id=p_week_id and coalesce(yp.start_time,p.start_time) is not null
$$;

create or replace function public.class_week_effective_status(p_class_id uuid,p_week_id uuid)
returns public.week_status
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $class_week_effective_status$
declare
  v_year_id uuid;
  v_target_start date;
  v_target_status public.week_status;
  v_manual_status public.week_status;
  v_first_start date;
  v_target_seq integer;
  v_current_seq integer;
begin
  select w.school_year_id,w.start_date,cw.status,cw.manual_status
  into v_year_id,v_target_start,v_target_status,v_manual_status
  from public.weeks w join public.class_weeks cw on cw.week_id=w.id and cw.class_id=p_class_id
  where w.id=p_week_id;
  if not found then return null; end if;
  if v_target_status='holiday'::public.week_status then return 'holiday'::public.week_status; end if;
  if v_manual_status='open'::public.week_status then return 'open'::public.week_status; end if;
  if v_manual_status='locked'::public.week_status then return 'locked'::public.week_status; end if;

  select min(w.start_date) into v_first_start from public.weeks w where w.school_year_id=v_year_id;
  if (now() at time zone 'Asia/Ho_Chi_Minh')::date<v_first_start then return 'upcoming'::public.week_status; end if;
  select count(*)::integer into v_target_seq from public.weeks w
  where w.school_year_id=v_year_id and (w.start_date<v_target_start or (w.start_date=v_target_start and w.id<=p_week_id));

  with calendar as (
    select w.id,row_number() over(order by w.start_date,w.week_number,w.id)::integer as seq,
      coalesce((
        select max(((w.start_date+(slot.weekday-1)) + coalesce(yp.end_time,p.end_time)) at time zone 'Asia/Ho_Chi_Minh')
        from (
          select o.weekday,o.period_number from public.week_schedule_overrides o
          where o.class_id=p_class_id and o.week_id=w.id and o.is_study_period=true
          union all
          select s.weekday,s.period_number from public.study_schedule s
          where s.class_id=p_class_id and s.is_study_period=true
            and not exists(select 1 from public.week_schedule_overrides ox where ox.class_id=p_class_id and ox.week_id=w.id)
        ) slot
        left join public.school_year_periods yp on yp.school_year_id=w.school_year_id and yp.period_number=slot.period_number
        left join public.periods p on p.period_number=slot.period_number
        where coalesce(yp.end_time,p.end_time) is not null
      ),(w.end_date+time '23:59:59') at time zone 'Asia/Ho_Chi_Minh') as end_ts
    from public.weeks w where w.school_year_id=v_year_id
  )
  select c.seq into v_current_seq from calendar c where now()<c.end_ts order by c.seq limit 1;
  if v_current_seq is null then return 'locked'::public.week_status; end if;
  if v_target_seq<v_current_seq then return 'locked'::public.week_status; end if;
  if v_target_seq in (v_current_seq,v_current_seq+1) then return 'open'::public.week_status; end if;
  return 'upcoming'::public.week_status;
end;
$class_week_effective_status$;

notify pgrst,'reload schema';
commit;
