-- FEAT-LATE-001: Ghi nhận "đăng ký bù bằng miệng" (trễ hạn) và lần cải thiện ý thức.
--
-- Học sinh chưa đăng ký mà buổi tự học đã bắt đầu thì báo miệng với cán sự / GV.
-- Cán sự hoặc GV bấm ghi nhận: mỗi học sinh tối đa một lần trễ cho mỗi buổi.
-- Cứ đủ `late_conduct_threshold` lần trễ (mặc định 3, GV đổi được) trong cùng
-- năm học và lớp thì tạo một lần cải thiện ý thức; các lần trễ đó được gắn vào
-- lần cải thiện ý thức và bộ đếm quay về 0. Khi học sinh đã chịu xử phạt, cán sự
-- / GV đánh dấu "đã chấp hành": lần đó rời danh sách cần xử lý nhưng vẫn giữ
-- trong lịch sử.
--
-- Mọi thao tác ghi đi qua các hàm SECURITY DEFINER bên dưới; bảng chỉ cho SELECT.

begin;

-- ---------------------------------------------------------------------------
-- Ngưỡng của lớp
-- ---------------------------------------------------------------------------

alter table public.class_settings
  add column if not exists late_conduct_threshold integer not null default 3;

alter table public.class_settings
  drop constraint if exists class_settings_late_conduct_threshold_check;
alter table public.class_settings
  add constraint class_settings_late_conduct_threshold_check
  check (late_conduct_threshold between 1 and 20);

-- ---------------------------------------------------------------------------
-- Bảng
-- ---------------------------------------------------------------------------

create table if not exists public.conduct_cases (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  school_year_id uuid not null references public.school_years(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  threshold integer not null check (threshold between 1 and 20),
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id) on delete set null,
  resolution_note text check (resolution_note is null or char_length(resolution_note) <= 300)
);

comment on table public.conduct_cases is
  'FEAT-LATE-001: lần cải thiện ý thức, sinh ra khi đủ số lần đăng ký trễ. resolved_at = đã chấp hành xử phạt; không xóa dòng.';

