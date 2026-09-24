-- ============================================================================
-- FEAT-010 — DEVICE USE LOCK POLICY
--
-- Teacher tạm khoá việc đăng ký sử dụng thiết bị điện tử theo buổi học
-- (lớp + thứ + tiết). Khoá lặp lại ở các tuần sau cho tới khi Teacher mở.
--
-- CHẠY SAU: 12-FEAT-007-ARCHIVE-PURGE.sql
-- Tệp này chỉ chạm hệ thống đăng ký (registrations/weeks/timetable). Nó không
-- đọc, không sửa và không phụ thuộc vào bất kỳ đối tượng nào của FEAT-001…008.
--
-- -------------------------------------------------------------------------
-- BA QUYẾT ĐỊNH THIẾT KẾ, VÀ LÝ DO
--
-- 1. KHÔNG có cột `device_locked`. Nguồn sự thật là **khoảng thời gian**
--    (DEC-102). Một buổi bị khoá khi:
--
--        session_start >  locked_at
--        AND (unlocked_at IS NULL OR session_start <= unlocked_at)
--
--    Công thức này tự nó là lịch sử: mở khoá chỉ đóng khoảng, không xoá
--    khoảng, nên một buổi từng nằm trong khoảng khoá thì mãi mãi vẫn nằm
--    trong đó. Không cần "đóng băng" gì thêm (BR-010-004, AC-010-006).
--
-- 2. Tách `uses_electronic_device` (điều học sinh **xin**) khỏi
--    `effective_uses_electronic_device` (điều policy **cho phép**) —
--    DEC-106. Cột cũ không đổi nghĩa, không đổi dữ liệu, nên
--    `apply_smart_approval()` vẫn so sánh đúng thứ nó vẫn so sánh và một
--    thay đổi do policy không bao giờ kích hoạt review (DEC-107).
--
-- 3. Cưỡng chế bằng **trigger trên bảng**, không phải bằng RPC.
--    Frontend ghi `registrations` trực tiếp qua PostgREST
--    (`sb.from("registrations").insert/update`), nên biên duy nhất mà
--    mọi đường ghi đều đi qua — học sinh, lớp trưởng, giáo viên, AI worker
--    chạy bằng service_role, đăng ký bổ sung, hay curl thẳng vào REST —
--    là trigger. Ẩn checkbox ở frontend không phải là cưỡng chế
--    (BR-010-014, BR-010-015, BR-010-016).
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Bảng
-- ---------------------------------------------------------------------------

create table if not exists public.device_use_lock_intervals(
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  weekday integer not null,
  period_number integer not null references public.periods(period_number),
  locked_at timestamptz not null,
  locked_by uuid references public.profiles(id) on delete set null,
  unlocked_at timestamptz,
  unlocked_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint device_use_lock_intervals_weekday_check check (weekday between 1 and 5),
  constraint device_use_lock_intervals_order_check check (unlocked_at is null or unlocked_at >= locked_at)
);

comment on table public.device_use_lock_intervals is
 'FEAT-010: khoảng khoá thiết bị điện tử theo lớp + thứ + tiết. Mở khoá ghi unlocked_at, không xoá dòng (DEC-104).';

-- §9.1: không được có hơn một khoảng đang mở cho cùng class+thứ+tiết. Đây là
-- thứ làm cho Lock hai lần trở thành idempotent ở mức dữ liệu chứ không chỉ ở
-- mức RPC — nếu ai đó thêm một đường ghi khác, ràng buộc vẫn giữ (EC-010-001).
create unique index if not exists device_use_lock_intervals_one_open
  on public.device_use_lock_intervals(class_id,weekday,period_number)
  where unlocked_at is null;

-- Đường tra cứu nóng: trigger hỏi "slot này có khoảng khoá nào không" trên mọi
-- lần ghi registrations. Có index thì câu hỏi đó là một lần probe.
create index if not exists device_use_lock_intervals_slot
  on public.device_use_lock_intervals(class_id,weekday,period_number);

create table if not exists public.device_use_session_overrides(
  id uuid primary key default gen_random_uuid(),
  -- Sol RC1 P1. Một override là ngoại lệ của **một khoảng khoá cụ thể**, không
  -- phải một giấy phép vĩnh viễn cho buổi học đó. Nếu chỉ khoá theo
  -- lớp+tuần+thứ+tiết thì chuỗi Lock A → ALLOW → Unlock A → Lock B sẽ làm
  -- override của chu kỳ A sống dậy dưới chu kỳ B. Tham chiếu này khiến điều đó
  -- không biểu diễn được, và nó cũng khiến "chỉ tạo được khi đang khoá" thành
  -- hệ quả của kiểu dữ liệu chứ không phải một điều RPC phải nhớ kiểm tra.
  -- Không có FK một cột ở đây: ràng buộc thật là FK **hợp thành** thêm ở dưới,
  -- gắn override vào đúng (khoảng khoá, lớp, thứ, tiết) — xem Sol RC6 R-006.
  interval_id uuid not null,
  class_id uuid not null references public.classes(id) on delete cascade,
  week_id uuid not null references public.weeks(id) on delete cascade,
  weekday integer not null,
  period_number integer not null references public.periods(period_number),
  mode text not null default 'allow',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by uuid references public.profiles(id) on delete set null,
  constraint device_use_session_overrides_weekday_check check (weekday between 1 and 5),
  constraint device_use_session_overrides_mode_check check (mode = 'allow'),
  constraint device_use_session_overrides_order_check check (revoked_at is null or revoked_at >= created_at)
);

comment on table public.device_use_session_overrides is
 'FEAT-010: mở riêng một buổi trong lúc khoảng khoá vẫn chạy. V1 chỉ có ALLOW (DEC-105). Hủy ghi revoked_at, không xoá dòng.';

-- Một override đang sống cho mỗi buổi **trong mỗi chu kỳ khoá**. Hai chu kỳ
-- khác nhau có thể cùng để lại override cho cùng một buổi mà không đụng nhau,
-- vì chỉ cái gắn với khoảng đang khoá buổi đó mới có hiệu lực.
create unique index if not exists device_use_session_overrides_one_live
  on public.device_use_session_overrides(interval_id,week_id,weekday,period_number)
  where revoked_at is null;

create index if not exists device_use_session_overrides_slot
  on public.device_use_session_overrides(class_id,week_id,weekday,period_number);

