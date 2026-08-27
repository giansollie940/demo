-- SỔ TỰ HỌC V8.7.1 — INSTALL FROM COMPATIBLE BASELINE
-- Dùng khi database đã có core Sổ Tự Học tương thích: profiles, weeks, registrations, periods.
-- Đây KHÔNG phải script cho Supabase project trống hoàn toàn.
-- Không chạy file này cùng với database/upgrade/01-UPGRADE-CURRENT-TO-V8.7.1.sql.
-- Sau khi hoàn tất, chạy database/verify/VERIFY-V8.7.1.sql.

-- SỔ TỰ HỌC V8.4.0 — FINAL CONSOLIDATED MIGRATION
-- Includes the V8.3.2n baseline followed by the exact V8.4.0 patch.
-- Do not run this file together with PATCH-V8.4.0-MULTICLASS.sql.

-- =====================================================================
-- SỔ TỰ HỌC — MIGRATION V8.3.2n FINAL CONSOLIDATED
-- Ngày hợp nhất: 2026-08-20
--
-- Đây là migration sạch V8.3.2n, có thể nâng cấp trực tiếp database Sổ Tự Học hiện hữu.
-- Có thể chạy trực tiếp trên database hiện tại; không xóa dữ liệu nghiệp vụ.
--
-- Tích hợp:
-- - V8.3.2 core + deadline cấu hình + revision overdue
-- - Emergency AI + safe soft delete
-- - Realtime publication
-- - AI-only với Groq
-- - AI watch + manual-review notification
-- - fail-safe AI treo > 2 phút
-- - GV chủ động gọi AI duyệt lại theo buổi
-- - chuẩn bị từng đăng ký ngay trước khi gọi AI, tránh hàng đợi batch bị stale
-- - security/RLS/grants hiện hành
--
-- SAU FILE NÀY: không chạy lại các patch g/h/i/j/k/l/n đã được hợp nhất.
-- NÊN SAO LƯU DATABASE TRƯỚC KHI CHẠY.
-- =====================================================================

create extension if not exists pgcrypto;
create extension if not exists pg_cron;

begin;

-- =====================================================================
-- 0. PREFLIGHT
-- =====================================================================

do $preflight$
begin
  if to_regclass('public.profiles') is null
     or to_regclass('public.weeks') is null
     or to_regclass('public.registrations') is null
     or to_regclass('public.periods') is null
  then
    raise exception
      'Thiếu bảng lõi. File này chỉ dùng để nâng cấp database Sổ Tự Học đang tồn tại.';
  end if;
end
$preflight$;

-- =====================================================================
-- 1. COLUMNS / TABLES
-- =====================================================================

alter table public.weeks
  add column if not exists deadline_mode text;

update public.weeks
set deadline_mode='per_session_20'
where deadline_mode is null;

alter table public.weeks
  alter column deadline_mode set default 'per_session_20',
  alter column deadline_mode set not null;

alter table public.registrations
  add column if not exists approval_source text not null default 'manual',
  add column if not exists auto_review_reason text,
  add column if not exists ai_review_status text not null default 'not_needed',
  add column if not exists ai_decision text,
  add column if not exists ai_category text,
  add column if not exists ai_confidence numeric,
  add column if not exists ai_revision_status text,
  add column if not exists ai_revision_confidence numeric,
  add column if not exists ai_reason text,
  add column if not exists ai_model text,
  add column if not exists ai_reviewed_at timestamptz,
  add column if not exists ai_review_count integer not null default 0,
  add column if not exists is_emergency boolean not null default false,
  add column if not exists emergency_reason text,
  add column if not exists emergency_requested_at timestamptz,
  add column if not exists uses_electronic_device boolean not null default false,
  add column if not exists device_detection_source text not null default 'none',
  add column if not exists device_detection_confidence numeric,
  add column if not exists revision_overdue_at timestamptz;