create table if not exists public.late_registrations (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  school_year_id uuid not null references public.school_years(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  week_id uuid not null references public.weeks(id) on delete cascade,
  weekday integer not null check (weekday between 1 and 7),
  period_number integer not null check (period_number between 1 and 20),
  recorded_at timestamptz not null default now(),
  recorded_by uuid references public.profiles(id) on delete set null,
  revoked_at timestamptz,
  revoked_by uuid references public.profiles(id) on delete set null,
  conduct_case_id uuid references public.conduct_cases(id) on delete set null,
  constraint late_registrations_revoked_not_counted
    check (revoked_at is null or conduct_case_id is null)
);

comment on table public.late_registrations is
  'FEAT-LATE-001: đăng ký bù bằng miệng sau khi buổi tự học đã bắt đầu. revoked_at = ghi nhầm đã hủy; conduct_case_id = đã tính vào một lần cải thiện ý thức.';

create unique index if not exists late_registrations_one_active_per_session
  on public.late_registrations (student_id, week_id, weekday, period_number)
  where revoked_at is null;
create index if not exists late_registrations_class_year_student_idx
  on public.late_registrations (class_id, school_year_id, student_id);
create index if not exists late_registrations_week_idx
  on public.late_registrations (week_id);
create index if not exists late_registrations_conduct_case_idx
  on public.late_registrations (conduct_case_id);
create index if not exists conduct_cases_class_year_student_idx
  on public.conduct_cases (class_id, school_year_id, student_id);

-- ---------------------------------------------------------------------------
-- Quyền xem: GV phụ trách / admin, cán sự cùng lớp, và chính học sinh.
-- ---------------------------------------------------------------------------

create or replace function public.late_tracking_can_view(p_class_id uuid, p_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    public.can_manage_class(p_class_id)
    or (public.current_app_role()::text = 'monitor' and p_class_id = public.current_student_class_id())
    or p_student_id = auth.uid(),
    false)
$$;

alter table public.late_registrations enable row level security;
alter table public.conduct_cases enable row level security;

drop policy if exists late_registrations_select on public.late_registrations;
create policy late_registrations_select on public.late_registrations
  for select to authenticated
  using (public.late_tracking_can_view(class_id, student_id));

drop policy if exists conduct_cases_select on public.conduct_cases;
create policy conduct_cases_select on public.conduct_cases
  for select to authenticated
  using (public.late_tracking_can_view(class_id, student_id));

revoke all on public.late_registrations from anon, authenticated;
revoke all on public.conduct_cases from anon, authenticated;
grant select on public.late_registrations to authenticated;
grant select on public.conduct_cases to authenticated;

-- ---------------------------------------------------------------------------
-- Quyền ghi: GV phụ trách / admin, hoặc cán sự cùng lớp (không tự xử lý cho mình).
-- ---------------------------------------------------------------------------

create or replace function public.late_tracking_assert_actor(p_class_id uuid, p_student_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text := public.current_app_role()::text;
begin
  if auth.uid() is null then
    raise exception 'Bạn chưa đăng nhập.' using errcode = '42501';
  end if;
  if v_role is null then
    raise exception 'Tài khoản không còn hoạt động.' using errcode = '42501';
  end if;
  if v_role in ('admin', 'teacher') then
    if not public.can_manage_class(p_class_id) then
      raise exception 'Bạn không phụ trách lớp này.' using errcode = '42501';
    end if;
  elsif v_role = 'monitor' then
    if public.current_student_class_id() is distinct from p_class_id then
      raise exception 'Cán sự chỉ ghi nhận được cho lớp của mình.' using errcode = '42501';
    end if;
    if p_student_id = auth.uid() then
      raise exception 'Cán sự không tự ghi nhận cho chính mình; hãy nhờ giáo viên.' using errcode = '42501';
    end if;
  else
    raise exception 'Chỉ cán sự hoặc giáo viên mới ghi nhận được.' using errcode = '42501';
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Ghi nhận một lần trễ
-- ---------------------------------------------------------------------------

create or replace function public.record_late_registration(
  p_student_id uuid,
  p_week_id uuid,
  p_weekday integer,
  p_period_number integer
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_class uuid;
  v_year uuid;
  v_start timestamptz;
  v_threshold integer;
  v_pending integer;
  v_late uuid;
  v_case uuid;
begin
  select p.class_id into v_class
  from public.profiles p
  where p.id = p_student_id
    and p.active = true
    and p.deleted_at is null
    and p.role::text in ('student', 'monitor');
  if v_class is null then
    raise exception 'Không tìm thấy học sinh đang học trong lớp.' using errcode = 'P0002';
  end if;

  perform public.late_tracking_assert_actor(v_class, p_student_id);

  select w.school_year_id into v_year from public.weeks w where w.id = p_week_id;
  if v_year is null then
    raise exception 'Tuần không hợp lệ.' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.classes c where c.id = v_class and c.school_year_id = v_year) then
    raise exception 'Tuần này không thuộc năm học của lớp.' using errcode = '22023';
  end if;

  v_start := public.study_session_start(v_class, p_week_id, p_weekday, p_period_number);
  if v_start is null then
    raise exception 'Chưa xác định được giờ bắt đầu của buổi tự học.' using errcode = '22023';
  end if;
  if now() < v_start then
    raise exception 'Buổi tự học chưa bắt đầu; học sinh vẫn tự đăng ký được trên ứng dụng.' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.registrations r
    where r.student_id = p_student_id and r.week_id = p_week_id
      and r.weekday = p_weekday and r.period_number = p_period_number
      and r.is_deleted = false and r.status::text <> 'draft'
  ) then
    raise exception 'Học sinh đã có đăng ký cho buổi này.' using errcode = '22023';
  end if;

  -- Một học sinh một hàng đợi: hai người bấm cùng lúc không tạo trùng lần cải thiện ý thức.
  perform pg_advisory_xact_lock(hashtextextended('late_registrations:' || p_student_id::text, 0));

  begin
    insert into public.late_registrations
      (class_id, school_year_id, student_id, week_id, weekday, period_number, recorded_by)
    values
      (v_class, v_year, p_student_id, p_week_id, p_weekday, p_period_number, v_actor)
    returning id into v_late;
  exception when unique_violation then
    raise exception 'Đã ghi trễ cho học sinh này ở buổi này rồi.' using errcode = '23505';
  end;

  select coalesce(cs.late_conduct_threshold, 3) into v_threshold
  from public.class_settings cs where cs.class_id = v_class;
  v_threshold := coalesce(v_threshold, 3);

  select count(*) into v_pending
  from public.late_registrations l
  where l.student_id = p_student_id and l.class_id = v_class and l.school_year_id = v_year
    and l.revoked_at is null and l.conduct_case_id is null;

  if v_pending >= v_threshold then
    insert into public.conduct_cases (class_id, school_year_id, student_id, threshold, created_by)
    values (v_class, v_year, p_student_id, v_threshold, v_actor)
    returning id into v_case;

    update public.late_registrations
    set conduct_case_id = v_case
    where id in (
      select l.id from public.late_registrations l
      where l.student_id = p_student_id and l.class_id = v_class and l.school_year_id = v_year
        and l.revoked_at is null and l.conduct_case_id is null
      order by l.recorded_at, l.id
      limit v_threshold
    );
    v_pending := v_pending - v_threshold;
  end if;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, new_data, class_id, source)
  values (v_actor, 'late_registration.record', 'late_registration', v_late::text,
    jsonb_build_object('student_id', p_student_id, 'week_id', p_week_id, 'weekday', p_weekday,
      'period_number', p_period_number, 'conduct_case_id', v_case),
    v_class, 'server');

  return jsonb_build_object(
    'late_id', v_late,
    'pending', v_pending,
    'threshold', v_threshold,
    'conduct_case_id', v_case
  );