-- ---------------------------------------------------------------------------
-- Sol RC6 R-006 — một chủ sở hữu, không phải hai
--
-- Một override mang hai đường sở hữu: `interval_id` nói nó là ngoại lệ của chu
-- kỳ khoá nào, còn `class_id + weekday + period_number` nói nó thuộc buổi nào.
-- Đến RC6 không có gì buộc hai đường đó trùng nhau, và hai đoạn mã khác nhau
-- tin hai đường khác nhau: chốt chặn năm học đọc `class_id`, còn
-- `device_use_policy_state()` đi theo `interval_id`. Hệ quả là một câu ghi có
-- đặc quyền có thể chìa cho chốt chặn một lớp còn mở trong khi trỏ phần đánh
-- giá policy vào một khoảng khoá của lớp đã đóng băng. Đúng họ với lỗi
-- mixed-owner mà FEAT-007 đã từng dính.
--
-- Cách chữa không phải là dạy chốt chặn đi theo cả hai đường — làm vậy thì hai
-- đường vẫn được phép lệch nhau, chỉ là có thêm một chỗ phải nhớ kiểm. Cách
-- chữa là **làm cho trạng thái lệch không biểu diễn được**: khoá unique trên
-- (id, class_id, weekday, period_number) của bảng khoảng khoá — id vốn đã là
-- khoá chính nên nó không ràng buộc thêm gì, nó chỉ tồn tại để được tham chiếu
-- — và một FK hợp thành từ override trỏ vào đúng bốn cột đó.
--
-- Sau khi có nó, `override.class_id` **là** `interval.class_id` theo định
-- nghĩa, nên chốt chặn năm học đọc `class_id` là đủ và
-- `device_use_policy_state()` đi theo `interval_id` cũng là đủ.
-- ---------------------------------------------------------------------------

do $$ begin
  -- Môi trường đã cài RC5/RC6 có FK một cột do `create table` sinh ra; nó bị
  -- FK hợp thành thay thế hoàn toàn.
  alter table public.device_use_session_overrides
    drop constraint if exists device_use_session_overrides_interval_id_fkey;

  if not exists(select 1 from pg_constraint
                 where conname='device_use_lock_intervals_owner_key'
                   and connamespace='public'::regnamespace) then
    alter table public.device_use_lock_intervals
      add constraint device_use_lock_intervals_owner_key
      unique (id, class_id, weekday, period_number);
  end if;

  if not exists(select 1 from pg_constraint
                 where conname='device_use_session_overrides_interval_owner_fkey'
                   and connamespace='public'::regnamespace) then
    alter table public.device_use_session_overrides
      add constraint device_use_session_overrides_interval_owner_fkey
      foreign key (interval_id, class_id, weekday, period_number)
      references public.device_use_lock_intervals(id, class_id, weekday, period_number)
      on delete cascade;
  end if;
end $$;

-- Nửa còn lại của quyền sở hữu: tuần. FK không diễn đạt được "lớp và tuần phải
-- cùng một năm học", nên nó là một trigger — và quy tắc thì **không** được viết
-- lại: đây đúng là điều `validate_registration_class_week()` đã cưỡng chế cho
-- `registrations` từ V8.8.0 (`classes.school_year_id = weeks.school_year_id`).
-- Có test khẳng định hai đường từ chối cùng một cặp (lớp, tuần) lệch năm, vì
-- hai nơi cùng biết một quy tắc chỉ an toàn chừng nào còn có ai kiểm.
create or replace function public.device_use_guard_override_week() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not exists(
    select 1 from public.classes c
      join public.weeks w on w.id = new.week_id
     where c.id = new.class_id and c.school_year_id = w.school_year_id) then
    raise exception 'DEVICE_POLICY_OVERRIDE_WEEK_MISMATCH'
      using hint='Tuần này không thuộc năm học của lớp.';
  end if;
  return new;
end $$;

drop trigger if exists trg_01_device_use_override_week on public.device_use_session_overrides;
create trigger trg_01_device_use_override_week
  before insert or update of class_id, week_id on public.device_use_session_overrides
  for each row execute function public.device_use_guard_override_week();

-- Sol RC2 §8. Hai bảng trên là manager-only, và **phải** như vậy: chúng mang
-- `locked_by`/`unlocked_by`/`created_by`/`revoked_by`. Nhưng Supabase Postgres
-- Changes áp RLS khi phát sự kiện — không đọc được dòng thì không nhận được sự
-- kiện — nên học sinh, đúng nhóm người cần biết ô chọn vừa bị khoá, không nghe
-- thấy gì. RC2 đã tự triệt tiêu mình: đóng quyền đọc ở một chỗ rồi dựa vào đúng
-- quyền đọc đó ở chỗ khác.
--
-- Bảng này là tín hiệu, không phải dữ liệu. Nó mang đúng hai điều — lớp nào,
-- đổi lúc nào — và **cố ý không có cột tác nhân nào**, nên cho học sinh của lớp
-- đọc nó không mở lại thứ §8 vừa đóng. Client nhận tín hiệu rồi gọi lại
-- `device_use_policy('state', …)`, vốn tự lọc theo vai trò; tín hiệu không bao
-- giờ là nguồn sự thật.
create table if not exists public.device_use_policy_signals(
  class_id uuid primary key references public.classes(id) on delete cascade,
  version bigint not null default 1,
  changed_at timestamptz not null default now()
);

comment on table public.device_use_policy_signals is
 'FEAT-010: tín hiệu "policy của lớp vừa đổi" cho realtime. Chỉ lớp + thời điểm, không có dữ liệu tác nhân (Sol RC2 §8).';

-- Postgres Changes kiểm RLS trên bản ghi nó sắp phát. Chính sách ở đây chỉ cần
-- `class_id`, mà `class_id` là khoá chính nên replica identity mặc định đã đủ;
-- đặt `full` cho tường minh, bảng có ba cột nên không tốn gì.
alter table public.device_use_policy_signals replica identity full;

create or replace function public.device_use_bump_signal(p_class_id uuid) returns void
language sql security definer set search_path = public, pg_temp as $$
  insert into public.device_use_policy_signals(class_id,version,changed_at)
  values(p_class_id,1,now())
  on conflict (class_id) do update
    set version = public.device_use_policy_signals.version + 1, changed_at = now()
$$;

-- ---------------------------------------------------------------------------
-- 2. Quyền thiết bị hiệu lực trên từng đăng ký
--
-- Cột mới, không đụng cột cũ. `uses_electronic_device` vẫn là "học sinh xin
-- gì" — đúng như hôm nay — nên AC-010-022 (migration bảo toàn dữ liệu) được
-- thoả bằng cách không di chuyển gì cả, và backfill dưới đây chỉ chép sang cột
-- mới. Ở thời điểm chạy tệp này chưa có khoảng khoá nào tồn tại, nên
-- effective = requested là kết quả đúng của công thức, không phải một giá trị
-- mặc định đoán bừa.
-- ---------------------------------------------------------------------------

alter table public.registrations
  add column if not exists effective_uses_electronic_device boolean not null default false;

comment on column public.registrations.effective_uses_electronic_device is
 'FEAT-010: quyền thiết bị sau policy = uses_electronic_device AND buổi không bị khoá. Mọi hiển thị và thống kê phải đọc cột này (BR-010-009).';

update public.registrations
   set effective_uses_electronic_device = uses_electronic_device
 where effective_uses_electronic_device is distinct from uses_electronic_device;

-- ---------------------------------------------------------------------------
-- 3. Đánh giá policy
--
-- `study_session_start(class,week,thứ,tiết)` đã có sẵn từ V8.8.0 và đã là
-- nguồn thời gian chuẩn của hệ thống — RLS của registrations đã dùng nó để
-- quyết định "buổi đã bắt đầu chưa". FEAT-010 dùng lại đúng hàm đó thay vì
-- viết hàm thứ hai, vì hai hàm thì sẽ có ngày chúng bất đồng (DEC-110).
-- ---------------------------------------------------------------------------