create table if not exists public.teacher_notifications (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null references public.registrations(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  week_id uuid not null references public.weeks(id) on delete cascade,
  notification_type text not null default 'manual_review',
  title text not null,
  message text,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.server_rate_limits (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id) on delete cascade,
  action text not null,
  created_at timestamptz not null default now()
);


create table if not exists public.ai_review_feedback (
  id bigint generated always as identity primary key,
  registration_id uuid references public.registrations(id) on delete set null,
  teacher_id uuid references public.profiles(id) on delete set null,
  feedback_type text not null,
  content text not null,
  note text,
  teacher_comment text,
  ai_decision text,
  ai_category text,
  ai_confidence numeric,
  ai_revision_status text,
  ai_revision_confidence numeric,
  ai_reason text,
  created_at timestamptz not null default now(),
  constraint ai_review_feedback_type_check
    check (feedback_type in (
      'teacher_revision_after_ai_approve',
      'teacher_approve_after_ai_manual',
      'teacher_approve_after_ai_revision',
      'legacy_revision_after_ai_approve'
    )),
  constraint ai_review_feedback_confidence_check
    check (
      ai_confidence is null
      or (ai_confidence >= 0 and ai_confidence <= 1)
    )
);

create index if not exists idx_ai_review_feedback_created_at
  on public.ai_review_feedback(created_at desc);

create index if not exists idx_ai_review_feedback_type_created
  on public.ai_review_feedback(feedback_type,created_at desc);

alter table public.ai_review_feedback
  add column if not exists ai_revision_status text,
  add column if not exists ai_revision_confidence numeric;

alter table public.ai_review_feedback
  drop constraint if exists ai_review_feedback_type_check;
alter table public.ai_review_feedback
  add constraint ai_review_feedback_type_check
  check (feedback_type in (
    'teacher_revision_after_ai_approve',
    'teacher_approve_after_ai_manual',
    'teacher_approve_after_ai_revision',
    'legacy_revision_after_ai_approve'
  ));

alter table public.ai_review_feedback
  drop constraint if exists ai_review_feedback_revision_status_check;
alter table public.ai_review_feedback
  add constraint ai_review_feedback_revision_status_check
  check (ai_revision_status is null or ai_revision_status in ('satisfied','not_satisfied','uncertain'));

alter table public.ai_review_feedback
  drop constraint if exists ai_review_feedback_revision_confidence_check;
alter table public.ai_review_feedback
  add constraint ai_review_feedback_revision_confidence_check
  check (ai_revision_confidence is null or (ai_revision_confidence >= 0 and ai_revision_confidence <= 1));


-- =====================================================================
-- 2. CHECK CONSTRAINTS
-- =====================================================================

alter table public.weeks
  drop constraint if exists weeks_deadline_mode_check;
alter table public.weeks
  add constraint weeks_deadline_mode_check
  check (deadline_mode in ('per_session_20','week_before_20','specific'));

alter table public.registrations
  drop constraint if exists registrations_approval_source_check;
alter table public.registrations
  add constraint registrations_approval_source_check
  check (approval_source in ('manual','auto_rule','ai'));

alter table public.registrations
  drop constraint if exists registrations_ai_review_status_check;
alter table public.registrations
  add constraint registrations_ai_review_status_check
  check (ai_review_status in ('not_needed','pending','processing','completed','error'));

alter table public.registrations
  drop constraint if exists registrations_ai_decision_check;
alter table public.registrations
  add constraint registrations_ai_decision_check
  check (ai_decision is null or ai_decision in ('auto_approve','request_revision','manual_review'));

alter table public.registrations
  drop constraint if exists registrations_ai_revision_status_check;
alter table public.registrations
  add constraint registrations_ai_revision_status_check
  check (ai_revision_status is null or ai_revision_status in ('satisfied','not_satisfied','uncertain'));

alter table public.registrations
  drop constraint if exists registrations_ai_revision_confidence_check;
alter table public.registrations
  add constraint registrations_ai_revision_confidence_check
  check (ai_revision_confidence is null or (ai_revision_confidence >= 0 and ai_revision_confidence <= 1));

alter table public.registrations
  drop constraint if exists registrations_device_detection_source_check;
alter table public.registrations
  add constraint registrations_device_detection_source_check
  check (device_detection_source in ('none','student','rule','ai'));

alter table public.registrations
  drop constraint if exists registrations_device_detection_confidence_check;
alter table public.registrations
  add constraint registrations_device_detection_confidence_check
  check (
    device_detection_confidence is null
    or (device_detection_confidence >= 0 and device_detection_confidence <= 1)
  );

-- Dữ liệu cũ V8.3.0: true nhưng chưa có provenance -> coi là HS đã khai báo,
-- đúng với patch V8.3.2 gốc.
update public.registrations
set device_detection_source='student',
    device_detection_confidence=1
where uses_electronic_device=true
  and coalesce(device_detection_source,'none')='none';

-- =====================================================================
-- 3. UNIQUES / INDEXES — KHÔNG XÓA DỮ LIỆU
-- =====================================================================

-- Nếu có duplicate đang hoạt động thì dừng để người quản trị xử lý thủ công,
-- tuyệt đối không tự xóa bản ghi.
do $duplicates$
begin
  if exists (
    select 1
    from public.registrations
    where is_deleted=false
    group by student_id,week_id,weekday,period_number
    having count(*) > 1
  ) then
    raise exception
      'Có đăng ký active trùng slot. Không tạo partial unique để tránh tự xóa dữ liệu.';
  end if;

  if exists (
    select 1
    from public.teacher_notifications
    group by registration_id,notification_type
    having count(*) > 1
  ) then
    raise exception
      'Có teacher_notifications trùng registration_id + notification_type.';
  end if;
end
$duplicates$;

alter table public.registrations
  drop constraint if exists registrations_student_id_week_id_weekday_period_number_key;

drop index if exists public.registrations_student_id_week_id_weekday_period_number_key;

create unique index if not exists uq_registrations_active_student_slot
  on public.registrations(student_id,week_id,weekday,period_number)
  where is_deleted=false;

create unique index if not exists teacher_notifications_registration_id_notification_type_key
  on public.teacher_notifications(registration_id,notification_type);

create index if not exists idx_registrations_week
  on public.registrations(week_id);

create index if not exists idx_registrations_student
  on public.registrations(student_id);

create index if not exists idx_registrations_status
  on public.registrations(status);

create index if not exists idx_registrations_ai_pending
  on public.registrations(ai_review_status,status);

create index if not exists idx_registrations_emergency
  on public.registrations(is_emergency,emergency_requested_at desc)
  where is_emergency=true;

create index if not exists idx_registrations_student_week_active
  on public.registrations(student_id,week_id)
  where is_deleted=false;

create index if not exists idx_registrations_week_slot_active
  on public.registrations(week_id,weekday,period_number,status)
  where is_deleted=false;

create index if not exists idx_registrations_revision_overdue
  on public.registrations(revision_overdue_at desc)
  where revision_overdue_at is not null and is_deleted=false;

create index if not exists idx_weeks_school_year
  on public.weeks(school_year_id,week_number);

create index if not exists idx_teacher_notifications_unread
  on public.teacher_notifications(is_read,created_at desc);

create index if not exists idx_server_rate_limits_actor_action_time
  on public.server_rate_limits(actor_id,action,created_at desc);

-- =====================================================================
-- 4. SETTINGS
-- =====================================================================

insert into public.app_settings(key,value) values
  ('smart_approval_enabled','true'::jsonb),
  ('ai_review_enabled','true'::jsonb),
  ('ai_auto_approve_threshold','0.90'::jsonb),
  ('per_session_deadline_time',to_jsonb('20:00'::text))
on conflict (key) do nothing;
insert into public.app_settings(key,value) values
  ('ai_revision_auto_approve_threshold','0.85'::jsonb),
  ('ai_feedback_memory_enabled','true'::jsonb)
on conflict (key) do nothing;


-- =====================================================================
-- 5. FUNCTIONS — FINAL V8.3.2
-- =====================================================================

create or replace function public.handle_new_user () returns trigger language plpgsql security definer
set
  search_path = public as $$
begin
  insert into public.profiles(id,full_name,email)
  values(new.id,coalesce(new.raw_user_meta_data->>'full_name',split_part(new.email,'@',1)),new.email)
  on conflict(id) do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.current_app_role () returns public.app_role language sql stable security definer
set
  search_path = public as $$ select role from public.profiles where id = auth.uid() and active = true $$;

create or replace function public.is_teacher () returns boolean language sql stable security definer
set
  search_path = public as $$ select coalesce(public.current_app_role() = 'teacher', false) $$;

create or replace function public.can_view_class () returns boolean language sql stable security definer
set
  search_path = public as $$ select coalesce(public.current_app_role() in ('monitor','teacher'), false) $$;

create or replace function public.current_app_class () returns text language sql stable security definer
set
  search_path = public as $$
  select class_name
  from public.profiles
  where id = auth.uid() and active = true
$$;

create or replace function public.can_view_student (target_student_id uuid) returns boolean language sql stable security definer
set
  search_path = public as $$
  select
    public.is_teacher()
    or (
      public.current_app_role() = 'monitor'
      and exists (
        select 1
        from public.profiles target
        where target.id = target_student_id
          and target.class_name = public.current_app_class()
      )
    )
$$;

create or replace function public.registration_deadline_for_slot(
  p_week_id uuid,
  p_weekday int
)
returns timestamptz
language sql
stable
security definer
set search_path=public
as $$
  with cfg as (
    select coalesce(
      (
        select case
          when (value #>> '{}') ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
            then (value #>> '{}')::time
          else null
        end
        from public.app_settings
        where key='per_session_deadline_time'
        limit 1
      ),
      time '20:00'
    ) as cutoff_time
  )
  select
    case w.deadline_mode
      when 'per_session_20' then
        (
          (
            w.start_date
            + (greatest(1,least(5,p_weekday))-1)
            - 1
          )::timestamp + cfg.cutoff_time
        ) at time zone 'Asia/Ho_Chi_Minh'
      when 'week_before_20' then
        (
          (w.start_date-1)::timestamp + cfg.cutoff_time
        ) at time zone 'Asia/Ho_Chi_Minh'
      when 'specific' then w.registration_deadline
      else w.registration_deadline
    end
  from public.weeks w
  cross join cfg
  where w.id=p_week_id
$$;

create or replace function public.study_session_start(
  p_week_id uuid,
  p_weekday int,
  p_period_number int
)
returns timestamptz
language sql
stable
security definer
set search_path=public
as $$
  select (
    (
      w.start_date + (greatest(1,least(5,p_weekday))-1)
    )::timestamp + p.start_time
  ) at time zone 'Asia/Ho_Chi_Minh'
  from public.weeks w
  join public.periods p on p.period_number=p_period_number
  where w.id=p_week_id
$$;

create or replace function public.week_effective_status(
  p_week_id uuid
)
returns public.week_status
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with target as (
    select
      w.id,
      w.school_year_id,
      w.start_date,
      w.status
    from public.weeks w
    where w.id = p_week_id
  ),
  clock as (
    select (now() at time zone 'Asia/Ho_Chi_Minh')::date as today
  ),
  anchor as (
    select w.start_date as current_start
    from public.weeks w
    join target t
      on t.school_year_id = w.school_year_id
    cross join clock c
    where c.today between w.start_date and (w.start_date + 6)
    order by w.start_date desc
    limit 1
  ),
  next_week as (
    select min(w.start_date) as next_start
    from public.weeks w
    join target t
      on t.school_year_id = w.school_year_id
    join anchor a
      on true
    where w.start_date > a.current_start
  )
  select
    case
      when t.status = 'holiday'
        then 'holiday'::public.week_status

      -- Trường hợp hôm nay nằm ngoài toàn bộ lịch tuần của năm học.
      when a.current_start is null then
        case
          when (t.start_date + 6) < c.today
            then 'locked'::public.week_status
          else 'upcoming'::public.week_status
        end

      when t.start_date < a.current_start
        then 'locked'::public.week_status

      when t.start_date = a.current_start
        then 'open'::public.week_status

      when n.next_start is not null
           and t.start_date = n.next_start
        then 'open'::public.week_status

      else 'upcoming'::public.week_status
    end
  from target t
  cross join clock c
  left join anchor a on true
  left join next_week n on true
$$;

create or replace function public.week_registration_is_open(
  p_week_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    public.week_effective_status(p_week_id) = 'open'::public.week_status,
    false
  )
$$;

create or replace function public.sync_week_statuses()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_changed integer := 0;
begin
  with desired as (
    select
      w.id,
      public.week_effective_status(w.id) as desired_status
    from public.weeks w
  )
  update public.weeks w
  set status = d.desired_status
  from desired d
  where d.id = w.id
    -- Holiday là trạng thái do giáo viên chủ động đặt.
    and w.status <> 'holiday'
    and d.desired_status is not null
    and w.status is distinct from d.desired_status;

  get diagnostics v_changed = row_count;
  return v_changed;
end
$$;

create or replace function public.sync_week_statuses_after_calendar_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.sync_week_statuses();
  return null;
end
$$;

create or replace function public.registration_emergency_flag_matches(
  p_registration_id uuid,
  p_flag boolean
)
returns boolean
language sql
stable
security definer
set search_path=public
as $$
  select coalesce(
    (select r.is_emergency=p_flag
     from public.registrations r
     where r.id=p_registration_id),
    false
  )
$$;

create or replace function public.ai_automation_is_enabled () returns boolean language sql stable security definer
set
  search_path = public as $$
  select
    coalesce(
      (select value='true'::jsonb from public.app_settings where key='smart_approval_enabled'),
      true
    )
    and
    coalesce(
      (select value='true'::jsonb from public.app_settings where key='ai_review_enabled'),
      true
    )
$$;

create or replace function public.apply_smart_approval()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  v_ai_automation_enabled boolean := public.ai_automation_is_enabled();
  v_should_review boolean := false;
  v_force_ai boolean :=
    coalesce(current_setting('app.force_ai_rereview', true),'')='on';
begin
  -- GV chủ động gọi AI duyệt lại: chỉ đưa vào pending khi AI automation đang bật.
  if v_force_ai and public.is_teacher() then
    new.status:='submitted';
    new.approval_source:='manual';
    new.ai_decision:=null;
    new.ai_category:=null;
    new.ai_confidence:=null;
    new.ai_revision_status:=null;
    new.ai_revision_confidence:=null;
    new.ai_reason:=null;
    new.ai_model:=null;
    new.ai_reviewed_at:=null;
    new.approved_at:=null;
    new.approved_by:=null;

    if v_ai_automation_enabled then
      new.auto_review_reason:='GV chủ động yêu cầu AI duyệt lại.';
      new.ai_review_status:='pending';
    else
      new.auto_review_reason:='Duyệt tự động bằng AI đang tắt; chuyển giáo viên duyệt.';
      new.ai_review_status:='not_needed';
    end if;
    return new;
  end if;

  -- Khi GV yêu cầu sửa, xóa kết quả AI hiện hành; lịch sử bất đồng đã được trigger feedback lưu riêng.
  if tg_op='UPDATE'
     and new.status='needs_revision'
     and old.status is distinct from 'needs_revision'
     and public.is_teacher()
  then
    new.revision_overdue_at:=null;
    new.approval_source:='manual';
    new.ai_review_status:='not_needed';
    new.ai_decision:=null;
    new.ai_category:=null;
    new.ai_confidence:=null;
    new.ai_revision_status:=null;
    new.ai_revision_confidence:=null;
    new.ai_reason:=null;
    new.ai_model:=null;
    new.ai_reviewed_at:=null;
    new.approved_at:=null;
    new.approved_by:=null;
  end if;

  -- HS sửa một đăng ký đã duyệt thì luôn quay về submitted để xét lại.
  if auth.uid()=new.student_id and new.status='approved' then
    new.status:='submitted';
    new.approval_source:='manual';
    new.approved_at:=null;
    new.approved_by:=null;
  end if;

  if new.status='submitted' then
    if tg_op='INSERT' then
      v_should_review:=true;
    elsif old.status is distinct from 'submitted'
       or old.content is distinct from new.content
       or old.note is distinct from new.note
       or old.uses_electronic_device is distinct from new.uses_electronic_device
    then
      v_should_review:=true;
    end if;
  end if;

  if v_should_review then
    new.status:='submitted';
    new.approval_source:='manual';
    new.ai_decision:=null;
    new.ai_category:=null;
    new.ai_confidence:=null;
    new.ai_revision_status:=null;
    new.ai_revision_confidence:=null;
    new.ai_reason:=null;
    new.ai_model:=null;
    new.ai_reviewed_at:=null;
    new.approved_at:=null;
    new.approved_by:=null;

    if v_ai_automation_enabled then
      new.auto_review_reason:=
        case
          when coalesce(new.teacher_comment,'')<>''
            then 'AI-only: học sinh đã sửa theo phản hồi giáo viên; Groq AI duyệt lại.'
          when coalesce(new.is_emergency,false)
            then 'Đăng ký bổ sung sau deadline; Groq AI kiểm tra trước.'
          else 'AI-only: mọi đăng ký gửi mới được Groq AI kiểm tra trước.'
        end;
      new.ai_review_status:='pending';
    else
      new.auto_review_reason:='Duyệt tự động bằng AI đang tắt; chuyển giáo viên duyệt.';
      new.ai_review_status:='not_needed';
    end if;

  elsif new.status='approved' and auth.uid() is distinct from new.student_id then
    if new.approval_source<>'ai' then
      new.approval_source:='manual';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.sync_stale_ai_reviews()
returns integer
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_count integer := 0;
begin
  update public.registrations
  set
    status='submitted',
    approval_source='manual',
    ai_review_status='error',
    ai_decision='manual_review',
    ai_category=null,
    ai_confidence=null,
    ai_revision_status=null,
    ai_revision_confidence=null,
    ai_reason='AI không phản hồi trong 2 phút; hệ thống tự chuyển giáo viên duyệt.',
    ai_reviewed_at=now(),
    approved_at=null,
    approved_by=null,
    updated_at=now()
  where is_deleted=false
    and status='submitted'
    and approval_source='manual'
    and ai_review_status in ('pending','processing')
    and updated_at <= now() - interval '2 minutes';

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;


create or replace function public.capture_ai_teacher_feedback()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  v_type text:=null;
begin
  if not public.is_teacher() then
    return new;
  end if;

  if old.ai_review_status='completed'
     and old.ai_decision='auto_approve'
     and new.status='needs_revision'
     and old.status is distinct from 'needs_revision'
  then
    v_type:='teacher_revision_after_ai_approve';

  elsif old.ai_review_status='completed'
     and old.ai_decision='manual_review'
     and new.status='approved'
     and new.approval_source='manual'
  then
    v_type:='teacher_approve_after_ai_manual';

  elsif old.ai_review_status='completed'
     and old.ai_decision='request_revision'
     and new.status='approved'
     and new.approval_source='manual'
  then
    v_type:='teacher_approve_after_ai_revision';
  end if;

  if v_type is not null then
    insert into public.ai_review_feedback(
      registration_id,teacher_id,feedback_type,content,note,teacher_comment,
      ai_decision,ai_category,ai_confidence,ai_revision_status,ai_revision_confidence,ai_reason,created_at
    )
    values(
      old.id,auth.uid(),v_type,coalesce(old.content,''),old.note,new.teacher_comment,
      old.ai_decision,old.ai_category,old.ai_confidence,old.ai_revision_status,old.ai_revision_confidence,old.ai_reason,now()
    );
  end if;

  return new;
end;
$$;

create or replace function public.get_ai_feedback_memory_stats()
returns table(
  total_feedback bigint,
  revision_after_ai_approve bigint,
  approve_after_ai_manual bigint,
  approve_after_ai_revision bigint,
  last_feedback_at timestamptz,
  memory_enabled boolean,
  candidate_limit integer,
  selected_limit integer
)
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $$
begin
  if not public.is_teacher() then
    raise exception 'Chỉ giáo viên được xem thống kê bộ nhớ AI.' using errcode='42501';
  end if;

  return query
  select
    count(*)::bigint as total_feedback,
    count(*) filter (where feedback_type in ('teacher_revision_after_ai_approve','legacy_revision_after_ai_approve'))::bigint as revision_after_ai_approve,
    count(*) filter (where feedback_type='teacher_approve_after_ai_manual')::bigint as approve_after_ai_manual,
    count(*) filter (where feedback_type='teacher_approve_after_ai_revision')::bigint as approve_after_ai_revision,
    max(created_at) as last_feedback_at,
    coalesce((select value='true'::jsonb from public.app_settings where key='ai_feedback_memory_enabled'),true) as memory_enabled,
    80::integer as candidate_limit,
    25::integer as selected_limit
  from public.ai_review_feedback;
end;
$$;

create or replace function public.guard_student_registration_update()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  -- Chỉ khóa payload của HS/cán sự đang sửa bản ghi của chính mình.
  -- Giáo viên và service_role/Edge Function không bị chặn bởi guard này.
  if auth.uid() is not null
     and public.current_app_role() in ('student','monitor')
     and old.student_id=auth.uid()
  then
    -- Cho phép đúng một kiểu thay đổi do RPC delete_registration_safely thực hiện:
    -- HS/cán sự hủy đăng ký bổ sung của chính mình trước giờ học.
    if old.is_emergency=true
       and old.is_deleted=false
       and new.is_deleted=true
       and new.deleted_by=auth.uid()
       and new.deleted_at is not null
       and now() < public.study_session_start(
         old.week_id,old.weekday,old.period_number
       )
       and (
         to_jsonb(new)
           - 'is_deleted' - 'deleted_at' - 'deleted_by' - 'updated_at'
       ) = (
         to_jsonb(old)
           - 'is_deleted' - 'deleted_at' - 'deleted_by' - 'updated_at'
       )
    then
      return new;
    end if;

    if new.id is distinct from old.id
       or new.student_id is distinct from old.student_id
       or new.week_id is distinct from old.week_id
       or new.weekday is distinct from old.weekday
       or new.period_number is distinct from old.period_number
    then
      raise exception 'Không được thay đổi chủ sở hữu hoặc ô thời khóa biểu của đăng ký.'
        using errcode='42501';
    end if;

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
    then
      raise exception 'Không được thay đổi trường do giáo viên hoặc máy chủ quản lý.'
        using errcode='42501';
    end if;
  end if;

  return new;
end;
$$;

-- =====================================================================
-- AI RE-REVIEW THEO BUỔI — V8.3.2n
-- Không đưa cả buổi vào pending cùng lúc.
-- Danh sách ứng viên được lấy trước; từng registration được prepare ngay
-- trước lúc gọi Edge Function để tránh fail-safe hết hạn hàng loạt.
-- =====================================================================

create or replace function public.prepare_session_ai_rereview(
  p_week_id uuid,
  p_weekday integer,
  p_period_number integer
)
returns table(registration_id uuid)
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  if not public.is_teacher() then
    raise exception 'Chỉ giáo viên được gọi AI duyệt lại theo buổi.'
      using errcode='42501';
  end if;

  if not public.ai_automation_is_enabled() then
    raise exception 'Duyệt tự động bằng AI đang tắt trong Cài đặt. Hãy bật trước khi duyệt lại.'
      using errcode='P0001';
  end if;

  if p_week_id is null
     or p_weekday not between 1 and 5
     or p_period_number not between 1 and 9
  then
    raise exception 'Thông tin buổi tự học không hợp lệ.'
      using errcode='22023';
  end if;

  return query
  select r.id
  from public.registrations r
  where r.week_id=p_week_id
    and r.weekday=p_weekday
    and r.period_number=p_period_number
    and r.is_deleted=false
    and r.revision_overdue_at is null
    and (
      r.status='approved'
      or (
        r.status='submitted'
        and r.ai_review_status not in ('pending','processing')
      )
    )
  order by r.updated_at,r.id;
end;
$$;

create or replace function public.prepare_registration_ai_rereview(
  p_registration_id uuid
)
returns boolean
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  if not public.is_teacher() then
    raise exception 'Chỉ giáo viên được gọi AI duyệt lại.'
      using errcode='42501';
  end if;

  if not public.ai_automation_is_enabled() then
    raise exception 'Duyệt tự động bằng AI đang tắt trong Cài đặt. Hãy bật trước khi duyệt lại.'
      using errcode='P0001';
  end if;

  perform set_config('app.force_ai_rereview','on',true);

  update public.registrations r
  set
    status='submitted',
    approval_source='manual',
    ai_review_status='pending',
    ai_decision=null,
    ai_category=null,
    ai_confidence=null,
    ai_revision_status=null,
    ai_revision_confidence=null,
    ai_reason=null,
    ai_model=null,
    ai_reviewed_at=null,
    approved_at=null,
    approved_by=null,
    auto_review_reason='GV chủ động yêu cầu AI duyệt lại.',
    updated_at=now()
  where r.id=p_registration_id
    and r.is_deleted=false
    and r.revision_overdue_at is null
    and (
      r.status='approved'
      or (
        r.status='submitted'
        and r.ai_review_status not in ('pending','processing')
      )
    );

  return found;
end;
$$;

-- =====================================================================
-- REVISION OVERDUE REPORT
-- =====================================================================

create or replace function public.sync_revision_overdue_reports()
returns integer
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_changed integer:=0;
begin
  update public.registrations r
  set
    revision_overdue_at=coalesce(r.revision_overdue_at,now()),
    updated_at=now()
  where r.is_deleted=false
    and r.status='needs_revision'
    and r.revision_overdue_at is null
    and public.week_effective_status(r.week_id)<>'holiday'
    and public.study_session_start(
      r.week_id,r.weekday,r.period_number
    ) is not null
    and now()>=public.study_session_start(
      r.week_id,r.weekday,r.period_number
    );

  get diagnostics v_changed=row_count;
  return v_changed;
end
$$;

-- =====================================================================
-- SAFE SOFT DELETE RPC
-- =====================================================================

create or replace function public.delete_registration_safely(
  p_registration_id uuid
)
returns boolean
language plpgsql
volatile
security definer
set search_path=public,pg_temp
as $$
declare
  v_actor uuid:=auth.uid();
  v_role public.app_role;
  v_registration public.registrations%rowtype;
  v_session_start timestamptz;
begin
  if v_actor is null then
    raise exception 'Bạn chưa đăng nhập.'
      using errcode='42501';
  end if;

  v_role:=public.current_app_role();
  if v_role is null then
    raise exception 'Tài khoản không còn hoạt động.'
      using errcode='42501';
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

  if v_role='teacher' then
    null; -- GV được xóa mềm mọi đăng ký đang hoạt động.
  elsif v_role in ('student','monitor')
        and v_registration.student_id=v_actor
        and v_registration.is_emergency=true
  then
    v_session_start:=public.study_session_start(
      v_registration.week_id,
      v_registration.weekday,
      v_registration.period_number
    );

    if v_session_start is null or now()>=v_session_start then
      raise exception 'Chỉ được hủy đăng ký bổ sung trước khi buổi tự học bắt đầu.'
        using errcode='42501';
    end if;
  else
    raise exception 'Bạn không có quyền xóa đăng ký này.'
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
end;
$$;

-- =====================================================================
-- 6. TRIGGERS — FINAL V8.3.2
-- =====================================================================

drop trigger if exists trg_05_guard_student_registration_update
on public.registrations;
create trigger trg_05_guard_student_registration_update
before update on public.registrations
for each row execute function public.guard_student_registration_update();

drop trigger if exists trg_apply_smart_approval
on public.registrations;
create trigger trg_apply_smart_approval
before insert or update of status,content,note,uses_electronic_device
on public.registrations
for each row execute function public.apply_smart_approval();

drop trigger if exists trg_sync_teacher_review_notification
on public.registrations;

create trigger trg_sync_teacher_review_notification
after insert or update of
  status,content,note,approval_source,ai_review_status,ai_reason,
  is_emergency,emergency_reason,is_deleted
on public.registrations
for each row
execute function public.sync_teacher_review_notification();


drop trigger if exists trg_capture_ai_teacher_feedback
on public.registrations;

create trigger trg_capture_ai_teacher_feedback
after update of status,approval_source,teacher_comment
on public.registrations
for each row
execute function public.capture_ai_teacher_feedback();


drop trigger if exists trg_sync_week_statuses_after_calendar_change
on public.weeks;
create trigger trg_sync_week_statuses_after_calendar_change
after insert or update of school_year_id,week_number,start_date,end_date
on public.weeks
for each statement execute function public.sync_week_statuses_after_calendar_change();

-- =====================================================================
-- 7. class_members VIEW
-- =====================================================================

drop view if exists public.class_members;
create view public.class_members
with (security_invoker=on)
as
select id,student_code,full_name,role,class_name,active
from public.profiles
where
  id=auth.uid()
  or public.is_teacher()
  or (
    public.current_app_role()='monitor'
    and class_name=public.current_app_class()
  );

-- =====================================================================
-- 8. RLS + FINAL POLICIES
-- =====================================================================

alter table public.profiles enable row level security;
alter table public.school_years enable row level security;
alter table public.weeks enable row level security;
alter table public.periods enable row level security;
alter table public.study_schedule enable row level security;
alter table public.week_schedule_overrides enable row level security;
alter table public.registrations enable row level security;
alter table public.audit_logs enable row level security;
alter table public.app_settings enable row level security;
alter table public.teacher_notifications enable row level security;
alter table public.server_rate_limits enable row level security;
alter table public.ai_review_feedback enable row level security;

drop policy if exists profiles_select on public.profiles;
create policy profiles_select
on public.profiles
for select
to authenticated
using (
  (id=auth.uid() and active=true)
  or public.is_teacher()
  or (
    public.current_app_role()='monitor'
    and class_name=public.current_app_class()
  )
);

drop policy if exists school_years_read on public.school_years;
create policy school_years_read
on public.school_years for select to authenticated using (true);

drop policy if exists school_years_teacher_all on public.school_years;
create policy school_years_teacher_all
on public.school_years for all to authenticated
using (public.is_teacher())
with check (public.is_teacher());

drop policy if exists weeks_read on public.weeks;
create policy weeks_read
on public.weeks for select to authenticated using (true);

drop policy if exists weeks_teacher_all on public.weeks;
create policy weeks_teacher_all
on public.weeks for all to authenticated
using (public.is_teacher())
with check (public.is_teacher());

drop policy if exists periods_read on public.periods;
create policy periods_read
on public.periods for select to authenticated using (true);

drop policy if exists periods_teacher_all on public.periods;
create policy periods_teacher_all
on public.periods for all to authenticated
using (public.is_teacher())
with check (public.is_teacher());

drop policy if exists schedule_read on public.study_schedule;
create policy schedule_read
on public.study_schedule for select to authenticated using (true);

drop policy if exists schedule_teacher_all on public.study_schedule;
create policy schedule_teacher_all
on public.study_schedule for all to authenticated
using (public.is_teacher())
with check (public.is_teacher());

drop policy if exists overrides_read on public.week_schedule_overrides;
create policy overrides_read
on public.week_schedule_overrides for select to authenticated using (true);

drop policy if exists overrides_teacher_all on public.week_schedule_overrides;
create policy overrides_teacher_all
on public.week_schedule_overrides for all to authenticated
using (public.is_teacher())
with check (public.is_teacher());

drop policy if exists settings_read on public.app_settings;
create policy settings_read
on public.app_settings for select to authenticated using (true);

drop policy if exists settings_teacher_all on public.app_settings;
create policy settings_teacher_all
on public.app_settings for all to authenticated
using (public.is_teacher())
with check (public.is_teacher());

-- V8.3.0 final select: monitor/teacher không đọc draft của người khác.
drop policy if exists registrations_select_v830 on public.registrations;
drop policy if exists registrations_select on public.registrations;
create policy registrations_select
on public.registrations
for select
to authenticated
using (
  is_deleted=false
  and (
    (
      student_id=(select auth.uid())
      and public.current_app_role() in ('student','monitor')
    )
    or (
      status<>'draft'
      and public.can_view_student(student_id)
    )
  )
);

-- FINAL insert: tuần động + deadline + không giả emergency.
-- V8.3.2n: HS chỉ ghi draft/submitted; không còn đường tự ghi approved theo keyword rule.
drop policy if exists registrations_student_insert_v830 on public.registrations;
drop policy if exists registrations_student_insert on public.registrations;
create policy registrations_student_insert
on public.registrations
for insert
to authenticated
with check (
  public.current_app_role() in ('student','monitor')
  and student_id=(select auth.uid())
  and is_deleted=false
  and is_emergency=false
  and status in ('draft','submitted')
  and public.week_registration_is_open(week_id)
  and (
    public.registration_deadline_for_slot(week_id,weekday) is null
    or now() <= public.registration_deadline_for_slot(week_id,weekday)
  )
);

-- FINAL update: approved được sửa trước deadline/session;
-- needs_revision vẫn sửa sau deadline; emergency flag không được đổi.
-- V8.3.2n: bản ghi sau khi HS sửa phải là draft/submitted; AI/teacher mới được tạo approved.
drop policy if exists registrations_student_update_v830 on public.registrations;
drop policy if exists registrations_student_update on public.registrations;
create policy registrations_student_update
on public.registrations
for update
to authenticated
using (
  public.current_app_role() in ('student','monitor')
  and student_id=(select auth.uid())
  and is_deleted=false
  and status in ('draft','submitted','needs_revision','approved')
  and (
    (
      status='needs_revision'
      and revision_overdue_at is null
      and now() < public.study_session_start(
        week_id,weekday,period_number
      )
    )
    or (
      status<>'needs_revision'
      and public.week_registration_is_open(week_id)
      and (
        public.registration_deadline_for_slot(week_id,weekday) is null
        or now() <= public.registration_deadline_for_slot(week_id,weekday)
      )
      and now() < public.study_session_start(
        week_id,weekday,period_number
      )
    )
  )
)
with check (
  public.current_app_role() in ('student','monitor')
  and student_id=(select auth.uid())
  and is_deleted=false
  and revision_overdue_at is null
  and public.registration_emergency_flag_matches(id,is_emergency)
  and status in ('draft','submitted')
);

-- V8.3.2n: dọn engine keyword legacy sau khi trigger/function/policy mới đã thay dependency.
drop trigger if exists trg_10_detect_electronic_device on public.registrations;
drop function if exists public.apply_device_detection();
drop function if exists public.detect_electronic_device_from_text(text,text);
drop function if exists public.smart_review_route(text,text);
drop function if exists public.smart_review_registration(text,text);
drop function if exists public.smart_approval_is_enabled();
drop function if exists public.ai_review_is_enabled();
drop function if exists public.ai_auto_approve_threshold();

drop policy if exists registrations_teacher_update_v830 on public.registrations;
drop policy if exists registrations_teacher_update on public.registrations;
create policy registrations_teacher_update
on public.registrations
for update
to authenticated
using (public.is_teacher())
with check (public.is_teacher());

drop policy if exists teacher_notifications_select on public.teacher_notifications;
create policy teacher_notifications_select
on public.teacher_notifications
for select to authenticated
using (public.is_teacher());

drop policy if exists teacher_notifications_update on public.teacher_notifications;
create policy teacher_notifications_update
on public.teacher_notifications
for update to authenticated
using (public.is_teacher())
with check (public.is_teacher());

drop policy if exists teacher_notifications_delete on public.teacher_notifications;
create policy teacher_notifications_delete
on public.teacher_notifications
for delete to authenticated
using (public.is_teacher());

-- Audit V8.2.1+: browser không được INSERT/UPDATE/DELETE.
drop policy if exists audit_authenticated_insert on public.audit_logs;
drop policy if exists audit_teacher_select on public.audit_logs;
create policy audit_teacher_select
on public.audit_logs
for select to authenticated
using (public.is_teacher());

-- server_rate_limits cố ý không có browser policy.

-- =====================================================================
-- 9. GRANTS / REVOKES
-- =====================================================================

revoke all on table public.profiles from anon;
revoke all on table public.school_years from anon;
revoke all on table public.weeks from anon;
revoke all on table public.periods from anon;
revoke all on table public.study_schedule from anon;
revoke all on table public.week_schedule_overrides from anon;
revoke all on table public.registrations from anon;
revoke all on table public.audit_logs from anon;
revoke all on table public.app_settings from anon;
revoke all on table public.teacher_notifications from anon;
revoke all on table public.server_rate_limits from anon;
revoke all on table public.ai_review_feedback from anon;
revoke all on public.class_members from anon;

revoke all on table public.profiles from authenticated;
grant select (id,student_code,full_name,role,class_name,active)
on public.profiles to authenticated;

revoke all on table public.school_years from authenticated;
grant select,insert,update,delete on public.school_years to authenticated;

revoke all on table public.weeks from authenticated;
grant select,insert,update,delete on public.weeks to authenticated;

revoke all on table public.periods from authenticated;
grant select,insert,update,delete on public.periods to authenticated;

revoke all on table public.study_schedule from authenticated;
grant select,insert,update,delete on public.study_schedule to authenticated;

revoke all on table public.week_schedule_overrides from authenticated;
grant select,insert,update,delete on public.week_schedule_overrides to authenticated;

revoke all on table public.app_settings from authenticated;
grant select,insert,update,delete on public.app_settings to authenticated;

revoke all on table public.registrations from authenticated;
grant select,insert,update on public.registrations to authenticated;

revoke all on table public.teacher_notifications from authenticated;
grant select,update,delete on public.teacher_notifications to authenticated;

revoke all on table public.audit_logs from authenticated;
grant select on public.audit_logs to authenticated;

revoke all on table public.server_rate_limits from authenticated;
revoke all on table public.ai_review_feedback from authenticated;

revoke all on public.class_members from authenticated;
grant select on public.class_members to authenticated;

grant select,insert,update,delete on
  public.profiles,
  public.school_years,
  public.weeks,
  public.periods,
  public.study_schedule,
  public.week_schedule_overrides,
  public.registrations,
  public.audit_logs,
  public.app_settings,
  public.teacher_notifications,
  public.server_rate_limits,
  public.ai_review_feedback
to service_role;

grant usage,select on sequence public.audit_logs_id_seq to service_role;
grant usage,select on sequence public.server_rate_limits_id_seq to service_role;
grant usage,select on sequence public.ai_review_feedback_id_seq to service_role;

-- Function grants
revoke all on function public.current_app_role() from public;
revoke all on function public.is_teacher() from public;
revoke all on function public.can_view_class() from public;
revoke all on function public.current_app_class() from public;
revoke all on function public.can_view_student(uuid) from public;
revoke all on function public.registration_deadline_for_slot(uuid,integer) from public;
revoke all on function public.study_session_start(uuid,integer,integer) from public;
revoke all on function public.week_effective_status(uuid) from public;
revoke all on function public.week_registration_is_open(uuid) from public;
revoke all on function public.registration_emergency_flag_matches(uuid,boolean) from public;
revoke all on function public.ai_automation_is_enabled() from public;
revoke all on function public.sync_week_statuses() from public;
revoke all on function public.sync_revision_overdue_reports() from public;
revoke all on function public.handle_new_user() from public;
revoke all on function public.apply_smart_approval() from public;
revoke all on function public.sync_teacher_review_notification() from public;
revoke all on function public.capture_ai_teacher_feedback() from public;
revoke all on function public.get_ai_feedback_memory_stats() from public;
revoke all on function public.sync_week_statuses_after_calendar_change() from public;
revoke all on function public.guard_student_registration_update() from public;
revoke all on function public.delete_registration_safely(uuid) from public,anon;
revoke all on function public.prepare_session_ai_rereview(uuid,integer,integer) from public,anon;
revoke all on function public.prepare_registration_ai_rereview(uuid) from public,anon;
revoke all on function public.sync_stale_ai_reviews() from public,anon,authenticated;

grant execute on function public.current_app_role() to authenticated,service_role;
grant execute on function public.is_teacher() to authenticated,service_role;
grant execute on function public.can_view_class() to authenticated,service_role;
grant execute on function public.current_app_class() to authenticated,service_role;
grant execute on function public.can_view_student(uuid) to authenticated,service_role;
grant execute on function public.registration_deadline_for_slot(uuid,integer) to authenticated,service_role;
grant execute on function public.study_session_start(uuid,integer,integer) to authenticated,service_role;
grant execute on function public.week_effective_status(uuid) to authenticated,service_role;
grant execute on function public.week_registration_is_open(uuid) to authenticated,service_role;
grant execute on function public.registration_emergency_flag_matches(uuid,boolean) to authenticated,service_role;
grant execute on function public.ai_automation_is_enabled() to authenticated,service_role;
grant execute on function public.sync_week_statuses() to service_role;
grant execute on function public.sync_revision_overdue_reports() to service_role;
grant execute on function public.delete_registration_safely(uuid) to authenticated,service_role;
grant execute on function public.prepare_session_ai_rereview(uuid,integer,integer) to authenticated,service_role;
grant execute on function public.prepare_registration_ai_rereview(uuid) to authenticated,service_role;
grant execute on function public.sync_stale_ai_reviews() to service_role;
grant execute on function public.get_ai_feedback_memory_stats() to authenticated,service_role;


-- Tạo thông báo thông tin cho các đăng ký bổ sung đang còn hoạt động đã có từ trước.
insert into public.teacher_notifications(
  registration_id,student_id,week_id,notification_type,
  title,message,is_read,created_at
)
select
  r.id,
  r.student_id,
  r.week_id,
  'emergency_notice',
  case
    when r.status='approved' and r.approval_source='ai'
      then '✅ AI đã duyệt đăng ký bổ sung'
    when r.ai_review_status in ('pending','processing')
      then '🚨 Có đăng ký bổ sung mới'
    when r.status in ('submitted','needs_revision')
      then '⚠️ Đăng ký bổ sung cần giáo viên xem'
    else '🚨 Thông tin đăng ký bổ sung'
  end,
  coalesce(p.full_name,'Học sinh') || ': ' ||
  left(coalesce(r.content,''),160) ||
  case
    when coalesce(r.emergency_reason,'')<>''
      then ' — Lý do bổ sung: '||left(r.emergency_reason,180)
    else ''
  end,
  false,
  coalesce(r.emergency_requested_at,r.updated_at,now())
from public.registrations r
left join public.profiles p on p.id=r.student_id
where r.is_emergency=true
  and r.is_deleted=false
on conflict (registration_id,notification_type)
do nothing;


-- Backfill thông báo theo dõi cho registration AI đang chờ hiện có.
insert into public.teacher_notifications(
  registration_id,student_id,week_id,notification_type,
  title,message,is_read,created_at
)
select
  r.id,
  r.student_id,
  r.week_id,
  'ai_watch',
  case
    when r.ai_review_status='processing'
      then '🤖 AI đang đọc đăng ký'
    else '🤖 Đăng ký mới đang chờ AI'
  end,
  coalesce(p.full_name,'Học sinh') || ': ' ||
  left(coalesce(r.content,''),160) ||
  ' — Nếu AI không phản hồi trong 2 phút, hệ thống sẽ tự chuyển giáo viên duyệt.',
  false,
  now()
from public.registrations r
left join public.profiles p on p.id=r.student_id
where r.is_deleted=false
  and r.status='submitted'
  and r.approval_source='manual'
  and r.ai_review_status in ('pending','processing')
on conflict (registration_id,notification_type)
do update set
  title=excluded.title,
  message=excluded.message,
  is_read=false;



insert into public.ai_review_feedback(
  registration_id,teacher_id,feedback_type,content,note,teacher_comment,
  ai_decision,ai_category,ai_confidence,ai_reason,created_at
)
select
  r.id,null,'legacy_revision_after_ai_approve',
  coalesce(r.content,''),r.note,r.teacher_comment,
  r.ai_decision,r.ai_category,r.ai_confidence,r.ai_reason,
  coalesce(r.updated_at,now())
from public.registrations r
where r.is_deleted=false
  and r.status='needs_revision'
  and r.approval_source='ai'
  and r.ai_decision='auto_approve'
  and not exists (
    select 1
    from public.ai_review_feedback f
    where f.registration_id=r.id
      and f.feedback_type='legacy_revision_after_ai_approve'
  );

update public.registrations
set
  approval_source='manual',
  ai_review_status='not_needed',
  ai_decision=null,
  ai_category=null,
  ai_confidence=null,
  ai_reason=null,
  ai_model=null,
  ai_reviewed_at=null,
  approved_at=null,
  approved_by=null,
  updated_at=now()
where is_deleted=false
  and status='needs_revision'
  and (
    approval_source='ai'
    or ai_review_status='completed'
    or ai_decision is not null
    or ai_confidence is not null
  );


-- V8.3.2: ghi nhận needs_revision quá giờ bắt đầu tiết trong tối đa ~1 phút.
select public.sync_revision_overdue_reports();

do $cron_revision$
declare
  v_job_id bigint;
begin
  for v_job_id in
    select jobid
    from cron.job
    where jobname='so-tu-hoc-sync-revision-overdue'
  loop
    perform cron.unschedule(v_job_id);
  end loop;
end
$cron_revision$;

select cron.schedule(
  'so-tu-hoc-sync-revision-overdue',
  '* * * * *',
  $job$select public.sync_revision_overdue_reports();$job$
);


commit;

-- =====================================================================
-- 10. AI FAIL-SAFE — ĐỒNG BỘ NGAY + CRON MỖI PHÚT
-- =====================================================================

select public.sync_stale_ai_reviews() as stale_ai_moved_to_teacher_now;

do $cron_ai_failsafe$
declare
  v_job_id bigint;
begin
  for v_job_id in
    select jobid
    from cron.job
    where jobname='so-tu-hoc-sync-stale-ai-reviews'
  loop
    perform cron.unschedule(v_job_id);
  end loop;
end
$cron_ai_failsafe$;

select cron.schedule(
  'so-tu-hoc-sync-stale-ai-reviews',
  '* * * * *',
  $job$select public.sync_stale_ai_reviews();$job$
) as ai_failsafe_cron_job_id;


-- =====================================================================
-- 11. AUTO WEEK — ĐỒNG BỘ NGAY + CRON 15 PHÚT
-- Quyền đăng ký không phụ thuộc Cron; week_registration_is_open() tính động.
-- =====================================================================

select public.sync_week_statuses() as weeks_changed_now;

do $cron$
declare
  v_job_id bigint;
begin
  for v_job_id in
    select jobid
    from cron.job
    where jobname='so-tu-hoc-sync-week-statuses'
  loop
    perform cron.unschedule(v_job_id);
  end loop;
end
$cron$;

select cron.schedule(
  'so-tu-hoc-sync-week-statuses',
  '*/15 * * * *',
  $job$select public.sync_week_statuses();$job$
) as cron_job_id;


-- =====================================================================
-- 12. SUPABASE REALTIME
-- Idempotent: chỉ thêm bảng chưa có trong publication supabase_realtime.
-- Các bảng được theo dõi:
-- registrations, teacher_notifications, app_settings, weeks,
-- study_schedule, week_schedule_overrides.
-- =====================================================================

do $realtime$
declare
  v_table text;
  v_tables text[] := array[
    'registrations',
    'teacher_notifications',
    'app_settings',
    'weeks',
    'study_schedule',
    'week_schedule_overrides'
  ];
begin
  if not exists (
    select 1
    from pg_publication
    where pubname='supabase_realtime'
  ) then
    raise exception 'Không tìm thấy publication supabase_realtime.';
  end if;

  foreach v_table in array v_tables
  loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname='supabase_realtime'
        and schemaname='public'
        and tablename=v_table
    ) then
      execute format(
        'alter publication supabase_realtime add table public.%I',
        v_table
      );
    end if;
  end loop;
end
$realtime$;

select
  tablename,
  true as realtime_enabled
from pg_publication_tables
where pubname='supabase_realtime'
  and schemaname='public'
  and tablename in (
    'registrations',
    'teacher_notifications',
    'app_settings',
    'weeks',
    'study_schedule',
    'week_schedule_overrides'
  )
order by tablename;

notify pgrst, 'reload schema';

-- HẾT MIGRATION V8.3.2n FINAL CONSOLIDATED

-- BEGIN EMBEDDED PATCH-V8.4.0-MULTICLASS.sql
-- =====================================================================
-- SỔ TỰ HỌC V8.4.0 — MULTI-CLASS & UNIFIED PERMISSIONS
-- Baseline: V8.3.2n
-- Run on a backup first. This patch preserves legacy class_name/app_settings
-- fields for rollback but V8.4.0 runtime does not depend on them.
-- =====================================================================

alter type public.app_role add value if not exists 'admin';

begin;

-- 1. Core class model ---------------------------------------------------
create table if not exists public.classes (
  id uuid primary key default gen_random_uuid(),
  school_year_id uuid not null references public.school_years(id) on delete restrict,
  code text not null,
  name text not null,
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint classes_code_nonempty check (length(btrim(code)) between 1 and 40),
  constraint classes_name_nonempty check (length(btrim(name)) between 1 and 120),
  unique (school_year_id,code)
);

alter table public.profiles
  add column if not exists class_id uuid references public.classes(id) on delete restrict,
  add column if not exists deleted_at timestamptz;

create unique index if not exists uq_profiles_single_root_admin
  on public.profiles (role) where role='admin';

create table if not exists public.class_teachers (
  class_id uuid not null references public.classes(id) on delete cascade,
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  active boolean not null default true,
  assigned_by uuid references public.profiles(id) on delete set null,
  assigned_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (class_id,teacher_id)
);

create table if not exists public.class_settings (
  class_id uuid primary key references public.classes(id) on delete cascade,
  ai_automation_enabled boolean not null default true,
  ai_auto_approve_threshold numeric not null default 0.90 check (ai_auto_approve_threshold between 0 and 1),
  ai_revision_auto_approve_threshold numeric not null default 0.85 check (ai_revision_auto_approve_threshold between 0 and 1),
  ai_feedback_memory_enabled boolean not null default true,
  per_session_deadline_time time not null default time '20:00',
  announcement text not null default 'Chuẩn bị nội dung tự học trước hạn.',
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.class_weeks (
  class_id uuid not null references public.classes(id) on delete cascade,
  week_id uuid not null references public.weeks(id) on delete cascade,
  status public.week_status not null,
  deadline_mode text not null default 'per_session_20' check (deadline_mode in ('per_session_20','week_before_20','specific')),
  registration_deadline timestamptz,
  note text,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (class_id,week_id)
);

alter table public.registrations add column if not exists class_id uuid references public.classes(id) on delete restrict;
alter table public.teacher_notifications add column if not exists class_id uuid references public.classes(id) on delete cascade;
alter table public.ai_review_feedback add column if not exists class_id uuid references public.classes(id) on delete set null;
alter table public.audit_logs add column if not exists class_id uuid references public.classes(id) on delete set null;
alter table public.audit_logs add column if not exists source text not null default 'server';
alter table public.audit_logs drop constraint if exists audit_logs_source_check;
alter table public.audit_logs add constraint audit_logs_source_check
  check (source in ('server','client','system'));

alter table public.study_schedule add column if not exists class_id uuid references public.classes(id) on delete cascade;
alter table public.week_schedule_overrides add column if not exists class_id uuid references public.classes(id) on delete cascade;

-- 2. Backfill classes from existing class_name --------------------------
do $backfill_classes$
declare
  v_year uuid;
  v_fallback text;
begin
  select id into v_year from public.school_years where is_active=true order by start_date desc limit 1;
  if v_year is null then
    select id into v_year from public.school_years order by start_date desc limit 1;
  end if;
  if v_year is null then raise exception 'V8.4.0: không tìm thấy school_years để tạo lớp.'; end if;

  for v_fallback in
    select distinct upper(btrim(class_name))
    from public.profiles
    where coalesce(btrim(class_name),'')<>''
  loop
    insert into public.classes(school_year_id,code,name,active)
    values(v_year,v_fallback,v_fallback,true)
    on conflict (school_year_id,code) do nothing;
  end loop;

  if not exists(select 1 from public.classes where school_year_id=v_year) then
    select upper(coalesce(nullif(btrim(value #>> '{}'),''),'10A1')) into v_fallback
    from public.app_settings where key='class_name' limit 1;
    v_fallback:=coalesce(v_fallback,'10A1');
    insert into public.classes(school_year_id,code,name,active)
    values(v_year,v_fallback,v_fallback,true)
    on conflict (school_year_id,code) do nothing;
  end if;
end
$backfill_classes$;

update public.profiles p
set class_id=c.id
from public.classes c
where p.role::text in ('student','monitor')
  and p.class_id is null
  and c.code=upper(btrim(p.class_name))
  and c.school_year_id=coalesce(
    (select sy.id from public.school_years sy where sy.is_active=true order by sy.start_date desc limit 1),
    (select sy.id from public.school_years sy order by sy.start_date desc limit 1)
  );

-- If legacy learner metadata does not identify a class, auto-fill only when
-- the active school year has exactly one class. Multiple classes are ambiguous
-- and must be repaired explicitly instead of silently choosing the first row.
do $backfill_unknown_learners$
declare
  v_year uuid;
  v_class_id uuid;
  v_class_count integer;
  v_missing_count integer;
begin
  select id into v_year
  from public.school_years
  where is_active=true
  order by start_date desc
  limit 1;

  if v_year is null then
    select id into v_year from public.school_years order by start_date desc limit 1;
  end if;

  select count(*),min(id) into v_class_count,v_class_id
  from public.classes
  where school_year_id=v_year and active=true;

  select count(*) into v_missing_count
  from public.profiles
  where role::text in ('student','monitor') and active=true and class_id is null;

  if v_missing_count>0 then
    if v_class_count=1 then
      update public.profiles
      set class_id=v_class_id
      where role::text in ('student','monitor') and active=true and class_id is null;
    else
      raise exception
        'AMBIGUOUS_LEARNER_CLASS: còn % học sinh/cán sự hoạt động không xác định được lớp; năm học hiện hành có % lớp hoạt động. Hãy sửa profiles.class_name trước khi chạy lại migration.',
        v_missing_count,v_class_count;
    end if;
  end if;
end
$backfill_unknown_learners$;

update public.profiles set class_id=null where role::text in ('teacher','admin');

insert into public.class_teachers(class_id,teacher_id,assigned_by)
select c.id,p.id,null
from public.profiles p
join public.classes c
  on c.code=upper(btrim(p.class_name))
 and c.school_year_id=coalesce(
   (select sy.id from public.school_years sy where sy.is_active=true order by sy.start_date desc limit 1),
   (select sy.id from public.school_years sy order by sy.start_date desc limit 1)
 )
where p.role::text='teacher' and p.active=true
on conflict (class_id,teacher_id) do update set active=true,updated_at=now();

-- Login codes are global identities; normalize and reject ambiguous legacy data.
do $login_code_preflight$
begin
  if exists(
    select 1 from public.profiles
    where coalesce(btrim(student_code),'')<>''
    group by upper(btrim(student_code))
    having count(*)>1
  ) then
    raise exception 'V8.4.0: có mã đăng nhập trùng nhau sau khi chuẩn hóa. Hãy xử lý trước khi tiếp tục.';
  end if;
end
$login_code_preflight$;

update public.profiles
set student_code=upper(btrim(student_code))
where coalesce(student_code,'')<>'' and student_code is distinct from upper(btrim(student_code));

create unique index if not exists uq_profiles_student_code_ci
  on public.profiles (upper(student_code))
  where student_code is not null and btrim(student_code)<>'';

-- class settings inherit V8.3 global settings once.
insert into public.class_settings(
  class_id,ai_automation_enabled,ai_auto_approve_threshold,
  ai_revision_auto_approve_threshold,ai_feedback_memory_enabled,
  per_session_deadline_time,announcement
)
select c.id,
  coalesce((select value='true'::jsonb from public.app_settings where key='smart_approval_enabled'),true)
  and coalesce((select value='true'::jsonb from public.app_settings where key='ai_review_enabled'),true),
  coalesce((select (value #>> '{}')::numeric from public.app_settings where key='ai_auto_approve_threshold'),0.90),
  coalesce((select (value #>> '{}')::numeric from public.app_settings where key='ai_revision_auto_approve_threshold'),0.85),
  coalesce((select value='true'::jsonb from public.app_settings where key='ai_feedback_memory_enabled'),true),
  coalesce((select case when (value #>> '{}')~'^([01][0-9]|2[0-3]):[0-5][0-9]$' then (value #>> '{}')::time end from public.app_settings where key='per_session_deadline_time'),time '20:00'),
  coalesce((select value #>> '{}' from public.app_settings where key='announcement'),'Chuẩn bị nội dung tự học trước hạn.')
from public.classes c
on conflict (class_id) do nothing;

insert into public.class_weeks(class_id,week_id,status,deadline_mode,registration_deadline,note)
select c.id,w.id,w.status,coalesce(w.deadline_mode,'per_session_20'),w.registration_deadline,w.note
from public.classes c cross join public.weeks w
where c.school_year_id=w.school_year_id
on conflict (class_id,week_id) do nothing;

update public.registrations r set class_id=p.class_id
from public.profiles p where p.id=r.student_id and r.class_id is null;
update public.teacher_notifications n set class_id=r.class_id
from public.registrations r where r.id=n.registration_id and n.class_id is null;
update public.ai_review_feedback f set class_id=r.class_id
from public.registrations r where r.id=f.registration_id and f.class_id is null;

-- 3. Replicate legacy schedules to every class -------------------------
-- Only rows with class_id IS NULL are legacy global rows. On a rerun the
-- templates are empty, so class-specific schedules are never overwritten.
create temporary table v840_schedule_template on commit drop as
  select weekday,period_number,is_study_period
  from public.study_schedule
  where class_id is null;
create temporary table v840_override_template on commit drop as
  select week_id,weekday,period_number,is_study_period,reason
  from public.week_schedule_overrides
  where class_id is null;

do $drop_old_uniques$
declare r record;
begin
  for r in select c.conname,rel.relname
           from pg_constraint c join pg_class rel on rel.oid=c.conrelid
           join pg_namespace n on n.oid=rel.relnamespace
           where n.nspname='public' and rel.relname in ('study_schedule','week_schedule_overrides')
             and c.contype='u'
  loop
    execute format('alter table public.%I drop constraint if exists %I',r.relname,r.conname);
  end loop;
end
$drop_old_uniques$;

create unique index if not exists uq_study_schedule_class_slot
  on public.study_schedule(class_id,weekday,period_number);
create unique index if not exists uq_week_overrides_class_slot
  on public.week_schedule_overrides(class_id,week_id,weekday,period_number);

insert into public.study_schedule(class_id,weekday,period_number,is_study_period)
select c.id,t.weekday,t.period_number,t.is_study_period
from public.classes c cross join v840_schedule_template t
on conflict (class_id,weekday,period_number) do nothing;

delete from public.study_schedule where class_id is null;

insert into public.week_schedule_overrides(class_id,week_id,weekday,period_number,is_study_period,reason)
select c.id,t.week_id,t.weekday,t.period_number,t.is_study_period,t.reason
from public.classes c join v840_override_template t on true
join public.weeks w on w.id=t.week_id and w.school_year_id=c.school_year_id
on conflict (class_id,week_id,weekday,period_number) do nothing;

delete from public.week_schedule_overrides where class_id is null;

create index if not exists idx_profiles_class_active on public.profiles(class_id,active);
create index if not exists idx_class_teachers_teacher_active on public.class_teachers(teacher_id,active,class_id);
create index if not exists idx_registrations_class_week on public.registrations(class_id,week_id) where is_deleted=false;
create index if not exists idx_notifications_class_unread on public.teacher_notifications(class_id,is_read,created_at desc);
create index if not exists idx_ai_feedback_class_created on public.ai_review_feedback(class_id,created_at desc);

-- Atomic server-side rate limiting. Advisory locking serializes competing
-- requests for the same actor/action pair so concurrent calls cannot overrun
-- the configured window. Edge Functions soft-fail only if this RPC itself is
-- unavailable, preserving the existing defense-in-depth behavior.
create or replace function public.consume_server_rate_limit(
  p_actor_id uuid,
  p_action text,
  p_max_calls integer,
  p_window_seconds integer
) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_since timestamptz;
  v_count bigint;
begin
  if p_actor_id is null or coalesce(btrim(p_action),'')=''
     or p_max_calls<1 or p_window_seconds<1 then
    raise exception 'INVALID_RATE_LIMIT_ARGUMENTS';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_actor_id::text||':'||btrim(p_action),0)
  );

  v_since:=now()-make_interval(secs=>p_window_seconds);

  delete from public.server_rate_limits
  where actor_id=p_actor_id
    and action=p_action
    and created_at<now()-interval '1 day';

  select count(*) into v_count
  from public.server_rate_limits
  where actor_id=p_actor_id
    and action=p_action
    and created_at>=v_since;

  if v_count>=p_max_calls then
    return false;
  end if;

  insert into public.server_rate_limits(actor_id,action,created_at)
  values(p_actor_id,btrim(p_action),now());
  return true;
end; $$;

-- 4. Integrity triggers -------------------------------------------------
create or replace function public.validate_profile_class_scope()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.role::text in ('teacher','admin') then
    new.class_id:=null;
  elsif new.active=true and new.role::text in ('student','monitor') then
    if new.class_id is null then
      raise exception 'ACTIVE_STUDENT_REQUIRES_CLASS';
    end if;
    if not exists(select 1 from public.classes c where c.id=new.class_id and c.active=true) then
      raise exception 'ACTIVE_STUDENT_REQUIRES_ACTIVE_CLASS';
    end if;
  end if;
  return new;
end; $$;

drop trigger if exists trg_validate_profile_class_scope on public.profiles;
create trigger trg_validate_profile_class_scope before insert or update of role,active,class_id
on public.profiles for each row execute function public.validate_profile_class_scope();

create or replace function public.guard_root_admin_profile()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if coalesce(current_setting('app.root_admin_transfer',true),'')='on' then
    return coalesce(new,old);
  end if;
  if tg_op='DELETE' and old.role::text='admin' then raise exception 'ROOT_ADMIN_IMMUTABLE'; end if;
  if tg_op='UPDATE' and old.role::text='admin' and (
       new.role::text<>'admin' or new.active is distinct from old.active
       or new.deleted_at is distinct from old.deleted_at or new.class_id is not null
     ) then raise exception 'ROOT_ADMIN_IMMUTABLE'; end if;
  return coalesce(new,old);
end; $$;

drop trigger if exists trg_guard_root_admin_profile on public.profiles;
create trigger trg_guard_root_admin_profile before update or delete on public.profiles
for each row execute function public.guard_root_admin_profile();

create or replace function public.validate_class_teacher_assignment()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.active=true then
    if not exists(select 1 from public.profiles p where p.id=new.teacher_id and p.role::text='teacher' and p.active=true) then
      raise exception 'CLASS_ASSIGNMENT_REQUIRES_ACTIVE_TEACHER';
    end if;
    if not exists(select 1 from public.classes c where c.id=new.class_id and c.active=true) then
      raise exception 'CLASS_ASSIGNMENT_REQUIRES_ACTIVE_CLASS';
    end if;
  end if;
  return new;
end; $$;

drop trigger if exists trg_validate_class_teacher_assignment on public.class_teachers;
create trigger trg_validate_class_teacher_assignment before insert or update of class_id,teacher_id,active
on public.class_teachers for each row execute function public.validate_class_teacher_assignment();

create or replace function public.sync_teacher_assignments_on_profile_change()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if old.role::text='teacher' and (new.role::text<>'teacher' or new.active=false) then
    update public.class_teachers
    set active=false,updated_at=now()
    where teacher_id=new.id and active=true;
  end if;
  return new;
end; $$;

drop trigger if exists trg_sync_teacher_assignments_on_profile_change on public.profiles;
create trigger trg_sync_teacher_assignments_on_profile_change
  after update of role,active on public.profiles
  for each row execute function public.sync_teacher_assignments_on_profile_change();

create or replace function public.sync_class_assignments_on_deactivate()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if old.active=true and new.active=false then
    update public.class_teachers
    set active=false,updated_at=now()
    where class_id=new.id and active=true;
  end if;
  return new;
end; $$;

drop trigger if exists trg_sync_class_assignments_on_deactivate on public.classes;
create trigger trg_sync_class_assignments_on_deactivate
  after update of active on public.classes
  for each row execute function public.sync_class_assignments_on_deactivate();

-- New Auth rows are inert until an authorized Edge Function assigns role/class.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  insert into public.profiles(id,full_name,email,role,active,class_id)
  values(new.id,coalesce(new.raw_user_meta_data->>'full_name',split_part(new.email,'@',1)),new.email,'student',false,null)
  on conflict(id) do nothing;
  return new;
end; $$;

-- 5. Class-aware authorization helpers ---------------------------------
create or replace function public.current_app_role() returns public.app_role
language sql stable security definer set search_path=public as $$
  select role from public.profiles where id=auth.uid() and active=true
$$;

create or replace function public.is_root_admin() returns boolean
language sql stable security definer set search_path=public as $$
  select coalesce(public.current_app_role()::text='admin',false)
$$;

create or replace function public.is_active_teacher() returns boolean
language sql stable security definer set search_path=public as $$
  select coalesce(public.current_app_role()::text='teacher',false)
$$;

create or replace function public.is_teacher() returns boolean
language sql stable security definer set search_path=public as $$
  select public.is_active_teacher()
$$;

create or replace function public.current_student_class_id() returns uuid
language sql stable security definer set search_path=public as $$
  select class_id from public.profiles where id=auth.uid() and active=true and role::text in ('student','monitor')
$$;

create or replace function public.teacher_has_class(p_class_id uuid) returns boolean
language sql stable security definer set search_path=public as $$
  select coalesce(exists(
    select 1
    from public.class_teachers ct
    join public.classes c on c.id=ct.class_id and c.active=true
    where ct.teacher_id=auth.uid() and ct.class_id=p_class_id and ct.active=true
  ),false)
$$;

create or replace function public.can_manage_class(p_class_id uuid) returns boolean
language sql stable security definer set search_path=public as $$
  select public.is_root_admin() or public.teacher_has_class(p_class_id)
$$;

create or replace function public.can_view_student(p_student_id uuid) returns boolean
language sql stable security definer set search_path=public as $$
  select coalesce(exists(
    select 1 from public.profiles p where p.id=p_student_id and p.active=true and (
      p.id=auth.uid()
      or public.is_root_admin()
      or (p.class_id is not null and public.teacher_has_class(p.class_id))
      or (public.current_app_role()::text='monitor' and p.class_id=public.current_student_class_id())
    )
  ),false)
$$;

create or replace function public.can_manage_student(p_student_id uuid) returns boolean
language sql stable security definer set search_path=public as $$
  select coalesce(exists(
    select 1 from public.profiles p where p.id=p_student_id and p.role::text in ('student','monitor') and (
      public.is_root_admin() or (p.class_id is not null and public.teacher_has_class(p.class_id))
    )
  ),false)
$$;

create or replace function public.can_view_registration(p_registration_id uuid) returns boolean
language sql stable security definer set search_path=public as $$
  select coalesce(exists(
    select 1 from public.registrations r where r.id=p_registration_id and r.is_deleted=false and (
      r.student_id=auth.uid() or public.is_root_admin() or public.teacher_has_class(r.class_id)
      or (public.current_app_role()::text='monitor' and r.class_id=public.current_student_class_id() and r.status<>'draft')
    )
  ),false)
$$;

create or replace function public.can_manage_registration(p_registration_id uuid) returns boolean
language sql stable security definer set search_path=public as $$
  select coalesce(exists(
    select 1 from public.registrations r where r.id=p_registration_id and (
      public.is_root_admin() or public.teacher_has_class(r.class_id)
    )
  ),false)
$$;

-- 6. Class-aware week/deadline helpers ---------------------------------
create or replace function public.class_week_effective_status(p_class_id uuid,p_week_id uuid)
returns public.week_status language sql stable security definer set search_path=public,pg_temp as $$
  with target as (
    select w.id,w.school_year_id,w.start_date,cw.status
    from public.weeks w join public.class_weeks cw on cw.week_id=w.id and cw.class_id=p_class_id
    where w.id=p_week_id
  ), clock as (
    select (now() at time zone 'Asia/Ho_Chi_Minh')::date today
  ), anchor as (
    select w.start_date current_start from public.weeks w join target t on t.school_year_id=w.school_year_id cross join clock c
    where c.today between w.start_date and w.start_date+6 order by w.start_date desc limit 1
  ), next_week as (
    select min(w.start_date) next_start from public.weeks w join target t on t.school_year_id=w.school_year_id join anchor a on true
    where w.start_date>a.current_start
  )
  select case
    when t.status='holiday' then 'holiday'::public.week_status
    when a.current_start is null then case when t.start_date+6<c.today then 'locked'::public.week_status else 'upcoming'::public.week_status end
    when t.start_date<a.current_start then 'locked'::public.week_status
    when t.start_date=a.current_start then 'open'::public.week_status
    when n.next_start is not null and t.start_date=n.next_start then 'open'::public.week_status
    else 'upcoming'::public.week_status end
  from target t cross join clock c left join anchor a on true left join next_week n on true
$$;

create or replace function public.week_registration_is_open(p_class_id uuid,p_week_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select coalesce(
    exists(select 1 from public.classes c where c.id=p_class_id and c.active=true)
    and public.class_week_effective_status(p_class_id,p_week_id)='open'::public.week_status,
    false
  )
$$;

create or replace function public.registration_deadline_for_slot(p_class_id uuid,p_week_id uuid,p_weekday int)
returns timestamptz language sql stable security definer set search_path=public as $$
  select case cw.deadline_mode
    when 'per_session_20' then (((w.start_date+(greatest(1,least(5,p_weekday))-1)-1)::timestamp+cs.per_session_deadline_time) at time zone 'Asia/Ho_Chi_Minh')
    when 'week_before_20' then (((w.start_date-1)::timestamp+cs.per_session_deadline_time) at time zone 'Asia/Ho_Chi_Minh')
    when 'specific' then cw.registration_deadline
    else cw.registration_deadline end
  from public.weeks w join public.class_weeks cw on cw.week_id=w.id and cw.class_id=p_class_id
  join public.class_settings cs on cs.class_id=p_class_id
  where w.id=p_week_id
$$;

-- Compatibility wrappers for student-side callers. Managers should use class-aware signatures.
create or replace function public.week_registration_is_open(p_week_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select public.week_registration_is_open(public.current_student_class_id(),p_week_id)
$$;
create or replace function public.registration_deadline_for_slot(p_week_id uuid,p_weekday int)
returns timestamptz language sql stable security definer set search_path=public as $$
  select public.registration_deadline_for_slot(public.current_student_class_id(),p_week_id,p_weekday)
$$;

-- 7. Registration class snapshot + AI-only trigger ---------------------
create or replace function public.set_registration_class_id()
returns trigger language plpgsql security definer set search_path=public as $$
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
end; $$;

drop trigger if exists trg_00_set_registration_class on public.registrations;
create trigger trg_00_set_registration_class before insert or update of class_id
on public.registrations for each row execute function public.set_registration_class_id();

create or replace function public.ai_automation_is_enabled(p_class_id uuid) returns boolean
language sql stable security definer set search_path=public as $$
  select coalesce((select ai_automation_enabled from public.class_settings where class_id=p_class_id),false)
$$;

create or replace function public.apply_smart_approval()
returns trigger language plpgsql security definer set search_path=public as $$
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
end; $$;


-- 7b. Class-aware manager RPCs + student payload guard ----------------
create or replace function public.guard_student_registration_update()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is not null
     and public.current_app_role()::text in ('student','monitor')
     and old.student_id=auth.uid()
  then
    if old.is_emergency=true and old.is_deleted=false and new.is_deleted=true
       and new.deleted_by=auth.uid() and new.deleted_at is not null
       and now()<public.study_session_start(old.week_id,old.weekday,old.period_number)
       and (to_jsonb(new)-'is_deleted'-'deleted_at'-'deleted_by'-'updated_at')=(to_jsonb(old)-'is_deleted'-'deleted_at'-'deleted_by'-'updated_at')
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
end; $$;

drop function if exists public.prepare_session_ai_rereview(uuid,integer,integer);
create or replace function public.prepare_session_ai_rereview(
  p_class_id uuid,p_week_id uuid,p_weekday integer,p_period_number integer
) returns table(registration_id uuid)
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if not public.can_manage_class(p_class_id) then raise exception 'Bạn không có quyền duyệt AI cho lớp này.' using errcode='42501'; end if;
  if not public.ai_automation_is_enabled(p_class_id) then raise exception 'Duyệt tự động bằng AI đang tắt cho lớp này.' using errcode='P0001'; end if;
  if p_week_id is null or p_weekday not between 1 and 5 or p_period_number not between 1 and 9 then raise exception 'Thông tin buổi tự học không hợp lệ.' using errcode='22023'; end if;
  return query select r.id from public.registrations r
    where r.class_id=p_class_id and r.week_id=p_week_id and r.weekday=p_weekday and r.period_number=p_period_number
      and r.is_deleted=false and r.revision_overdue_at is null
      and (r.status='approved' or (r.status='submitted' and r.ai_review_status not in ('pending','processing')))
    order by r.updated_at,r.id;
end; $$;

create or replace function public.prepare_registration_ai_rereview(p_registration_id uuid)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare v_class_id uuid;
begin
  select class_id into v_class_id from public.registrations where id=p_registration_id and is_deleted=false;
  if v_class_id is null then return false; end if;
  if not public.can_manage_class(v_class_id) then raise exception 'Bạn không có quyền duyệt lại đăng ký này.' using errcode='42501'; end if;
  if not public.ai_automation_is_enabled(v_class_id) then raise exception 'Duyệt tự động bằng AI đang tắt cho lớp này.' using errcode='P0001'; end if;
  perform set_config('app.force_ai_rereview','on',true);
  update public.registrations r set status='submitted',approval_source='manual',ai_review_status='pending',
    ai_decision=null,ai_category=null,ai_confidence=null,ai_revision_status=null,ai_revision_confidence=null,
    ai_reason=null,ai_model=null,ai_reviewed_at=null,approved_at=null,approved_by=null,
    auto_review_reason='GV/Admin chủ động yêu cầu AI duyệt lại.',updated_at=now()
  where r.id=p_registration_id and r.class_id=v_class_id and r.is_deleted=false and r.revision_overdue_at is null
    and (r.status='approved' or (r.status='submitted' and r.ai_review_status not in ('pending','processing')));
  return found;
end; $$;

create or replace function public.sync_revision_overdue_reports()
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare v_changed integer:=0;
begin
  update public.registrations r set revision_overdue_at=coalesce(r.revision_overdue_at,now()),updated_at=now()
  where r.is_deleted=false and r.status='needs_revision' and r.revision_overdue_at is null
    and public.class_week_effective_status(r.class_id,r.week_id)<>'holiday'
    and public.study_session_start(r.week_id,r.weekday,r.period_number) is not null
    and now()>=public.study_session_start(r.week_id,r.weekday,r.period_number);
  get diagnostics v_changed=row_count;return v_changed;
end; $$;

create or replace function public.delete_registration_safely(p_registration_id uuid)
returns boolean language plpgsql volatile security definer set search_path=public,pg_temp as $$
declare v_actor uuid:=auth.uid();v_role public.app_role;v_registration public.registrations%rowtype;v_session_start timestamptz;
begin
  if v_actor is null then raise exception 'Bạn chưa đăng nhập.' using errcode='42501'; end if;
  v_role:=public.current_app_role();if v_role is null then raise exception 'Tài khoản không còn hoạt động.' using errcode='42501'; end if;
  select * into v_registration from public.registrations where id=p_registration_id and is_deleted=false for update;
  if not found then return false; end if;
  if v_role::text in ('admin','teacher') then
    if not public.can_manage_class(v_registration.class_id) then raise exception 'Bạn không có quyền xóa đăng ký của lớp này.' using errcode='42501'; end if;
  elsif v_role::text in ('student','monitor') and v_registration.student_id=v_actor and v_registration.is_emergency=true then
    v_session_start:=public.study_session_start(v_registration.week_id,v_registration.weekday,v_registration.period_number);
    if v_session_start is null or now()>=v_session_start then raise exception 'Chỉ được hủy đăng ký bổ sung trước khi buổi tự học bắt đầu.' using errcode='42501'; end if;
  else raise exception 'Bạn không có quyền hủy đăng ký này.' using errcode='42501'; end if;
  update public.registrations set is_deleted=true,deleted_at=now(),deleted_by=v_actor,updated_at=now() where id=v_registration.id;
  return true;
end; $$;

-- remove obsolete global AI toggle after class-aware RPCs no longer depend on it.
drop function if exists public.ai_automation_is_enabled();

grant execute on function public.prepare_session_ai_rereview(uuid,uuid,integer,integer) to authenticated,service_role;
grant execute on function public.prepare_registration_ai_rereview(uuid) to authenticated,service_role;
grant execute on function public.delete_registration_safely(uuid) to authenticated,service_role;
grant execute on function public.sync_revision_overdue_reports() to authenticated,service_role;

-- 8. Feedback + notifications -----------------------------------------
create or replace function public.capture_ai_teacher_feedback()
returns trigger language plpgsql security definer set search_path=public as $$
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
end; $$;

create or replace function public.sync_teacher_review_notification()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_title text; v_message text; v_type text;
begin
  delete from public.teacher_notifications where registration_id=new.id and notification_type in ('ai_watch','manual_review')
    and not (new.status='submitted' and new.ai_review_status in ('pending','processing'))
    and not (new.status in ('submitted','revision_overdue') and new.ai_review_status not in ('pending','processing'));

  if new.is_deleted then return new; end if;
  if new.status='submitted' and new.ai_review_status in ('pending','processing') then
    v_type:='ai_watch'; v_title:='🤖 Đăng ký đang chờ AI';
  elsif new.status in ('submitted','revision_overdue') and new.ai_review_status not in ('pending','processing') then
    v_type:='manual_review'; v_title:='⚠️ Đăng ký cần giáo viên xem';
  elsif new.is_emergency and new.status<>'approved' then
    v_type:='emergency_notice'; v_title:='🚨 Đăng ký bổ sung';
  else return new; end if;
  select coalesce(full_name,'Học sinh')||': '||left(coalesce(new.content,''),160) into v_message from public.profiles where id=new.student_id;
  insert into public.teacher_notifications(registration_id,class_id,student_id,week_id,notification_type,title,message,is_read,created_at)
  values(new.id,new.class_id,new.student_id,new.week_id,v_type,v_title,v_message,false,now())
  on conflict (registration_id,notification_type) do update set class_id=excluded.class_id,title=excluded.title,message=excluded.message,is_read=false;
  return new;
end; $$;

-- Recreate triggers after replacing functions.
drop trigger if exists trg_apply_smart_approval on public.registrations;
create trigger trg_apply_smart_approval before insert or update on public.registrations
for each row execute function public.apply_smart_approval();
drop trigger if exists trg_sync_teacher_review_notification on public.registrations;
create trigger trg_sync_teacher_review_notification after insert or update of status,ai_review_status,ai_decision,is_deleted on public.registrations
for each row execute function public.sync_teacher_review_notification();
drop trigger if exists trg_capture_ai_teacher_feedback on public.registrations;
create trigger trg_capture_ai_teacher_feedback after update of status,approval_source on public.registrations
for each row execute function public.capture_ai_teacher_feedback();

create or replace function public.get_ai_feedback_memory_stats(p_class_id uuid default null)
returns table(total_feedback bigint,revision_after_ai_approve bigint,approve_after_ai_manual bigint,approve_after_ai_revision bigint,last_feedback_at timestamptz,memory_enabled boolean,candidate_limit integer,selected_limit integer)
language sql stable security definer set search_path=public as $$
  select
    count(f.id)::bigint,
    count(f.id) filter(where f.feedback_type in ('teacher_revision_after_ai_approve','legacy_revision_after_ai_approve'))::bigint,
    count(f.id) filter(where f.feedback_type='teacher_approve_after_ai_manual')::bigint,
    count(f.id) filter(where f.feedback_type='teacher_approve_after_ai_revision')::bigint,
    max(f.created_at),
    coalesce((select cs.ai_feedback_memory_enabled from public.class_settings cs where cs.class_id=p_class_id),true),
    80,25
  from public.ai_review_feedback f
  where p_class_id is not null
    and (public.is_root_admin() or public.teacher_has_class(p_class_id))
    and f.class_id=p_class_id
$$;

-- 9. Root admin bootstrap ---------------------------------------------
create or replace function public.bootstrap_root_admin(p_user_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  if exists(select 1 from public.profiles where role='admin') then raise exception 'ROOT_ADMIN_ALREADY_EXISTS'; end if;
  if not exists(select 1 from public.profiles where id=p_user_id and role='teacher' and active=true) then raise exception 'ROOT_ADMIN_TARGET_MUST_BE_ACTIVE_TEACHER'; end if;
  update public.profiles set role='admin',class_id=null,active=true,deleted_at=null where id=p_user_id;
  update public.class_teachers set active=false,updated_at=now() where teacher_id=p_user_id and active=true;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,new_data,source,created_at)
  values(p_user_id,'BOOTSTRAP_ROOT_ADMIN','profile',p_user_id,jsonb_build_object('role','admin'),'system',now());
end; $$;

create or replace function public.transfer_root_admin(p_new_user_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare
  v_old_admin_id uuid;
begin
  select id into v_old_admin_id from public.profiles where role='admin' for update;
  if v_old_admin_id is null then raise exception 'ROOT_ADMIN_NOT_FOUND'; end if;
  if p_new_user_id=v_old_admin_id then return; end if;
  if not exists(select 1 from public.profiles where id=p_new_user_id and role='teacher' and active=true) then
    raise exception 'ROOT_ADMIN_TARGET_MUST_BE_ACTIVE_TEACHER';
  end if;

  perform set_config('app.root_admin_transfer','on',true);
  update public.profiles set role='teacher',class_id=null where id=v_old_admin_id;
  update public.profiles set role='admin',class_id=null,active=true,deleted_at=null where id=p_new_user_id;
  update public.class_teachers set active=false,updated_at=now() where teacher_id=p_new_user_id and active=true;

  insert into public.audit_logs(actor_id,action,entity_type,entity_id,old_data,new_data,source,created_at)
  values(v_old_admin_id,'TRANSFER_ROOT_ADMIN','profile',p_new_user_id,
    jsonb_build_object('old_admin_id',v_old_admin_id),
    jsonb_build_object('new_admin_id',p_new_user_id),'system',now());

  perform set_config('app.root_admin_transfer','off',true);
end; $$;

-- 10. RLS --------------------------------------------------------------
alter table public.classes enable row level security;
alter table public.class_teachers enable row level security;
alter table public.class_settings enable row level security;
alter table public.class_weeks enable row level security;

-- Drop old global-teacher policies.
drop policy if exists profiles_select on public.profiles;
drop policy if exists school_years_teacher_all on public.school_years;
drop policy if exists weeks_teacher_all on public.weeks;
drop policy if exists periods_teacher_all on public.periods;
drop policy if exists schedule_read on public.study_schedule;
drop policy if exists schedule_teacher_all on public.study_schedule;
drop policy if exists overrides_read on public.week_schedule_overrides;
drop policy if exists overrides_teacher_all on public.week_schedule_overrides;
drop policy if exists settings_teacher_all on public.app_settings;
drop policy if exists registrations_select on public.registrations;
drop policy if exists registrations_student_insert on public.registrations;
drop policy if exists registrations_student_update on public.registrations;
drop policy if exists registrations_teacher_update on public.registrations;
drop policy if exists teacher_notifications_select on public.teacher_notifications;
drop policy if exists teacher_notifications_update on public.teacher_notifications;
drop policy if exists teacher_notifications_delete on public.teacher_notifications;
drop policy if exists audit_teacher_select on public.audit_logs;

drop policy if exists profiles_select_v840 on public.profiles;
create policy profiles_select_v840 on public.profiles for select to authenticated using (
  (id=auth.uid() and active=true) or public.is_root_admin()
  or (role::text in ('student','monitor') and public.can_view_student(id))
  or (role::text='teacher' and public.is_root_admin())
);

drop policy if exists classes_select_v840 on public.classes;
create policy classes_select_v840 on public.classes for select to authenticated using (
  public.is_root_admin() or public.teacher_has_class(id) or id=public.current_student_class_id()
);
drop policy if exists classes_admin_write_v840 on public.classes;
create policy classes_admin_write_v840 on public.classes for all to authenticated using(public.is_root_admin()) with check(public.is_root_admin());

drop policy if exists class_teachers_select_v840 on public.class_teachers;
create policy class_teachers_select_v840 on public.class_teachers for select to authenticated using(public.is_root_admin() or teacher_id=auth.uid());
drop policy if exists class_teachers_admin_write_v840 on public.class_teachers;
create policy class_teachers_admin_write_v840 on public.class_teachers for all to authenticated using(public.is_root_admin()) with check(public.is_root_admin());

drop policy if exists class_settings_select_v840 on public.class_settings;
create policy class_settings_select_v840 on public.class_settings for select to authenticated using(public.can_manage_class(class_id) or class_id=public.current_student_class_id());
drop policy if exists class_settings_manage_v840 on public.class_settings;
create policy class_settings_manage_v840 on public.class_settings for update to authenticated using(public.can_manage_class(class_id)) with check(public.can_manage_class(class_id));

drop policy if exists class_weeks_select_v840 on public.class_weeks;
create policy class_weeks_select_v840 on public.class_weeks for select to authenticated using(public.can_manage_class(class_id) or class_id=public.current_student_class_id());
drop policy if exists class_weeks_manage_v840 on public.class_weeks;
create policy class_weeks_manage_v840 on public.class_weeks for all to authenticated using(public.can_manage_class(class_id)) with check(public.can_manage_class(class_id));

-- school_years/weeks/periods are global calendar definitions: read for all, write root admin only.
drop policy if exists school_years_read on public.school_years;
drop policy if exists school_years_read_v840 on public.school_years;
create policy school_years_read_v840 on public.school_years for select to authenticated using(true);
drop policy if exists school_years_admin_write_v840 on public.school_years;
create policy school_years_admin_write_v840 on public.school_years for all to authenticated using(public.is_root_admin()) with check(public.is_root_admin());
drop policy if exists weeks_read on public.weeks;
drop policy if exists weeks_read_v840 on public.weeks;
create policy weeks_read_v840 on public.weeks for select to authenticated using(true);
drop policy if exists weeks_admin_write_v840 on public.weeks;
create policy weeks_admin_write_v840 on public.weeks for all to authenticated using(public.is_root_admin()) with check(public.is_root_admin());
drop policy if exists periods_read on public.periods;
drop policy if exists periods_read_v840 on public.periods;
create policy periods_read_v840 on public.periods for select to authenticated using(true);
drop policy if exists periods_admin_write_v840 on public.periods;
create policy periods_admin_write_v840 on public.periods for all to authenticated using(public.is_root_admin()) with check(public.is_root_admin());

drop policy if exists schedule_select_v840 on public.study_schedule;
create policy schedule_select_v840 on public.study_schedule for select to authenticated using(public.can_manage_class(class_id) or class_id=public.current_student_class_id());
drop policy if exists schedule_manage_v840 on public.study_schedule;
create policy schedule_manage_v840 on public.study_schedule for all to authenticated using(public.can_manage_class(class_id)) with check(public.can_manage_class(class_id));
drop policy if exists overrides_select_v840 on public.week_schedule_overrides;
create policy overrides_select_v840 on public.week_schedule_overrides for select to authenticated using(public.can_manage_class(class_id) or class_id=public.current_student_class_id());
drop policy if exists overrides_manage_v840 on public.week_schedule_overrides;
create policy overrides_manage_v840 on public.week_schedule_overrides for all to authenticated using(public.can_manage_class(class_id)) with check(public.can_manage_class(class_id));

drop policy if exists registrations_select_v840 on public.registrations;
create policy registrations_select_v840 on public.registrations for select to authenticated using(
  is_deleted=false and (
    student_id=auth.uid()
    or public.is_root_admin()
    or (status<>'draft' and public.teacher_has_class(class_id))
    or (status<>'draft' and public.current_app_role()::text='monitor' and class_id=public.current_student_class_id())
  )
);
drop policy if exists registrations_student_insert_v840 on public.registrations;
create policy registrations_student_insert_v840 on public.registrations for insert to authenticated with check(
  public.current_app_role()::text in ('student','monitor') and student_id=auth.uid() and class_id=public.current_student_class_id()
  and is_deleted=false and is_emergency=false and status in ('draft','submitted')
  and public.week_registration_is_open(class_id,week_id)
  and (public.registration_deadline_for_slot(class_id,week_id,weekday) is null or now()<=public.registration_deadline_for_slot(class_id,week_id,weekday))
);
drop policy if exists registrations_student_update_v840 on public.registrations;
create policy registrations_student_update_v840 on public.registrations for update to authenticated using(
  public.current_app_role()::text in ('student','monitor')
  and student_id=auth.uid()
  and is_deleted=false
  and class_id=public.current_student_class_id()
  and status in ('draft','submitted','needs_revision','approved')
  and (
    (
      status='needs_revision'
      and revision_overdue_at is null
      and now() < public.study_session_start(week_id,weekday,period_number)
    )
    or (
      status<>'needs_revision'
      and public.week_registration_is_open(class_id,week_id)
      and (
        public.registration_deadline_for_slot(class_id,week_id,weekday) is null
        or now() <= public.registration_deadline_for_slot(class_id,week_id,weekday)
      )
      and now() < public.study_session_start(week_id,weekday,period_number)
    )
  )
) with check(
  public.current_app_role()::text in ('student','monitor')
  and student_id=auth.uid()
  and class_id=public.current_student_class_id()
  and is_deleted=false
  and revision_overdue_at is null
  and public.registration_emergency_flag_matches(id,is_emergency)
  and status in ('draft','submitted')
);
drop policy if exists registrations_manager_update_v840 on public.registrations;
create policy registrations_manager_update_v840 on public.registrations for update to authenticated using(public.can_manage_class(class_id)) with check(public.can_manage_class(class_id));

drop policy if exists notifications_select_v840 on public.teacher_notifications;
create policy notifications_select_v840 on public.teacher_notifications for select to authenticated using(public.can_manage_class(class_id));
drop policy if exists notifications_update_v840 on public.teacher_notifications;
create policy notifications_update_v840 on public.teacher_notifications for update to authenticated using(public.can_manage_class(class_id)) with check(public.can_manage_class(class_id));
drop policy if exists notifications_delete_v840 on public.teacher_notifications;
create policy notifications_delete_v840 on public.teacher_notifications for delete to authenticated using(public.can_manage_class(class_id));

drop policy if exists audit_manager_select_v840 on public.audit_logs;
create policy audit_manager_select_v840 on public.audit_logs for select to authenticated using(public.is_root_admin() or (class_id is not null and public.teacher_has_class(class_id)));

-- 11. Grants -----------------------------------------------------------
revoke all on public.classes,public.class_teachers,public.class_settings,public.class_weeks from anon;
grant select on public.classes,public.class_teachers,public.class_settings,public.class_weeks to authenticated;
grant insert,update,delete on public.classes,public.class_teachers,public.class_weeks to authenticated;
grant update on public.class_settings to authenticated;
grant select,insert,update,delete on public.classes,public.class_teachers,public.class_settings,public.class_weeks to service_role;

grant select (id,student_code,full_name,role,class_name,class_id,active,deleted_at) on public.profiles to authenticated;

revoke all on function public.consume_server_rate_limit(uuid,text,integer,integer) from public,anon,authenticated;
grant execute on function public.consume_server_rate_limit(uuid,text,integer,integer) to service_role;

revoke all on function public.bootstrap_root_admin(uuid) from public,anon,authenticated;
grant execute on function public.bootstrap_root_admin(uuid) to service_role;
revoke all on function public.transfer_root_admin(uuid) from public,anon,authenticated;
grant execute on function public.transfer_root_admin(uuid) to service_role;
revoke all on function public.get_ai_feedback_memory_stats(uuid) from public,anon;
grant execute on function public.get_ai_feedback_memory_stats(uuid) to authenticated,service_role;

-- 12. Realtime ---------------------------------------------------------
do $realtime$
declare v_table text;
begin
  foreach v_table in array array['classes','class_teachers','class_settings','class_weeks'] loop
    if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=v_table) then
      execute format('alter publication supabase_realtime add table public.%I',v_table);
    end if;
  end loop;
end
$realtime$;

commit;


-- =====================================================================
-- POST-V8.4.0 REUSABLE FINAL-STATE PATCHES INCLUDED IN V8.7.1
-- =====================================================================

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
