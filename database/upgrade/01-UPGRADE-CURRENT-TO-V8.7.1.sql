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