-- Sol RC1 P2. "Tuần này có những buổi nào" đã có một định nghĩa trong hệ
-- thống, và `class_week_effective_status()` dùng nó: lịch riêng của tuần nếu
-- lớp có đặt lịch riêng cho tuần đó, ngược lại lịch nền. Trang đăng ký cũng
-- theo đúng thứ tự ưu tiên ấy. Hàm này chép lại chính nó thay vì nghĩ ra định
-- nghĩa thứ hai — nếu hai định nghĩa tồn tại song song thì sẽ có ngày một buổi
-- vừa tồn tại vừa không. Khác biệt duy nhất là `distinct`, vì
-- `week_schedule_overrides` không có ràng buộc duy nhất nên có thể có dòng trùng;
-- ở hàm kia điều đó vô hại vì nó lấy max(), ở đây nó sẽ thành slot lặp.
-- Có test khẳng định hai hàm cho cùng một tập buổi.
create or replace function public.device_use_week_slots(p_class_id uuid, p_week_id uuid)
returns table(weekday integer, period_number integer)
language sql stable security definer set search_path = public, pg_temp as $$
  select distinct s.weekday, s.period_number from (
    select o.weekday, o.period_number
      from public.week_schedule_overrides o
     where o.class_id=p_class_id and o.week_id=p_week_id and o.is_study_period=true
    union all
    select sc.weekday, sc.period_number
      from public.study_schedule sc
     where sc.class_id=p_class_id and sc.is_study_period=true
       and not exists(select 1 from public.week_schedule_overrides ox
                       where ox.class_id=p_class_id and ox.week_id=p_week_id)
  ) s
$$;

-- BR-010-005, và **chỉ ở đây**. Ràng buộc "chỉ một khoảng đang mở" làm cho các
-- khoảng của cùng một slot không thể phủ chồng lên nhau, nên nhiều nhất một
-- khoảng khoá được một buổi cho trước; `order by` chỉ là hình thức.
--
-- Cả hàm đánh giá lẫn RPC `allow_session` đều hỏi hàm này. Viết công thức hai
-- lần là cách chắc chắn nhất để một ngày nào đó hai chỗ trả lời khác nhau.
create or replace function public.device_use_locking_interval(
  p_class_id uuid, p_week_id uuid, p_weekday integer, p_period_number integer, p_session_start timestamptz
) returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select i.id from public.device_use_lock_intervals i
   where i.class_id=p_class_id and i.weekday=p_weekday and i.period_number=p_period_number
     and p_session_start > i.locked_at
     and (i.unlocked_at is null or p_session_start <= i.unlocked_at)
   order by i.locked_at desc limit 1
$$;

-- Sol RC7 R-008. "Ngoại lệ nào đang có hiệu lực cho buổi này" là **một** câu
-- hỏi, nên nó có **một** chỗ trả lời. Trước RC8 nó được trả lời hai lần: ở đây
-- (theo khoảng khoá đang chi phối buổi đó) và một lần nữa trong JSON của người
-- quản lý ở mục 6 (theo lớp + tuần + ô). Hai câu trả lời khác nhau, và bản thứ
-- hai còn hỏng hẳn khi có hai dòng — điều mà RC1 P1 cố ý cho phép: mở khoá một
-- chu kỳ không hồi tố hủy ngoại lệ của chu kỳ đó, nên `Lock A → ALLOW →
-- Unlock A → Lock B → ALLOW` để lại hai dòng unrevoked cho cùng một buổi.
--
-- Hàm này nhận khoảng khoá và giờ bắt đầu đã giải sẵn, nên nơi gọi không phải
-- giải lại — và quan trọng hơn, không nơi nào còn tự viết lấy vị từ.
create or replace function public.device_use_live_override(
  p_interval_id uuid, p_week_id uuid, p_weekday integer, p_period_number integer,
  p_session_start timestamptz
) returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select o.id from public.device_use_session_overrides o
   where o.interval_id = p_interval_id and o.week_id = p_week_id
     and o.weekday = p_weekday and o.period_number = p_period_number
     and o.mode = 'allow'
     and p_session_start > o.created_at
     and (o.revoked_at is null or p_session_start <= o.revoked_at)
$$;

comment on function public.device_use_live_override(uuid,uuid,integer,integer,timestamptz) is
 'FEAT-010 / Sol RC7 R-008: ngoại lệ ALLOW đang có hiệu lực cho một buổi, đọc theo đúng khoảng khoá chi phối buổi đó.';

create or replace function public.device_use_policy_state(
  p_class_id uuid, p_week_id uuid, p_weekday integer, p_period_number integer
) returns text
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_start timestamptz; v_interval uuid;
begin
  -- Đường nhanh, và cũng là lý do FEAT-010 không làm chậm một lớp chưa bao giờ
  -- khoá gì: nếu slot không có khoảng khoá nào thì câu trả lời là 'open' bất
  -- kể mọi thứ khác, nên không cần giải thời gian bắt đầu buổi.
  if not exists(
    select 1 from public.device_use_lock_intervals i
    where i.class_id=p_class_id and i.weekday=p_weekday and i.period_number=p_period_number
  ) then return 'open'; end if;

  v_start := public.study_session_start(p_class_id,p_week_id,p_weekday,p_period_number);

  -- EC-010-010 / DEC-110. Có policy nhưng không biết buổi bắt đầu lúc nào thì
  -- không được đoán về phía nào cả. Chỉ raise ở đây, tức là chỉ khi biên thực
  -- sự cần thiết — một lớp không có policy vẫn ghi đăng ký bình thường dù thời
  -- khoá biểu có thiếu.
  if v_start is null then
    raise exception 'DEVICE_POLICY_SESSION_TIME_UNRESOLVED'
      using errcode='P0001',
            hint='Không xác định được giờ bắt đầu của buổi học nên không thể áp dụng chính sách thiết bị.';
  end if;

  v_interval := public.device_use_locking_interval(p_class_id,p_week_id,p_weekday,p_period_number,v_start);
  if v_interval is null then return 'open'; end if;

  -- Luật đối xứng với khoảng khoá — ngoại lệ có hiệu lực với buổi bắt đầu
  -- **sau** khi nó được tạo và thôi có hiệu lực với buổi bắt đầu **sau** khi nó
  -- bị hủy — nằm ở `device_use_live_override()` phía trên, và **chỉ** ở đó.
  -- Nhờ vậy DEC-113 (không hồi tố) là một tính chất của công thức, không phải
  -- một điều RPC phải nhớ từ chối; RPC vẫn từ chối, ở mục 6, nhưng hai lớp bảo
  -- vệ độc lập nhau.
  return case
    when public.device_use_live_override(v_interval,p_week_id,p_weekday,p_period_number,v_start) is not null
    then 'allow_override' else 'locked' end;
end $$;

comment on function public.device_use_policy_state(uuid,uuid,integer,integer) is
 'FEAT-010: trả open | locked | allow_override cho một buổi. Raise nếu slot có policy mà không giải được giờ bắt đầu.';

create or replace function public.device_use_effective(
  p_requested boolean, p_class_id uuid, p_week_id uuid, p_weekday integer, p_period_number integer
) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(p_requested,false)
     and public.device_use_policy_state(p_class_id,p_week_id,p_weekday,p_period_number) <> 'locked'