end
$$;

-- ---------------------------------------------------------------------------
-- Hủy một lần trễ ghi nhầm (chỉ khi chưa tính vào lần cải thiện ý thức)
-- ---------------------------------------------------------------------------

create or replace function public.revoke_late_registration(p_late_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.late_registrations%rowtype;
begin
  select * into v_row from public.late_registrations where id = p_late_id for update;
  if not found or v_row.revoked_at is not null then
    return false;
  end if;

  perform public.late_tracking_assert_actor(v_row.class_id, v_row.student_id);

  if v_row.conduct_case_id is not null then
    raise exception 'Lần trễ này đã được tính vào một lần cải thiện ý thức nên không hủy được.' using errcode = '22023';
  end if;

  update public.late_registrations
  set revoked_at = now(), revoked_by = auth.uid()
  where id = p_late_id;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, old_data, class_id, source)
  values (auth.uid(), 'late_registration.revoke', 'late_registration', p_late_id::text,
    jsonb_build_object('student_id', v_row.student_id, 'week_id', v_row.week_id,
      'weekday', v_row.weekday, 'period_number', v_row.period_number),
    v_row.class_id, 'server');

  return true;
end
$$;

-- ---------------------------------------------------------------------------
-- Đánh dấu lần cải thiện ý thức đã chấp hành
-- ---------------------------------------------------------------------------

create or replace function public.resolve_conduct_case(p_case_id uuid, p_note text default null)
returns boolean
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.conduct_cases%rowtype;
  v_note text := nullif(left(btrim(coalesce(p_note, '')), 300), '');
begin
  select * into v_row from public.conduct_cases where id = p_case_id for update;
  if not found or v_row.resolved_at is not null then
    return false;
  end if;

  perform public.late_tracking_assert_actor(v_row.class_id, v_row.student_id);

  update public.conduct_cases
  set resolved_at = now(), resolved_by = auth.uid(), resolution_note = v_note
  where id = p_case_id;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, new_data, class_id, source)
  values (auth.uid(), 'conduct_case.resolve', 'conduct_case', p_case_id::text,
    jsonb_build_object('student_id', v_row.student_id, 'note', v_note),
    v_row.class_id, 'server');

  return true;
end
$$;

revoke all on function public.late_tracking_can_view(uuid, uuid) from public, anon;
revoke all on function public.late_tracking_assert_actor(uuid, uuid) from public, anon, authenticated;
revoke all on function public.record_late_registration(uuid, uuid, integer, integer) from public, anon;
revoke all on function public.revoke_late_registration(uuid) from public, anon;
revoke all on function public.resolve_conduct_case(uuid, text) from public, anon;
grant execute on function public.late_tracking_can_view(uuid, uuid) to authenticated;
grant execute on function public.record_late_registration(uuid, uuid, integer, integer) to authenticated;
grant execute on function public.revoke_late_registration(uuid) to authenticated;
grant execute on function public.resolve_conduct_case(uuid, text) to authenticated;

commit;