$$;

comment on function public.device_use_effective(boolean,uuid,uuid,integer,integer) is
 'FEAT-010: DEC-106 — effective = requested AND policy cho phép. Một chỗ duy nhất định nghĩa phép AND này.';

-- ---------------------------------------------------------------------------
-- 4. Cưỡng chế trên mọi đường ghi registrations
--
-- Postgres chạy BEFORE ROW trigger theo thứ tự tên, và tên `trg_06_` đặt trigger
-- này sau `trg_00_set_registration_class`. Đó là ràng buộc **thật sự** cần giữ:
-- khi INSERT, `class_id` do trigger 00 điền, và hàm đánh giá policy cần nó.
-- Vị trí so với `trg_apply_smart_approval` thì không quan trọng — hai trigger
-- đọc và ghi hai cột rời nhau — nhưng đặt trước cho chuỗi dễ đọc.
--
-- Trigger **ghi đè** cột hiệu lực chứ không kiểm tra rồi báo lỗi. Đó là điểm
-- mấu chốt của BR-010-008 → BR-010-011: lựa chọn gốc của học sinh vẫn được
-- lưu nguyên vẹn trong `uses_electronic_device`, nên khi Teacher mở khoá
-- trước giờ học, quyền thiết bị quay lại theo đúng lựa chọn cũ mà không ai
-- phải nhập lại.
-- ---------------------------------------------------------------------------

create or replace function public.device_use_slot_key(p_class_id uuid, p_weekday integer, p_period_number integer)
returns bigint language sql immutable as $$
  select hashtextextended(p_class_id::text||':'||p_weekday::text||':'||p_period_number::text, 0)
$$;

create or replace function public.apply_device_use_policy() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  -- BR-010-018 / AC-010-020. Đọc policy rồi ghi kết quả là hai việc, và giữa
  -- chúng một giao dịch khác có thể commit một khoảng khoá mới. Nếu để mặc,
  -- cái thua cuộc là học sinh: đăng ký của em ấy đã đọc "chưa khoá", còn hàm
  -- tính lại của Teacher thì chưa nhìn thấy dòng đăng ký chưa commit — không
  -- bên nào sai, nhưng kết quả là device=true lọt qua một buổi đang khoá.
  --
  -- Khoá tư vấn theo từng slot khép vòng đó lại: mọi lần ghi đăng ký giữ khoá
  -- chia sẻ (nên các đăng ký đồng thời không chặn nhau), còn mọi lần đổi policy
  -- ở mục 6 giữ khoá độc quyền. Vì thế hai thao tác buộc phải xếp hàng, và dù
  -- thứ tự nào thì bên chạy sau cũng nhìn thấy kết quả đã commit của bên chạy
  -- trước. Khoá hết hiệu lực khi giao dịch kết thúc.
  perform pg_advisory_xact_lock_shared(
    public.device_use_slot_key(new.class_id,new.weekday,new.period_number));

  new.effective_uses_electronic_device := public.device_use_effective(
    new.uses_electronic_device, new.class_id, new.week_id, new.weekday, new.period_number);
  return new;
end $$;

drop trigger if exists trg_06_apply_device_use_policy on public.registrations;
create trigger trg_06_apply_device_use_policy
  before insert or update on public.registrations
  for each row execute function public.apply_device_use_policy();

-- ---------------------------------------------------------------------------
-- 5. Tính lại sau khi policy đổi
--
-- Công thức ở mục 3 đã tự mang lịch sử, nên tính lại là **idempotent**: chạy
-- lại bao nhiêu lần cũng ra cùng kết quả, và chạy trên cả những tuần đã qua
-- cũng không sửa gì, vì với các buổi đó công thức trả về đúng giá trị cũ.
-- Vì thế hàm này quét cả slot chứ không cố đoán "những dòng nào bị ảnh hưởng".
--
-- DEC-107 được giữ bằng **danh sách cột trong câu UPDATE**, chứ không bằng một
-- lá cờ: `trg_capture_ai_teacher_feedback` và
-- `trg_sync_teacher_review_notification` là AFTER UPDATE **OF** những cột cụ
-- thể (status, approval_source, ai_review_status, ai_decision, is_deleted,
-- revision_overdue_at). Câu UPDATE dưới đây không nhắc tới cột nào trong số
-- đó, nên hai trigger ấy không chạy — không có thông báo cho giáo viên, không
-- có dòng ai_review_feedback. Và `apply_smart_approval` chỉ đòi review khi
-- `uses_electronic_device` đổi, mà cột đó cũng không nằm trong câu này.
-- ---------------------------------------------------------------------------

create or replace function public.device_use_recompute(
  p_class_id uuid, p_weekday integer, p_period_number integer
) returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_count integer;
begin
  with target as (
    select r.id, public.device_use_effective(r.uses_electronic_device,r.class_id,r.week_id,r.weekday,r.period_number) as eff
    from public.registrations r
    where r.class_id=p_class_id and r.weekday=p_weekday and r.period_number=p_period_number
  ), changed as (
    update public.registrations r
       set effective_uses_electronic_device = t.eff
      from target t
     where r.id=t.id and r.effective_uses_electronic_device is distinct from t.eff
    returning 1
  ) select count(*)::integer into v_count from changed;
  return v_count;
end $$;

-- ---------------------------------------------------------------------------
-- 5b. Chốt chặn năm học — FEAT-007 RB-711 (Sol RC4 R-003, Sol RC5 R-004/R-005)
--
-- `teacher_has_class()` trả lời một câu hỏi về **lớp** — lớp còn hoạt động
-- không, giáo viên có được phân công không. RB-711 của FEAT-007 đặt lệnh cấm ở
-- cấp **năm học**: một năm đã `archived_read_only` thì dữ liệu nghiệp vụ thường
-- ngày không được tạo/sửa/xoá nữa ngoài đường archive/purge, và `archiving` là
-- cùng một lệnh cấm trong lúc gói lưu trữ đang được dựng — nếu không thì một
-- dòng ghi xen vào giữa hai bước purge sẽ nằm ngoài bản lưu trữ đã xác minh.
--
-- FEAT-010 ghi đúng loại dữ liệu đó, nên nó phải hỏi thêm câu hỏi thứ hai. RC5
-- hỏi câu đó đúng một chỗ: trong wrapper RPC. Sol RC5 chỉ ra hai lỗ hổng còn
-- lại, và cả hai đều đúng:
--
--   R-004 — `service_role` có `grant all` trên hai bảng policy và BYPASSRLS,
--           nên một câu INSERT/UPDATE/DELETE thẳng vào bảng không đi qua
--           wrapper. Chốt chặn phải nằm **dưới** wrapper, ở chính bảng.
--   R-005 — wrapper đọc `archive_state` mà không khoá dòng `school_years`, nên
--           `update school_years set archive_state='archiving'` của FEAT-007
--           commit được vào giữa lần đọc và lần ghi. Kiểm tra đúng nhưng không
--           nguyên tử.
--
-- Cả hai được giải bằng **một** hàm, và mọi đường ghi đều gọi nó.
--
-- Về mode khoá. `update school_years set archive_state=…` lấy FOR NO KEY UPDATE
-- trên dòng đó. Bảng xung đột của Postgres:
--
--      FOR KEY SHARE  xung đột với  FOR UPDATE                     ← KHÔNG đủ
--      FOR SHARE      xung đột với  FOR UPDATE, FOR NO KEY UPDATE  ← đúng cái cần
--
-- nên `for share` là mode duy nhất trong hai mode Sol nêu mà thật sự chặn được
-- archive_begin. Sau khi khoá được lấy, câu select trả về phiên bản dòng mới
-- nhất, nên thứ tự nào xảy ra trước cũng cho kết quả đúng:
--
--   policy khoá trước  → archive_begin đợi → policy commit → năm mới đóng băng
--   archive_begin trước → policy đợi → đọc ra 'archiving' → policy bị từ chối
--
-- Không tìm thấy lớp hoặc năm học thì `v_state` là NULL và `is distinct from`
-- cho ra từ chối: một kiểm tra quyền không kết luận được thì không phải là một
-- sự cho phép.
--
-- Cố ý **không** gọi `homework_private.archive_readonly()` của migration 12 dù
-- hàm đó tồn tại và trả lời đúng câu này: nó nằm trong schema riêng của hệ
-- thống Báo bài, và cả file này (xem mục 8, và test "FEAT-010 và FEAT-001…008
-- không dùng chung một đối tượng nào") dựa trên việc hai nửa ứng dụng không
-- chạm vào đối tượng của nhau. Hơn nữa hàm đó chỉ đọc, không khoá, nên nó
-- không giải được R-005. Cái giá của bản sao này là hai nơi cùng biết quy tắc,
-- nên cả hai đều đọc **cùng một cột**, không nơi nào giữ bản sao trạng thái.
-- ---------------------------------------------------------------------------

-- RC5 có `device_use_year_is_active(uuid)`, một vị từ chỉ đọc. Nó bị thay chứ
-- không được giữ lại: hai hàm cùng trả lời một câu hỏi thì sớm muộn sẽ có một
-- đường ghi gọi nhầm cái không khoá dòng. Dòng dưới đây dọn nó trên môi trường
-- đã chạy RC5 (staging).
drop function if exists public.device_use_year_is_active(uuid);

create or replace function public.device_use_assert_year_writable(p_class_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_state text;
begin
  select y.archive_state into v_state
    from public.school_years y
    join public.classes c on c.school_year_id = y.id
   where c.id = p_class_id
   for share of y;
  if v_state is distinct from 'active' then
    raise exception 'DEVICE_POLICY_YEAR_NOT_ACTIVE' using errcode='42501',
      hint='Năm học đang được lưu trữ hoặc đã ở chế độ chỉ đọc, nên không đổi được chính sách thiết bị.';
  end if;
end $$;

comment on function public.device_use_assert_year_writable(uuid) is
 'FEAT-010 / Sol RC5 R-004+R-005: khoá dòng school_years (FOR SHARE) rồi đòi archive_state = active. Mọi đường ghi policy đều đi qua đây.';

-- Sol RC5 R-004. Trigger bảng là biên duy nhất mà **mọi** đường ghi đều phải đi
-- qua — giống hệt lý do FEAT-010 cưỡng chế policy thiết bị bằng trigger trên
-- `registrations` chứ không bằng RPC (xem mục 3). RLS không đỡ được
-- `service_role` vì vai đó có BYPASSRLS; trigger thì có, và tắt nó cần quyền sở
-- hữu bảng mà `service_role` không có.
--
-- UPDATE kiểm **cả hai** phía: chỉ kiểm `new` thì một dòng bị mang ra khỏi năm
-- đã đóng băng, chỉ kiểm `old` thì một dòng bị mang vào.
create or replace function public.device_use_guard_year_freeze() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_op = 'DELETE' then
    perform public.device_use_assert_year_writable(old.class_id);
    return old;
  end if;
  perform public.device_use_assert_year_writable(new.class_id);
  if tg_op = 'UPDATE' and old.class_id is distinct from new.class_id then
    perform public.device_use_assert_year_writable(old.class_id);
  end if;
  return new;
end $$;

drop trigger if exists trg_00_device_use_year_freeze on public.device_use_lock_intervals;
create trigger trg_00_device_use_year_freeze
  before insert or update or delete on public.device_use_lock_intervals
  for each row execute function public.device_use_guard_year_freeze();

drop trigger if exists trg_00_device_use_year_freeze on public.device_use_session_overrides;
create trigger trg_00_device_use_year_freeze
  before insert or update or delete on public.device_use_session_overrides
  for each row execute function public.device_use_guard_year_freeze();

-- `device_use_policy_signals` **không** được đặt chốt chặn, và đó là một lựa
-- chọn chứ không phải một chỗ quên. Bảng đó là tín hiệu "policy của lớp vừa
-- đổi" — ba cột, không dữ liệu nghiệp vụ, không ai đọc nó làm nguồn sự thật —
-- nên một dòng ở đó không phải thứ RB-711 nói tới. Đường ghi duy nhất của nó
-- (`device_use_bump_signal`) chỉ chạy bên trong RPC, vốn đã bị chặn. Đổi lại,
-- nó là mục tiêu của `on delete cascade` từ `classes`; một chốt chặn ở đây sẽ
-- biến "xoá một lớp" thành một lỗi khó đọc trong đúng những năm học mà
-- `archive_guard_class()` của FEAT-007 đằng nào cũng đã cấm xoá lớp.

-- ---------------------------------------------------------------------------
-- 6. RPC cho Teacher
--
-- Teacher là chủ sở hữu policy (DEC-109). Admin xem được, nhưng **không** thay
-- Teacher khoá/mở — nên hai nhóm hành động dùng hai hàm kiểm quyền khác nhau:
-- `teacher_has_class` cho ghi, `can_manage_class` (= admin hoặc teacher) cho
-- đọc. Dùng nhầm `can_manage_class` cho ghi là đúng một dòng, và là đúng cái
-- mà DEC-109 cấm; có test riêng cho nó.
-- ---------------------------------------------------------------------------

create or replace function public.device_use_policy(p_action text, p_payload jsonb default '{}'::jsonb)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_class uuid := nullif(p_payload->>'class_id','')::uuid;
  v_week  uuid := nullif(p_payload->>'week_id','')::uuid;
  v_wd    integer := nullif(p_payload->>'weekday','')::integer;
  v_pn    integer := nullif(p_payload->>'period_number','')::integer;
  v_now   timestamptz := now();
  v_start timestamptz;
  v_row   public.device_use_lock_intervals%rowtype;
  v_manager boolean;
  v_recurring text;
  v_ovr   public.device_use_session_overrides%rowtype;
  v_moved integer;
  v_interval uuid;
begin
  if v_class is null then
    raise exception 'DEVICE_POLICY_CLASS_REQUIRED' using errcode='22023';
  end if;

  v_manager := public.can_manage_class(v_class);

  -- Sol RC1 §8. `state` và `history` không cùng một quyền. `state` là thứ học
  -- sinh cần để biết vì sao ô chọn bị khoá; `history` mang `locked_by`,
  -- `unlocked_by`, `created_by`, `revoked_by` — ai bấm nút, lúc nào — và học
  -- sinh không có việc gì với thông tin đó.
  if p_action = 'state' then
    -- `coalesce` ở đây không phải cho đẹp. Với một giáo viên không phụ trách lớp
    -- này, `current_student_class_id()` trả NULL, nên phép so sánh trả NULL, nên
    -- cả biểu thức trả NULL, nên `if not (NULL)` không vào nhánh nào và hàm chạy
    -- tiếp như thể đã được phép. Kiểm tra quyền mà kết quả là NULL thì phải coi
    -- là từ chối.
    if not coalesce(v_manager or v_class = public.current_student_class_id(), false) then
      raise exception 'DEVICE_POLICY_FORBIDDEN' using errcode='42501';
    end if;
  elsif p_action = 'history' then
    if not v_manager then
      raise exception 'DEVICE_POLICY_FORBIDDEN' using errcode='42501';
    end if;
  else
    -- Ghi: chỉ giáo viên được phân công. Admin cố tình không được (DEC-109).
    if not public.teacher_has_class(v_class) then
      raise exception 'DEVICE_POLICY_FORBIDDEN' using errcode='42501';
    end if;
    -- Sol RC4 R-003 / FEAT-007 RB-711. Chốt chặn đứng ở đây, trước khoá tư vấn
    -- và trước mọi câu ghi, nên một thao tác bị từ chối không để lại gì: không
    -- khoảng khoá, không ngoại lệ, không tín hiệu, không dòng audit, không đăng
    -- ký nào bị tính lại. Chỉ chặn **ghi** — `state` và `history` ở hai nhánh
    -- trên vẫn đọc được bình thường sau khi năm học đã đóng gói.
    --
    -- Trigger ở mục 5b cũng gọi đúng hàm này, nên câu dưới đây **không** thừa:
    -- nó bắt cả những nhánh không ghi gì. `lock` một slot đang khoá và `unlock`
    -- một slot đang mở trả về sớm mà không chạm bảng nào (EC-010-001/002); nếu
    -- chỉ có trigger thì hai lệnh đó sẽ *thành công* trong một năm đã đóng
    -- băng, và "bị từ chối" sẽ trở thành "im lặng báo không có gì đổi".
    perform public.device_use_assert_year_writable(v_class);
  end if;

  if p_action = 'state' then
    if v_week is null then
      raise exception 'DEVICE_POLICY_WEEK_REQUIRED' using errcode='22023';
    end if;
    -- Sol RC1 §10. `state` trả lời "buổi của tuần đang xem thì sao", còn nút
    -- Khóa/Mở hỏi "slot này **bây giờ** có đang khoá không". Với một tuần cũ
    -- nằm trong khoảng khoá đã đóng, câu trả lời thứ nhất là `locked` còn câu
    -- thứ hai là `open` — nếu trang chỉ có một trong hai thì giáo viên sẽ thấy
    -- nút "Mở từ bây giờ" cho một slot chẳng có gì để mở. Trả cả hai.
    -- Sol RC7 R-008. `override_id` **phải** là ngoại lệ của đúng khoảng khoá
    -- đang chi phối buổi này, không phải "ngoại lệ nào đó của lớp+tuần+ô còn
    -- chưa hủy". Hai dòng như vậy là hợp lệ (RC1 P1: mỗi chu kỳ khoá giữ ngoại
    -- lệ của mình), nên câu hỏi sai không chỉ trả lời sai mà còn làm cả RPC
    -- `state` gãy với "more than one row returned by a subquery".
    --
    -- Giờ bắt đầu và khoảng khoá được giải **một lần** ở hai lateral dưới đây
    -- rồi dùng lại, thay vì gọi lại resolver ở từng khoá JSON.
    return coalesce((
      select jsonb_agg(
        case when v_manager then jsonb_build_object(
               'weekday',s.weekday,'period_number',s.period_number,
               'state',public.device_use_policy_state(v_class,v_week,s.weekday,s.period_number),
               'session_start',t.ss,
               'current_recurring_state',case when exists(
                   select 1 from public.device_use_lock_intervals i
                    where i.class_id=v_class and i.weekday=s.weekday
                      and i.period_number=s.period_number and i.unlocked_at is null)
                 then 'locked' else 'open' end,
               'locked_at',(select i.locked_at from public.device_use_lock_intervals i
                             where i.class_id=v_class and i.weekday=s.weekday and i.period_number=s.period_number
                               and i.unlocked_at is null),
               'override_id',public.device_use_live_override(u.iv,v_week,s.weekday,s.period_number,t.ss))
        -- Học sinh chỉ nhận đúng thứ cần để hiển thị: buổi nào, trạng thái gì,
        -- bắt đầu lúc mấy giờ. Không có ai-bấm-nút, không có id nội bộ.
        else jsonb_build_object(
               'weekday',s.weekday,'period_number',s.period_number,
               'state',public.device_use_policy_state(v_class,v_week,s.weekday,s.period_number),
               'session_start',t.ss)
        end order by s.weekday,s.period_number)
      from public.device_use_week_slots(v_class,v_week) s
      cross join lateral (select public.study_session_start(v_class,v_week,s.weekday,s.period_number) as ss) t
      cross join lateral (select public.device_use_locking_interval(
                            v_class,v_week,s.weekday,s.period_number,t.ss) as iv) u
    ), '[]'::jsonb);
  end if;

  if p_action = 'history' then
    return jsonb_build_object(
      'intervals', coalesce((select jsonb_agg(to_jsonb(i) order by i.locked_at desc)
                              from public.device_use_lock_intervals i where i.class_id=v_class),'[]'::jsonb),
      'overrides', coalesce((select jsonb_agg(to_jsonb(o) order by o.created_at desc)
                              from public.device_use_session_overrides o where o.class_id=v_class),'[]'::jsonb));
  end if;

  if v_wd is null or v_pn is null then
    raise exception 'DEVICE_POLICY_SLOT_REQUIRED' using errcode='22023';
  end if;

  -- Nửa còn lại của khoá tư vấn ở mục 4: độc quyền, nên nó đợi mọi lần ghi
  -- đăng ký đang dở của đúng slot này commit xong rồi mới đọc để tính lại.
  perform pg_advisory_xact_lock(public.device_use_slot_key(v_class,v_wd,v_pn));

  if p_action = 'lock' then
    -- EC-010-001: khoá một slot đang khoá thì trả về trạng thái hiện tại, không
    -- tạo khoảng chồng. Ràng buộc unique ở mục 1 là lưới an toàn thứ hai.
    select * into v_row from public.device_use_lock_intervals
     where class_id=v_class and weekday=v_wd and period_number=v_pn and unlocked_at is null;
    if found then
      return jsonb_build_object('action','lock','changed',false,'interval_id',v_row.id,
                                'locked_at',v_row.locked_at,'registrations_updated',0);
    end if;
    insert into public.device_use_lock_intervals(class_id,weekday,period_number,locked_at,locked_by)
      values(v_class,v_wd,v_pn,v_now,auth.uid()) returning * into v_row;
    v_moved := public.device_use_recompute(v_class,v_wd,v_pn);
    perform public.device_use_bump_signal(v_class);
    insert into public.audit_logs(actor_id,class_id,action,entity_type,entity_id,new_data,source)
      values(auth.uid(),v_class,'device_use_lock','device_use_lock_intervals',v_row.id::text,
             jsonb_build_object('weekday',v_wd,'period_number',v_pn,'locked_at',v_row.locked_at,
                                'registrations_updated',v_moved),'server');
    return jsonb_build_object('action','lock','changed',true,'interval_id',v_row.id,
                              'locked_at',v_row.locked_at,'registrations_updated',v_moved);
  end if;

  if p_action = 'unlock' then
    -- EC-010-002: mở một slot đang mở là no-op. Không tạo khoảng giả để "ghi
    -- nhận" thao tác — một khoảng có locked_at = unlocked_at sẽ là một lời nói
    -- dối trong lịch sử.
    select * into v_row from public.device_use_lock_intervals
     where class_id=v_class and weekday=v_wd and period_number=v_pn and unlocked_at is null;
    if not found then
      return jsonb_build_object('action','unlock','changed',false,'registrations_updated',0);
    end if;
    update public.device_use_lock_intervals
       set unlocked_at=v_now, unlocked_by=auth.uid(), updated_at=v_now
     where id=v_row.id returning * into v_row;
    v_moved := public.device_use_recompute(v_class,v_wd,v_pn);
    perform public.device_use_bump_signal(v_class);
    insert into public.audit_logs(actor_id,class_id,action,entity_type,entity_id,new_data,source)
      values(auth.uid(),v_class,'device_use_unlock','device_use_lock_intervals',v_row.id::text,
             jsonb_build_object('weekday',v_wd,'period_number',v_pn,'locked_at',v_row.locked_at,
                                'unlocked_at',v_row.unlocked_at,'registrations_updated',v_moved),'server');
    return jsonb_build_object('action','unlock','changed',true,'interval_id',v_row.id,
                              'unlocked_at',v_row.unlocked_at,'registrations_updated',v_moved);
  end if;

  if p_action in ('allow_session','revoke_allow') then
    if v_week is null then
      raise exception 'DEVICE_POLICY_WEEK_REQUIRED' using errcode='22023';
    end if;
    -- Sol RC1 P1. Một override là ngoại lệ của một khoảng khoá, nên phải có
    -- khoảng khoá đang khoá đúng buổi này thì mới có gì để làm ngoại lệ. Tìm nó
    -- ở đây, trước cả kiểm tra giờ, và dùng chính nó làm chủ sở hữu của
    -- override — frontend ẩn nút là chuyện của frontend, §13 đòi cưỡng chế ở
    -- backend.
    v_start := public.study_session_start(v_class,v_week,v_wd,v_pn);
    if v_start is null then
      raise exception 'DEVICE_POLICY_SESSION_TIME_UNRESOLVED' using errcode='P0001';
    end if;
    v_interval := public.device_use_locking_interval(v_class,v_week,v_wd,v_pn,v_start);
    if v_interval is null then
      raise exception 'DEVICE_POLICY_SESSION_NOT_LOCKED' using errcode='42501',
        hint='Buổi này không nằm trong khoảng khoá nào nên không có gì để mở riêng.';
    end if;
    -- BR-010-006 / BR-010-007 / DEC-113: chỉ thao tác được với buổi chưa bắt đầu.
    if v_start <= v_now then
      raise exception 'DEVICE_POLICY_SESSION_ALREADY_STARTED' using errcode='42501';
    end if;
  end if;

  if p_action = 'allow_session' then
    select * into v_ovr from public.device_use_session_overrides
     where interval_id=v_interval and week_id=v_week and weekday=v_wd and period_number=v_pn and revoked_at is null;
    if found then
      return jsonb_build_object('action','allow_session','changed',false,'override_id',v_ovr.id,
                                'registrations_updated',0);
    end if;
    insert into public.device_use_session_overrides(interval_id,class_id,week_id,weekday,period_number,mode,created_by)
      values(v_interval,v_class,v_week,v_wd,v_pn,'allow',auth.uid()) returning * into v_ovr;
    v_moved := public.device_use_recompute(v_class,v_wd,v_pn);
    perform public.device_use_bump_signal(v_class);
    insert into public.audit_logs(actor_id,class_id,action,entity_type,entity_id,new_data,source)
      values(auth.uid(),v_class,'device_use_allow_session','device_use_session_overrides',v_ovr.id::text,
             jsonb_build_object('week_id',v_week,'weekday',v_wd,'period_number',v_pn,
                                'created_at',v_ovr.created_at,'registrations_updated',v_moved),'server');
    return jsonb_build_object('action','allow_session','changed',true,'override_id',v_ovr.id,
                              'registrations_updated',v_moved);
  end if;

  if p_action = 'revoke_allow' then
    select * into v_ovr from public.device_use_session_overrides
     where interval_id=v_interval and week_id=v_week and weekday=v_wd and period_number=v_pn and revoked_at is null;
    if not found then
      return jsonb_build_object('action','revoke_allow','changed',false,'registrations_updated',0);
    end if;
    update public.device_use_session_overrides
       set revoked_at=v_now, revoked_by=auth.uid()
     where id=v_ovr.id returning * into v_ovr;
    v_moved := public.device_use_recompute(v_class,v_wd,v_pn);
    perform public.device_use_bump_signal(v_class);
    insert into public.audit_logs(actor_id,class_id,action,entity_type,entity_id,new_data,source)
      values(auth.uid(),v_class,'device_use_revoke_allow','device_use_session_overrides',v_ovr.id::text,
             jsonb_build_object('week_id',v_week,'weekday',v_wd,'period_number',v_pn,
                                'revoked_at',v_ovr.revoked_at,'registrations_updated',v_moved),'server');
    return jsonb_build_object('action','revoke_allow','changed',true,'override_id',v_ovr.id,
                              'registrations_updated',v_moved);
  end if;

  raise exception 'DEVICE_POLICY_UNKNOWN_ACTION: %', p_action using errcode='22023';
end $$;

comment on function public.device_use_policy(text,jsonb) is
 'FEAT-010: state | history | lock | unlock | allow_session | revoke_allow. Ghi chỉ dành cho giáo viên được phân công lớp.';

-- ---------------------------------------------------------------------------
-- 7. RLS
--
-- Hai bảng policy chỉ cho **đọc**, và chỉ người quản lý lớp mới đọc được.
-- Không có policy INSERT/UPDATE/DELETE nào, nên RLS mặc-định-từ-chối khoá mọi
-- đường ghi trực tiếp qua REST kể cả với giáo viên (AC-010-018, §13). Đường ghi
-- duy nhất là RPC ở mục 6, chạy security definer nên nó không bị chính RLS này
-- chặn.
--
-- Sol RC1 §8: học sinh **không** đọc thẳng hai bảng này. Chúng mang
-- `locked_by`/`unlocked_by`/`created_by`/`revoked_by` — ai bấm nút — mà học sinh
-- không cần. Thứ học sinh cần là `device_use_policy('state', …)`, vốn trả về
-- bản đã lọc.
-- ---------------------------------------------------------------------------

alter table public.device_use_lock_intervals enable row level security;
alter table public.device_use_session_overrides enable row level security;
alter table public.device_use_policy_signals enable row level security;

drop policy if exists device_use_lock_intervals_select_v010 on public.device_use_lock_intervals;
create policy device_use_lock_intervals_select_v010 on public.device_use_lock_intervals
  for select to authenticated using (public.can_manage_class(class_id));

drop policy if exists device_use_session_overrides_select_v010 on public.device_use_session_overrides;
create policy device_use_session_overrides_select_v010 on public.device_use_session_overrides
  for select to authenticated using (public.can_manage_class(class_id));

-- Supabase đặt ALTER DEFAULT PRIVILEGES cho anon/authenticated/service_role
-- trên mọi bảng mới trong schema public, nên hai bảng này sinh ra đã có quyền
-- ghi cho cả anon. Các lệnh dưới đây nói rõ quyền phải là gì thay vì để nó phụ
-- thuộc vào mặc định của dự án — và cũng để harness và production giống nhau.
revoke all on public.device_use_lock_intervals, public.device_use_session_overrides from anon, authenticated;
grant select on public.device_use_lock_intervals, public.device_use_session_overrides to authenticated;

-- Tín hiệu: học sinh và lớp trưởng của lớp đọc được, vì không đọc được thì
-- realtime không tới được các em. Không có policy ghi nào; đường ghi duy nhất
-- là `device_use_bump_signal()` chạy bên trong RPC.
drop policy if exists device_use_policy_signals_select_v010 on public.device_use_policy_signals;
create policy device_use_policy_signals_select_v010 on public.device_use_policy_signals
  for select to authenticated
  using (coalesce(public.can_manage_class(class_id) or class_id = public.current_student_class_id(), false));

revoke all on public.device_use_policy_signals from anon, authenticated;
grant select on public.device_use_policy_signals to authenticated;
-- Sol RC6 R-007. `service_role` **không** còn DML trên bảng của FEAT-010.
-- Một câu INSERT thẳng chạy đúng chốt chặn năm học rồi thôi: không
-- `device_use_recompute()`, không tín hiệu realtime, không dòng audit. Nó
-- trông như một lần đổi chính sách thiết bị mà không phải, nên thứ cần bỏ là
-- cái quyền cho phép nó — không phải thêm trigger để vá lại nửa còn thiếu.
-- Đường ghi hợp lệ vẫn là `device_use_policy()`, vốn `security definer` nên
-- không cần quyền bảng nào cả. Đọc thì vẫn mở, vì một thành phần phía máy chủ
-- có thể cần nhìn.
grant select on public.device_use_policy_signals to service_role;
revoke all on function public.device_use_bump_signal(uuid) from public, anon, authenticated;
revoke all on public.device_use_lock_intervals, public.device_use_session_overrides,
  public.device_use_policy_signals from service_role;
grant select on public.device_use_lock_intervals, public.device_use_session_overrides,
  public.device_use_policy_signals to service_role;

-- Sol RC1 P3 + Sol RC3 R-002. `device_use_policy_state` và `device_use_effective`
-- là SECURITY DEFINER và **không tự kiểm tra quyền** — kiểm tra nằm ở wrapper.
-- Cấp EXECUTE cho client là dựng thêm một API thứ hai đi vòng qua đúng chỗ kiểm
-- tra đó, và vì chúng là SECURITY DEFINER nên RLS trên bảng không đỡ thay được.
--
-- `from public` **không** đủ trên dự án này. `pg_default_acl` của production
-- (schema public, owner postgres) là:
--
--   {postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
--
-- tức là `anon` được cấp EXECUTE **tường minh** cho mọi hàm mới, không phải thừa
-- kế qua PUBLIC — nên `revoke … from public` không gỡ nó. RC3 trở về trước chỉ
-- thu hồi PUBLIC ở wrapper, nên bất biến "chỉ authenticated gọi được" là sai
-- trên production dù đúng trong harness. Danh sách dưới đây thu hồi sạch trước
-- rồi cấp lại đúng một quyền, cho **mọi** hàm FEAT-010 tạo ra, kể cả hàm trigger
-- (hàm trigger không gọi thẳng được từ SQL, nhưng để nó ngoài danh sách thì lần
-- sau sẽ có người để một hàm thật ra ngoài).
revoke all on function public.device_use_policy_state(uuid,uuid,integer,integer) from public, anon, authenticated;
revoke all on function public.device_use_effective(boolean,uuid,uuid,integer,integer) from public, anon, authenticated;
revoke all on function public.device_use_week_slots(uuid,uuid) from public, anon, authenticated;
revoke all on function public.device_use_locking_interval(uuid,uuid,integer,integer,timestamptz) from public, anon, authenticated;
revoke all on function public.device_use_live_override(uuid,uuid,integer,integer,timestamptz) from public, anon, authenticated;
revoke all on function public.device_use_slot_key(uuid,integer,integer) from public, anon, authenticated;
revoke all on function public.device_use_recompute(uuid,integer,integer) from public, anon, authenticated;
revoke all on function public.device_use_assert_year_writable(uuid) from public, anon, authenticated;
revoke all on function public.device_use_guard_year_freeze() from public, anon, authenticated;
revoke all on function public.device_use_guard_override_week() from public, anon, authenticated;
revoke all on function public.apply_device_use_policy() from public, anon, authenticated;

revoke all on function public.device_use_policy(text,jsonb) from public, anon, authenticated;
grant execute on function public.device_use_policy(text,jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 8. FEAT-007 — §19 / DEC-111
--
-- Kết luận: **retain, không archive, không purge** — và điều đó là an toàn vì
-- purge của FEAT-007 không chạm tới bất cứ thứ gì hai bảng này tham chiếu.
--
-- Bằng chứng, đọc từ chính `12-FEAT-007-ARCHIVE-PURGE.sql`: 13 bước purge xoá
-- homework_notice_reactions, homework_notice_reminders, homework_duplicate_reviews,
-- homework_reports, homework_corrections, homework_correction_rounds,
-- homework_moderation_events, homework_notifications, homework_contribution_events,
-- homework_notice_media, homework_media_history, homework_notices,
-- english_group_members, english_groups và class_subjects. Không bước nào xoá
-- `classes`, `weeks`, `class_weeks` hay `registrations`; hơn thế,
-- `archive_guard_class()` còn **từ chối** mọi DELETE trên `classes`.
--
-- Hai bảng của FEAT-010 chỉ tham chiếu `classes(id)`, `weeks(id)`,
-- `periods(period_number)` và `profiles(id)`. Không cái nào bị purge, nên tình
-- trạng mà §19 cấm — "policy rows bị purge nhưng ZIP không chứa chúng" —
-- không thể xảy ra, và không có FK nào có thể lủng lẳng.
--
-- Vì vậy ARCHIVE_FORMAT_VERSION không đổi, ENTITY_FILES không thêm mục, Viewer
-- không phải sửa, và bản lưu trữ RC6 đã được Sol duyệt giữ nguyên vân tay.
-- Có test khẳng định điều này thay vì để nó là một lời hứa
-- ("tests/feat-010/database.test.mjs": bảng policy không nằm trong tập bảng bị
-- purge, và một lần purge đầy đủ để lại nguyên vẹn các dòng policy).
-- ---------------------------------------------------------------------------

commit;
