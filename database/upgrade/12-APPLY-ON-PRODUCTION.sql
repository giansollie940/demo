-- ============================================================================
-- FEAT-007 — CHẠY TRÊN PRODUCTION HIỆN TẠI (đang có bản RC1)
--
-- Tệp này = 12b (gỡ RC1) + 12 (bản RC6 đã được Sol duyệt), nối lại làm một.
-- Dán cả tệp vào Supabase SQL editor và chạy một lần.
--
-- Vì sao không chạy thẳng tệp 12: production đang có bản RC1 của migration 12,
-- nên `alter table public.school_years add column archive_state` sẽ lỗi ngay
-- dòng đầu (cột đã tồn tại). Phải gỡ RC1 trước.
--
-- Đây là HAI giao dịch, không phải một:
--   · phần A commit trước khi phần B bắt đầu;
--   · nếu phần B lỗi, phần A vẫn đã commit — lúc đó database không còn FEAT-007
--     (tab Kho lưu trữ sẽ báo lỗi), và cách sửa là chạy riêng tệp
--     `12-FEAT-007-ARCHIVE-PURGE.sql`. Không chạy lại phần A.
--
-- Phần A tự từ chối nếu đã có bản lưu trữ nào, hoặc có năm học đang bị đóng
-- băng. Tính đến 2026-09-19 trên database thật: 0 bản lưu trữ, 1 năm học ở
-- trạng thái 'active' — nên nó sẽ chạy qua.
-- ============================================================================

-- ══════════════════════════ PHẦN A — gỡ RC1 ══════════════════════════
-- ============================================================================
-- FEAT-007 — bring a database that already has the RC1 migration 12 up to the
-- approved RC6 one.
--
-- WHY A RESET AND NOT A DELTA
-- The RC1 version of `12-FEAT-007-ARCHIVE-PURGE.sql` is installed in production.
-- Five review rounds changed it: the three-stage fingerprint, the table-level
-- freeze, the class-configuration decision, the two-sided update check and the
-- multi-owner resolver. Writing that as a hand-made delta would produce a schema
-- that resembles the reviewed one; removing RC1 and running the reviewed file
-- unchanged produces the reviewed one. The only reason that is safe is that the
-- feature has never been used: with a single archive row it would not be.
--
-- HOW TO RUN
--   1. Run this file **once**, on its own, in a transaction.
--   2. Then run `12-FEAT-007-ARCHIVE-PURGE.sql` (the RC6 file) unchanged.
-- Both in the Supabase SQL editor. Nothing else in between.
--
-- It refuses to do anything if any archive has ever been started, or if any
-- school year is not `active`. Those are the states where dropping the tables
-- would destroy the record of what was archived or leave a year frozen with no
-- guard, and they need a person, not a script.
-- ============================================================================

begin;

do $$
declare n bigint; states text;
begin
 select count(*) into n from public.homework_archives;
 if n > 0 then
  raise exception 'Đã có % bản lưu trữ trong homework_archives. Không chạy tệp này — hãy hỏi lại trước khi xoá lịch sử lưu trữ.',n
   using errcode='42501';
 end if;
 select string_agg(distinct archive_state,', ') into states from public.school_years where archive_state <> 'active';
 if states is not null then
  raise exception 'Có năm học đang ở trạng thái %. Không chạy tệp này khi còn năm học bị đóng băng.',states
   using errcode='42501';
 end if;
end $$;

-- 1. The two public entry points RC1 added.
drop function if exists public.homework_archive(text,jsonb);
drop function if exists public.homework_archive_export(uuid,text,text,integer);

-- 2. RC1's helpers. RC6 creates these again, two of them with different bodies,
--    and adds five more.
drop function if exists homework_private.archive_admin();
drop function if exists homework_private.archive_counts(uuid);
drop function if exists homework_private.archive_blockers(uuid);
drop function if exists homework_private.archive_readonly(uuid);

-- 3. The archive index and its audit trail. Empty, checked above.
drop table if exists public.homework_archive_events;
drop table if exists public.homework_archive_steps;
drop table if exists public.homework_archive_media;
drop table if exists public.homework_archives;

-- 4. The year-state column and its check constraint.
alter table public.school_years drop column if exists archive_state;

-- 5. Put the two dispatchers back where migration 11 left them, so the RC6 file
--    can wrap them exactly as it expects to. This reverses RC1's rename; it does
--    not touch api_v3…api_v6 or media_v6 underneath.
drop function if exists public.homework_api(text,jsonb);
drop function if exists public.homework_media(text,jsonb);
alter function homework_private.api_v8(text,jsonb) rename to homework_api;
alter function homework_private.homework_api(text,jsonb) set schema public;
alter function homework_private.media_v8(text,jsonb) rename to homework_media;
alter function homework_private.homework_media(text,jsonb) set schema public;
grant execute on function public.homework_api(text,jsonb),public.homework_media(text,jsonb) to authenticated;

-- 6. Prove the database is back to the migration-11 shape the RC6 file expects.
do $$
declare leftovers text;
begin
 select string_agg(what,', ') into leftovers from (
  select 'archive_state column' as what where exists(select 1 from information_schema.columns
   where table_schema='public' and table_name='school_years' and column_name='archive_state')
  union all select 'homework_archive* tables' where exists(select 1 from information_schema.tables
   where table_schema='public' and table_name like 'homework_archive%')
  union all select 'archive_* helpers' where exists(select 1 from pg_proc p join pg_namespace s on s.oid=p.pronamespace
   where s.nspname='homework_private' and p.proname like 'archive%')
  union all select 'api_v8/media_v8' where exists(select 1 from pg_proc p join pg_namespace s on s.oid=p.pronamespace
   where s.nspname='homework_private' and p.proname in('api_v8','media_v8'))
  union all select 'public.homework_api missing' where not exists(select 1 from pg_proc p join pg_namespace s on s.oid=p.pronamespace
   where s.nspname='public' and p.proname='homework_api')
  union all select 'public.homework_media missing' where not exists(select 1 from pg_proc p join pg_namespace s on s.oid=p.pronamespace
   where s.nspname='public' and p.proname='homework_media')
 ) t;
 if leftovers is not null then
  raise exception 'Dọn chưa sạch: %. Không commit.',leftovers;
 end if;
end $$;

commit;

-- Now run 12-FEAT-007-ARCHIVE-PURGE.sql (RC6), unchanged.

-- ══════════════════ PHẦN B — cài bản RC6 đã duyệt ══════════════════
-- FEAT-007, apply after FEAT-008 migration 11. Transactional, no existing data rewrite.
--
-- End-of-year archive, verification and purge. The ZIP itself is built in the
-- Admin's browser and never touches the server (DEC-064, DEC-066), so this
-- migration's job is the part a browser cannot be trusted with: recording what
-- the archive is *required* to contain, checking what the browser reports back
-- against the server's own record, and refusing to open the purge gate until
-- that check passes.
begin;

-- RB-711. A year is either live or a read-only historical record. The flag lives
-- on the year, not on a separate table, so every guard reads it from the one
-- place the rest of the app already joins to.
-- 'archiving' is a run-scoped write freeze: it is set when an archive run starts
-- and withholds writes exactly like 'archived_read_only'. Without it the year can
-- be edited between the archive being verified and the purge running, and the
-- purge would then delete rows the ZIP never contained.
alter table public.school_years add column archive_state text not null default 'active'
 check(archive_state in('active','archiving','archived_read_only'));

-- The light index that survives purge (RB-710, DEC-068). Everything here is
-- metadata about the archive; no purged detail is kept.
create table public.homework_archives (
 id uuid primary key default gen_random_uuid(),
 school_year_id uuid not null references public.school_years(id),
 -- Denormalised on purpose: the index must stay readable and meaningful even if
 -- the year is later renamed, and it is the only surviving name after purge.
 school_year_name text not null,
 archive_format_version text not null,
 status text not null default 'building'
  check(status in('building','verified','failed','purging','purged')),
 counts jsonb not null default '{}'::jsonb,
 media_count integer not null default 0,
 media_bytes bigint not null default 0,
 archive_size_bytes bigint,
 -- SHA-256 of checksums.txt. One value that changes if any member of the
 -- archive changes, so re-opening the saved file can prove it is this archive.
 checksum text check(checksum ~ '^[a-f0-9]{64}$'),
 -- The year's row *content*, hashed at three points. `begin_fingerprint` is taken
 -- before the browser reads anything, so it describes the dataset the ZIP is
 -- built from. `complete` recomputes it and refuses unless it is unchanged, which
 -- is what proves the ZIP and the database still agree. `dataset_fingerprint` is
 -- then that same value, and purge re-checks it once more.
 --
 -- Recording the fingerprint only at `complete` was not enough: a count-preserving
 -- update made *after* the browser exported a row but *before* `complete` was
 -- absorbed into the recorded value, so the archive verified against a dataset the
 -- ZIP never contained, and the purge then deleted it.
 begin_fingerprint text,
 dataset_fingerprint text,
 failure_reason text,
 created_at timestamptz not null default clock_timestamp(),
 created_by uuid references public.profiles(id),
 verified_at timestamptz, verified_by uuid references public.profiles(id),
 download_confirmed_at timestamptz, download_confirmed_by uuid references public.profiles(id),
 purge_reason text, purge_started_at timestamptz,
 purged_at timestamptz, purged_by uuid references public.profiles(id)
);
create index homework_archives_year on public.homework_archives(school_year_id,created_at desc);

-- The inventory snapshot, taken when the run starts. expected_checksum is the
-- server's own record of what the object should hash to; it is NEVER sent to the
-- client. The client downloads the bytes from R2, hashes them itself, and reports
-- the result, which is then compared here. A browser that skipped a file, or a
-- bucket that corrupted one, cannot produce a matching value by guessing.
create table public.homework_archive_media (
 archive_id uuid not null references public.homework_archives(id) on delete cascade,
 -- No FK to homework_attachments: after purge the attachment rows are gone and
 -- this inventory must still be readable as part of the index.
 attachment_id uuid not null,
 object_key text not null, size_bytes integer not null,
 expected_checksum text not null, archive_path text not null,
 reported_checksum text, reported_bytes integer, reported_at timestamptz,
 primary key(archive_id,attachment_id)
);

-- RB-713/EC-705/AC-722. Purge advances one step at a time and records where it
-- got to, so an interrupted run resumes instead of restarting or, worse, being
-- reported as finished.
create table public.homework_archive_steps (
 archive_id uuid not null references public.homework_archives(id) on delete cascade,
 step text not null, seq integer not null,
 state text not null default 'pending' check(state in('pending','running','done')),
 rows_removed bigint not null default 0,
 started_at timestamptz, finished_at timestamptz,
 primary key(archive_id,step)
);

create table public.homework_archive_events (
 id uuid primary key default gen_random_uuid(),
 archive_id uuid references public.homework_archives(id) on delete set null,
 actor_id uuid references public.profiles(id),
 event_type text not null, data jsonb,
 created_at timestamptz not null default clock_timestamp()
);
create index homework_archive_events_time on public.homework_archive_events(created_at desc);

alter table public.homework_archives enable row level security;
alter table public.homework_archive_media enable row level security;
alter table public.homework_archive_steps enable row level security;
alter table public.homework_archive_events enable row level security;
revoke all on public.homework_archives,public.homework_archive_media,public.homework_archive_steps,public.homework_archive_events from public,anon,authenticated;

-- Archive administration is system-wide, like storage health, so it resolves the
-- actor from profiles rather than from a class membership.
create function homework_private.archive_admin() returns public.profiles language plpgsql security definer set search_path=pg_catalog,public as $$
declare a public.profiles;begin
 select * into a from public.profiles where id=auth.uid() and active and deleted_at is null;
 if a.id is null or a.role::text<>'admin' then raise exception 'Chỉ Admin dùng được kho lưu trữ' using errcode='42501';end if;
 return a;
end $$;

-- One definition of "what belongs to this school year", used by preflight, by the
-- export, by the inventory and by purge. Keeping it in one place is what makes
-- "the archive contains exactly what purge removes" checkable instead of hopeful.
create function homework_private.archive_counts(p_year uuid) returns jsonb language sql stable security definer set search_path=pg_catalog,public as $$
 with cls as (select id from public.classes where school_year_id=p_year),
 nt as (select id from public.homework_notices where school_year_id=p_year)
 select jsonb_build_object(
  'classes',(select count(*) from cls),
  'profiles',(select count(*) from public.profiles where class_id in(select id from cls)),
  'class_subjects',(select count(*) from public.class_subjects where class_id in(select id from cls)),
  'english_groups',(select count(*) from public.english_groups where school_year_id=p_year),
  'english_group_members',(select count(*) from public.english_group_members where school_year_id=p_year),
  'notices',(select count(*) from nt),
  'reactions',(select count(*) from public.homework_notice_reactions where notice_id in(select id from nt)),
  'reminders',(select count(*) from public.homework_notice_reminders where notice_id in(select id from nt)),
  'reports',(select count(*) from public.homework_reports where notice_id in(select id from nt)),
  'corrections',(select count(*) from public.homework_corrections where notice_id in(select id from nt)),
  'correction_rounds',(select count(*) from public.homework_correction_rounds where correction_id in(select id from public.homework_corrections where notice_id in(select id from nt))),
  'duplicate_reviews',(select count(*) from public.homework_duplicate_reviews where notice_id in(select id from nt)),
  'tombstones',(select count(*) from public.homework_tombstones where class_id in(select id from cls)),
  'contribution_events',(select count(*) from public.homework_contribution_events where class_id in(select id from cls)),
  'moderation_events',(select count(*) from public.homework_moderation_events where class_id in(select id from cls)),
  'notifications',(select count(*) from public.homework_notifications where class_id in(select id from cls)),
  'media',(select count(*) from public.homework_attachments where school_year_id=p_year and status='active'))
$$;

-- Content, not counts. Every row the archive represents is hashed and the
-- per-row hashes are combined in a fixed order, so an update that leaves the row
-- count untouched still moves the result. Recorded when the archive is verified
-- and re-checked before purge: if the year no longer hashes to what was archived,
-- the ZIP is not a copy of what is about to be deleted.
create function homework_private.archive_fingerprint(p_year uuid) returns text language sql stable security definer set search_path=pg_catalog,public as $$
 with cls as (select id from public.classes where school_year_id=p_year),
 nt as (select id from public.homework_notices where school_year_id=p_year),
 rows_all as (
  select 'classes'||md5(t::text) h from public.classes t where school_year_id=p_year
  union all select 'profiles'||md5(row(t.id,t.full_name,t.role,t.active,t.class_id,t.deleted_at)::text) from public.profiles t where class_id in(select id from cls)
  union all select 'class_subjects'||md5(t::text) from public.class_subjects t where class_id in(select id from cls)
  union all select 'english_groups'||md5(t::text) from public.english_groups t where school_year_id=p_year
  union all select 'english_group_members'||md5(t::text) from public.english_group_members t where school_year_id=p_year
  union all select 'notices'||md5(t::text) from public.homework_notices t where school_year_id=p_year
  union all select 'reactions'||md5(t::text) from public.homework_notice_reactions t where notice_id in(select id from nt)
  union all select 'reminders'||md5(t::text) from public.homework_notice_reminders t where notice_id in(select id from nt)
  union all select 'reports'||md5(t::text) from public.homework_reports t where notice_id in(select id from nt)
  union all select 'corrections'||md5(t::text) from public.homework_corrections t where notice_id in(select id from nt)
  union all select 'rounds'||md5(t::text) from public.homework_correction_rounds t where correction_id in(select id from public.homework_corrections where notice_id in(select id from nt))
  union all select 'duplicate_reviews'||md5(t::text) from public.homework_duplicate_reviews t where notice_id in(select id from nt)
  union all select 'tombstones'||md5(t::text) from public.homework_tombstones t where class_id in(select id from cls)
  union all select 'contribution'||md5(t::text) from public.homework_contribution_events t where class_id in(select id from cls)
  union all select 'moderation'||md5(t::text) from public.homework_moderation_events t where class_id in(select id from cls)
  union all select 'notifications'||md5(t::text) from public.homework_notifications t where class_id in(select id from cls)
  union all select 'attachments'||md5(row(t.id,t.object_key,t.size_bytes,t.checksum,t.status,t.notice_id)::text) from public.homework_attachments t where school_year_id=p_year
  union all select 'notice_media'||md5(t::text) from public.homework_notice_media t where notice_id in(select id from nt)
  union all select 'media_history'||md5(t::text) from public.homework_media_history t where notice_id in(select id from nt)
 )
 select encode(sha256(convert_to(coalesce(string_agg(h,'|' order by h),''),'UTF8')),'hex') from rows_all
$$;

-- RB-702. Anything that would make the archive incomplete or ambiguous is
-- surfaced here rather than discovered halfway through a long run.
create function homework_private.archive_blockers(p_year uuid) returns jsonb language sql stable security definer set search_path=pg_catalog,public as $$
 select coalesce(jsonb_agg(x),'[]'::jsonb) from (
  -- EC-714: an upload nobody finished is not year data; it must be cleaned up
  -- (FEAT-008 does that) rather than archived as if it were a published image.
  select jsonb_build_object('code','pending_media','detail',count(*)) x
   from public.homework_attachments where school_year_id=p_year and status='pending' having count(*)>0
  union all
  -- A row queued for purge is mid-flight: archiving it would capture an object
  -- that is about to disappear, and skipping it would silently lose data.
  select jsonb_build_object('code','deleting_media','detail',count(*))
   from public.homework_attachments where school_year_id=p_year and status='deleting' having count(*)>0
  union all
  -- EC-701 in advance: metadata with no usable object key.
  select jsonb_build_object('code','media_without_key','detail',count(*))
   from public.homework_attachments where school_year_id=p_year and status='active' and coalesce(trim(object_key),'')='' having count(*)>0
  union all
  select jsonb_build_object('code','open_correction','detail',count(*))
   from public.homework_corrections x join public.homework_notices n on n.id=x.notice_id
   where n.school_year_id=p_year and x.status in('awaiting_author','awaiting_teacher') having count(*)>0
  union all
  select jsonb_build_object('code','notice_pending_review','detail',count(*))
   from public.homework_notices where school_year_id=p_year and status='pending_duplicate_review' having count(*)>0
 ) s
$$;

-- The one place that decides whether a year may still be written to. Called by
-- the dispatcher wrappers below.
create function homework_private.archive_readonly(p_class uuid) returns boolean language sql stable security definer set search_path=pg_catalog,public as $$
 select exists(select 1 from public.classes c join public.school_years y on y.id=c.school_year_id
  where c.id=p_class and y.archive_state<>'active')
$$;

-- Lifts the run-scoped freeze, but only when no archive of that year still needs
-- it: a verified archive waiting to be purged keeps the year frozen so the data
-- it represents cannot drift out from under it.
create function homework_private.archive_release(p_year uuid) returns void language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 -- 'purged' is in the list on purpose: a year whose data has been deleted must
 -- never drift back to writable because a later run was abandoned.
 if exists(select 1 from public.homework_archives where school_year_id=p_year and status in('building','verified','purging','purged')) then return;end if;
 update public.school_years set archive_state='active' where id=p_year and archive_state='archiving';
end $$;

-- ── The hard freeze ──────────────────────────────────────────────────────────
-- Withholding writes in the two public dispatchers is not enough. Purge runs as
-- thirteen separate calls, each committing on its own, so a direct SQL or
-- service-role write landing between two steps could insert a row that a later
-- step then deletes — a row that was never in the verified archive. The
-- dispatcher guard cannot see those writes at all.
--
-- So the guard lives on the tables. While a year is 'archiving' or
-- 'archived_read_only', nothing may write to its data except the purge itself,
-- which announces who it is through a transaction-local setting that only
-- `purge_step` sets, and only for an archive that is actually purging.

-- Which years can this row be placed in? *Every* one of them, not the first.
--
-- RC5 resolved a single owner by priority, which was wrong twice over. A row
-- with more than one ownership reference — `homework_reports` and
-- `homework_corrections` carry both `class_id` and `notice_id` — was attributed
-- to whichever key came first, while the archive, the fingerprint and the purge
-- all scope it by `notice_id`. An active class plus a frozen notice therefore
-- walked past the freeze and was deleted by the purge a few steps later. And
-- because `jsonb ? 'key'` is true for a key whose value is NULL, a nullable
-- high-priority column (`homework_correction_rounds.attachment_id`) resolved to
-- NULL and hid the real owner underneath it.
--
-- So: collect every year the row can be attributed to, through any reference
-- that can place it inside a purge set, and let the caller refuse if *any* of
-- them is frozen. An absent or NULL key contributes nothing rather than
-- masking the keys below it — there is no priority left to get wrong.
--
-- `subject_id` is deliberately not here: `homework_notices` has a composite
-- foreign key on (subject_id, class_id), so a notice's subject is always in the
-- notice's own class, which `class_id` already resolves.
create function homework_private.archive_guard_years(p_row jsonb) returns uuid[]
language sql stable security definer set search_path=pg_catalog,public as $$
 select coalesce(array_agg(distinct y),'{}'::uuid[]) from (
  select (p_row->>'school_year_id')::uuid
  union all select (select c.school_year_id from public.classes c where c.id=(p_row->>'class_id')::uuid)
  union all select (select n.school_year_id from public.homework_notices n where n.id=(p_row->>'notice_id')::uuid)
  union all select (select n.school_year_id from public.homework_notices n where n.id=(p_row->>'candidate_id')::uuid)
  union all select (select n.school_year_id from public.homework_notices n where n.id=(p_row->>'duplicate_of')::uuid)
  union all select (select m.school_year_id from public.homework_attachments m where m.id=(p_row->>'attachment_id')::uuid)
  union all select (select g.school_year_id from public.english_groups g where g.id=(p_row->>'english_group_id')::uuid)
  union all select (select n.school_year_id from public.homework_corrections c
    join public.homework_notices n on n.id=c.notice_id where c.id=(p_row->>'correction_id')::uuid)
  union all select (select n.school_year_id from public.homework_reports r
    join public.homework_notices n on n.id=r.notice_id where r.id=(p_row->>'report_id')::uuid)
 ) s(y) where y is not null
$$;

-- Is this year frozen, and is this caller allowed through anyway?
create function homework_private.archive_frozen(p_year uuid) returns boolean
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare state text; token text;
begin
 if p_year is null then return false;end if;
 select archive_state into state from public.school_years where id=p_year;
 -- A row that cannot be attributed to a year is left alone: the guard protects
 -- frozen years, and refusing what it cannot place would break unrelated work.
 if state is null or state='active' then return false;end if;
 -- The purge's own writes. `purge_step` sets this for the duration of its
 -- transaction; it names an archive, and that archive must belong to this year
 -- and actually be purging, so the setting cannot be reused elsewhere.
 token:=coalesce(current_setting('homework.archive_purge',true),'');
 if token<>'' and exists(select 1 from public.homework_archives
   where id=token::uuid and school_year_id=p_year and status='purging') then return false;end if;
 return true;
end $$;

create function homework_private.archive_guard() returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare years uuid[]; y uuid;
begin
 -- The end of the FEAT-006 media lifecycle, checked before anything else. The
 -- worker deletes an attachment row once R2 has confirmed the object is gone;
 -- that row is already marked for deletion and cannot introduce anything the
 -- archive does not have. Refusing it would strand attachment rows, and the
 -- bytes storage health counts, for ever. Read through the jsonb, not
 -- `old.status`: Postgres does not guarantee that the left side of AND
 -- short-circuits, so naming a column that only one table has fails on every
 -- other table this trigger is attached to.
 if tg_table_name='homework_attachments' and tg_op='DELETE' and to_jsonb(old)->>'status'='deleting' then return old;end if;

 -- Both sides of an update, and every owner on each side. Resolving only the
 -- new owner lets a frozen row be re-parented into an active year — it then
 -- escapes the purge entirely, and for an image that means bytes the year-end
 -- sweep never queues for deletion from R2. Resolving only *one* owner per side
 -- lets a row with an active class and a frozen notice walk in the other
 -- direction: past the freeze, and into a purge set it was never archived in.
 if tg_op<>'DELETE' then years:=homework_private.archive_guard_years(to_jsonb(new));end if;
 if tg_op<>'INSERT' then
  select coalesce(array_agg(distinct u),'{}'::uuid[]) into years
   from unnest(years||homework_private.archive_guard_years(to_jsonb(old))) u;
 end if;

 foreach y in array years loop
  if homework_private.archive_frozen(y) then
   raise exception 'Năm học đã đóng gói nên dữ liệu của năm đó không thay đổi được nữa (%.%).',tg_table_name,lower(tg_op)
    using errcode='42501';
  end if;
 end loop;
 return case when tg_op='DELETE' then old else new end;
end $$;

-- `classes` is not frozen wholesale — an Admin must still be able to rename or
-- deactivate a class of a year that has been packed away. But the class is what
-- attributes half the guarded tables to a year, so moving one out of a frozen
-- year would take its subjects with it, and deleting one would destroy rows the
-- archive represents. Those two operations only.
create function homework_private.archive_guard_class() returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if tg_op='DELETE' then
  if homework_private.archive_frozen(old.school_year_id) then
   raise exception 'Năm học đã đóng gói nên không xoá được lớp của năm đó.' using errcode='42501';
  end if;
  return old;
 end if;
 if new.school_year_id is distinct from old.school_year_id
  and (homework_private.archive_frozen(old.school_year_id) or homework_private.archive_frozen(new.school_year_id)) then
  raise exception 'Năm học đã đóng gói nên không chuyển lớp sang năm khác được.' using errcode='42501';
 end if;
 return new;
end $$;

do $$
declare t text;
begin
 -- Every table that both purge deletes from *and* the archive carries, plus the
 -- two link tables that cascade with a notice.
 --
 -- Four deliberate absences, in two groups:
 --  · profiles and classes — purge never deletes them, so a late write there
 --    cannot be destroyed, and freezing them outright would stop an Admin
 --    renaming a student who also studies in the current year. `classes` still
 --    gets the narrow guard above, because it is what attributes other rows to
 --    a year;
 --  · homework_settings and homework_backlog_state — the FEAT-001/002 dispatcher
 --    creates these lazily on *every* call, `load` and `inbox` included, so
 --    guarding them would make an archived year unreadable, which is the one
 --    thing RB-711 requires it to stay. Since RC5 the purge no longer deletes
 --    them either (DEC-101), so there is nothing here that a late write could
 --    destroy.
 foreach t in array array[
  'homework_notices','homework_notice_reactions','homework_notice_reminders','homework_duplicate_reviews',
  'homework_reports','homework_corrections','homework_correction_rounds','homework_moderation_events',
  'homework_notifications','homework_contribution_events','homework_notice_media','homework_media_history',
  'homework_attachments','english_groups','english_group_members','class_subjects']
 loop
  execute format('create trigger homework_archive_guard before insert or update or delete on public.%I for each row execute function homework_private.archive_guard()',t);
 end loop;
 create trigger homework_archive_guard_class before update or delete on public.classes
  for each row execute function homework_private.archive_guard_class();
end $$;

create function public.homework_archive(p_action text,p_data jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare a public.profiles; y public.school_years; ar public.homework_archives;
 st record; removed bigint:=0; total integer; matched integer; reported integer;
 now_counts jsonb; year_id uuid; cls uuid[];
begin
 a:=homework_private.archive_admin();

 if p_action='preflight' then
  year_id:=(p_data->>'school_year_id')::uuid;
  select * into y from public.school_years where id=year_id;
  if y.id is null then raise exception 'Không tìm thấy năm học';end if;
  return jsonb_build_object(
   'school_year_id',y.id,'school_year_name',y.name,'is_active',y.is_active,
   'archive_state',y.archive_state,
   'counts',homework_private.archive_counts(y.id),
   'media_bytes',(select coalesce(sum(size_bytes),0) from public.homework_attachments where school_year_id=y.id and status='active'),
   'blockers',homework_private.archive_blockers(y.id),
   'archives',(select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at desc),'[]'::jsonb)
     from public.homework_archives r where r.school_year_id=y.id));

 elsif p_action='list' then
  -- RB-710/AC-712: the index outlives the data, so it is readable on its own.
  return jsonb_build_object('archives',(select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at desc),'[]'::jsonb) from public.homework_archives r));

 elsif p_action='begin' then
  year_id:=(p_data->>'school_year_id')::uuid;
  select * into y from public.school_years where id=year_id for update;
  if y.id is null then raise exception 'Không tìm thấy năm học';end if;
  -- A year that is still being taught cannot be archived: the run would have to
  -- freeze it, and freezing the live year mid-term breaks the school day. Switch
  -- the active year first, which is the real end-of-year sequence anyway.
  if y.is_active then raise exception 'Không đóng gói được năm học đang hoạt động. Hãy chuyển năm học hiện hành sang năm mới trước.' using errcode='42501';end if;
  if jsonb_array_length(homework_private.archive_blockers(y.id))>0 then
   raise exception 'Năm học chưa sẵn sàng để đóng gói. Hãy xử lý các cảnh báo trong bước kiểm tra trước.';
  end if;
  -- The write freeze starts here, not after verification. An archive taken from a
  -- year that can still be written to is out of date the moment it finishes, and
  -- the purge it authorises would delete rows the ZIP never contained.
  update public.school_years set archive_state='archiving' where id=y.id and archive_state='active';
  -- NOT NULL on the column catches a missing key; this catches an empty or
  -- blank one, which is what a client bug actually produces.
  if coalesce(trim(p_data->>'archive_format_version'),'')='' then raise exception 'Thiếu archive_format_version';end if;
  insert into public.homework_archives(school_year_id,school_year_name,archive_format_version,counts,created_by,
   begin_fingerprint,media_count,media_bytes)
  values(y.id,y.name,p_data->>'archive_format_version',homework_private.archive_counts(y.id),a.id,
   homework_private.archive_fingerprint(y.id),
   (select count(*) from public.homework_attachments where school_year_id=y.id and status='active'),
   (select coalesce(sum(size_bytes),0) from public.homework_attachments where school_year_id=y.id and status='active'))
  returning * into ar;
  -- Snapshot the inventory. archive_path is decided here, not by the browser, so
  -- the ZIP layout the viewer expects cannot drift from what was recorded.
  insert into public.homework_archive_media(archive_id,attachment_id,object_key,size_bytes,expected_checksum,archive_path)
  select ar.id,m.id,m.object_key,m.size_bytes,m.checksum,'media/'||m.id::text||'.webp'
   from public.homework_attachments m where m.school_year_id=y.id and m.status='active';
  insert into public.homework_archive_events(archive_id,actor_id,event_type,data)
   values(ar.id,a.id,'archive_begin',jsonb_build_object('school_year_id',y.id,'counts',ar.counts));
  return to_jsonb(ar);

 elsif p_action='media_manifest' then
  -- Deliberately does not return expected_checksum: the client must derive its
  -- answer from the bytes it actually downloaded.
  select * into ar from public.homework_archives where id=(p_data->>'archive_id')::uuid;
  if ar.id is null then raise exception 'Không tìm thấy bản lưu';end if;
  return jsonb_build_object('items',(select coalesce(jsonb_agg(jsonb_build_object(
    'attachment_id',x.attachment_id,'object_key',x.object_key,'size_bytes',x.size_bytes,'archive_path',x.archive_path)
    order by x.attachment_id),'[]'::jsonb)
   from (select * from public.homework_archive_media where archive_id=ar.id
     and (p_data->>'after' is null or attachment_id>(p_data->>'after')::uuid)
     order by attachment_id limit least(coalesce((p_data->>'limit')::int,200),500)) x));

 elsif p_action='report_media' then
  select * into ar from public.homework_archives where id=(p_data->>'archive_id')::uuid for update;
  if ar.id is null or ar.status<>'building' then raise exception 'Bản lưu không ở trạng thái đang đóng gói';end if;
  update public.homework_archive_media t set reported_checksum=lower(s.checksum),reported_bytes=s.bytes,reported_at=clock_timestamp()
   from jsonb_to_recordset(p_data->'items') as s(attachment_id uuid,checksum text,bytes integer)
   where t.archive_id=ar.id and t.attachment_id=s.attachment_id;
  return jsonb_build_object('ok',true,
   'reported',(select count(*) from public.homework_archive_media where archive_id=ar.id and reported_checksum is not null),
   'total',(select count(*) from public.homework_archive_media where archive_id=ar.id));

 elsif p_action='complete' then
  -- RB-706/RB-707/AC-705/AC-706. Everything that can be checked server-side is
  -- checked here, and the result is either 'verified' or 'failed'. There is no
  -- separate "mark it verified" action for an Admin to reach past this.
  select * into ar from public.homework_archives where id=(p_data->>'archive_id')::uuid for update;
  if ar.id is null or ar.status<>'building' then raise exception 'Bản lưu không ở trạng thái đang đóng gói';end if;
  select count(*),count(reported_checksum),count(*) filter(where reported_checksum=lower(expected_checksum) and reported_bytes=size_bytes)
   into total,reported,matched from public.homework_archive_media where archive_id=ar.id;
  now_counts:=homework_private.archive_counts(ar.school_year_id);
  if coalesce(p_data->>'checksum','') !~ '^[a-f0-9]{64}$' then
   update public.homework_archives set status='failed',failure_reason='missing_checksum' where id=ar.id returning * into ar;
  elsif reported<total then
   -- EC-702: 1248 of 1249 is a failure, not a rounding error.
   update public.homework_archives set status='failed',
    failure_reason='media_missing:'||(total-reported)::text where id=ar.id returning * into ar;
  elsif matched<total then
   -- EC-701/EC-707: the bytes that reached the ZIP are not the bytes recorded.
   update public.homework_archives set status='failed',
    failure_reason='media_checksum_mismatch:'||(total-matched)::text where id=ar.id returning * into ar;
  elsif now_counts<>ar.counts then
   -- The year changed while the archive was being built, so the ZIP is already
   -- out of date and must not become the thing purge is measured against.
   update public.homework_archives set status='failed',failure_reason='year_changed_during_archive' where id=ar.id returning * into ar;
  elsif ar.begin_fingerprint is distinct from homework_private.archive_fingerprint(ar.school_year_id) then
   -- The decisive check. Counts cannot see an update, and the freeze does not
   -- cover the SQL editor or a service-role job, so the only way to know the ZIP
   -- still matches is to compare the content hash against the one taken before
   -- the browser read a single row. Hashing at `complete` alone would absorb the
   -- change instead of catching it.
   update public.homework_archives set status='failed',failure_reason='dataset_changed_during_archive' where id=ar.id returning * into ar;
  else
   -- The stored value is the *begin* fingerprint, which is what the ZIP holds.
   -- It equals the current one here, but saying so explicitly keeps "the archive
   -- represents the dataset it was built from" true by construction.
   update public.homework_archives set status='verified',checksum=lower(p_data->>'checksum'),
    archive_size_bytes=nullif(p_data->>'archive_size_bytes','')::bigint,
    dataset_fingerprint=ar.begin_fingerprint,
    verified_at=clock_timestamp(),verified_by=a.id where id=ar.id returning * into ar;
  end if;
  -- A failed run must not leave the year frozen for ever. The freeze is released
  -- only if nothing else is holding it: another verified archive of the same year
  -- is still waiting to be purged and its freeze must stand.
  if ar.status='failed' then perform homework_private.archive_release(ar.school_year_id);end if;
  insert into public.homework_archive_events(archive_id,actor_id,event_type,data)
   values(ar.id,a.id,'archive_'||ar.status,jsonb_build_object('media_total',total,'media_reported',reported,'media_matched',matched,'failure_reason',ar.failure_reason));
  return to_jsonb(ar);

 elsif p_action='confirm_download' then
  -- RB-708 step 3, made checkable. The Admin re-opens the file they saved; the
  -- viewer recomputes the fingerprint from that file and posts it here. A ticked
  -- box proves nothing about a download that was interrupted (EC-703); a matching
  -- fingerprint proves the file exists, is readable and is this archive.
  select * into ar from public.homework_archives where id=(p_data->>'archive_id')::uuid for update;
  if ar.id is null or ar.status<>'verified' then raise exception 'Chỉ xác nhận được bản lưu đã kiểm tra đạt';end if;
  if lower(coalesce(p_data->>'checksum','')) is distinct from ar.checksum then
   insert into public.homework_archive_events(archive_id,actor_id,event_type,data)
    values(ar.id,a.id,'archive_download_mismatch','{}'::jsonb);
   raise exception 'Tệp vừa mở không khớp với bản lưu này';
  end if;
  update public.homework_archives set download_confirmed_at=clock_timestamp(),download_confirmed_by=a.id
   where id=ar.id returning * into ar;
  insert into public.homework_archive_events(archive_id,actor_id,event_type,data)
   values(ar.id,a.id,'archive_download_confirmed','{}'::jsonb);
  return to_jsonb(ar);

 elsif p_action='set_read_only' then
  -- RB-711: only after a verified archive exists for that year.
  select * into ar from public.homework_archives where id=(p_data->>'archive_id')::uuid;
  if ar.id is null or ar.status not in('verified','purging','purged') then raise exception 'Cần một bản lưu đã kiểm tra đạt trước khi khoá năm học';end if;
  update public.school_years set archive_state='archived_read_only' where id=ar.school_year_id;
  insert into public.homework_archive_events(archive_id,actor_id,event_type,data)
   values(ar.id,a.id,'year_read_only',jsonb_build_object('school_year_id',ar.school_year_id));
  return jsonb_build_object('ok',true,'school_year_id',ar.school_year_id,'archive_state','archived_read_only');

 elsif p_action='abandon' then
  -- A run whose tab was closed leaves the year frozen. Admin can end it, which
  -- marks the archive failed and releases the freeze if nothing else holds it.
  select * into ar from public.homework_archives where id=(p_data->>'archive_id')::uuid for update;
  if ar.id is null or ar.status<>'building' then raise exception 'Chỉ huỷ được bản lưu đang đóng gói dở';end if;
  update public.homework_archives set status='failed',failure_reason='abandoned' where id=ar.id returning * into ar;
  perform homework_private.archive_release(ar.school_year_id);
  insert into public.homework_archive_events(archive_id,actor_id,event_type,data)
   values(ar.id,a.id,'archive_abandoned','{}'::jsonb);
  return to_jsonb(ar);

 elsif p_action='purge_begin' then
  select * into ar from public.homework_archives where id=(p_data->>'archive_id')::uuid for update;
  if ar.id is null then raise exception 'Không tìm thấy bản lưu';end if;
  if ar.status='purging' then return jsonb_build_object('ok',true,'resumed',true)||to_jsonb(ar);end if;
  -- BR-702/AC-707.
  if ar.status<>'verified' then raise exception 'Chỉ xoá được sau khi bản lưu đạt kiểm tra' using errcode='42501';end if;
  -- AC-708.
  if ar.download_confirmed_at is null then raise exception 'Hãy mở lại tệp đã tải để xác nhận trước khi xoá' using errcode='42501';end if;
  if coalesce(trim(p_data->>'reason'),'')='' then raise exception 'Cần nêu lý do xoá';end if;
  if coalesce((p_data->>'confirm_irreversible')::boolean,false) is not true then raise exception 'Cần xác nhận hiểu rằng thao tác này không hoàn tác được';end if;
  select * into y from public.school_years where id=ar.school_year_id for update;
  -- AC-723/EC-712.
  if y.is_active then raise exception 'Không xoá dữ liệu của năm học đang hoạt động' using errcode='42501';end if;
  -- The freeze must still be on. If someone released the year back to active, the
  -- data has been writable since, and this archive can no longer speak for it.
  if y.archive_state='active' then raise exception 'Năm học đã được mở khoá ghi sau khi đóng gói. Hãy đóng gói lại trước khi xoá.' using errcode='42501';end if;
  -- And the decisive check: does the year still hash to what was archived? Counts
  -- cannot see an update, and this runs inside the same statement that flips the
  -- archive to 'purging', so nothing can slip in between the check and the purge.
  -- No audit row is written for a refusal: raising rolls back the insert that
  -- would record it. The refusal reaches the Admin as the error, the archive
  -- stays 'verified', and nothing was touched — which is the state that matters.
  if ar.dataset_fingerprint is distinct from homework_private.archive_fingerprint(ar.school_year_id) then
   raise exception 'Dữ liệu năm học đã thay đổi so với bản lưu này. Hãy đóng gói lại trước khi xoá.' using errcode='42501';
  end if;
  update public.homework_archives set status='purging',purge_reason=trim(p_data->>'reason'),purge_started_at=clock_timestamp()
   where id=ar.id returning * into ar;
  insert into public.homework_archive_steps(archive_id,step,seq)
  values(ar.id,'reactions',1),(ar.id,'reminders',2),(ar.id,'duplicate_reviews',3),
   (ar.id,'reports',4),(ar.id,'corrections',5),(ar.id,'moderation_events',6),(ar.id,'notifications',7),
   (ar.id,'contribution_events',8),(ar.id,'notices',9),
   (ar.id,'english_group_members',10),(ar.id,'english_groups',11),(ar.id,'class_subjects',12),
   -- Last on purpose. The FEAT-006 worker drops an attachment row only once
   -- nothing references it, so queuing before the notices are gone would make
   -- the first worker pass defer every job. Queuing here means the objects are
   -- already unreferenced and the first pass can finish them.
   (ar.id,'media_enqueue',13)
  on conflict do nothing;
  insert into public.homework_archive_events(archive_id,actor_id,event_type,data)
   values(ar.id,a.id,'purge_begin',jsonb_build_object('reason',ar.purge_reason,'school_year_id',ar.school_year_id));
  return to_jsonb(ar)||jsonb_build_object('steps',(select count(*) from public.homework_archive_steps where archive_id=ar.id));

 elsif p_action='purge_step' then
  select * into ar from public.homework_archives where id=(p_data->>'archive_id')::uuid for update;
  if ar.id is null or ar.status<>'purging' then raise exception 'Bản lưu không đang trong quá trình xoá';end if;
  year_id:=ar.school_year_id;
  select array_agg(id) into cls from public.classes where school_year_id=year_id;
  cls:=coalesce(cls,'{}'::uuid[]);
  select * into st from public.homework_archive_steps where archive_id=ar.id and state<>'done' order by seq limit 1;
  if st is null then
   update public.homework_archives set status='purged',purged_at=clock_timestamp(),purged_by=a.id where id=ar.id returning * into ar;
   -- A purged year is a historical record for good. Promoting it from the
   -- temporary run freeze to the permanent state says so, and keeps the year out
   -- of the one path that could otherwise hand it back as writable.
   update public.school_years set archive_state='archived_read_only' where id=ar.school_year_id;
   insert into public.homework_archive_events(archive_id,actor_id,event_type,data)
    values(ar.id,a.id,'purge_complete','{}'::jsonb);
   return to_jsonb(ar)||jsonb_build_object('done',true);
  end if;
  update public.homework_archive_steps set state='running',started_at=coalesce(started_at,clock_timestamp())
   where archive_id=ar.id and step=st.step;
  -- The one key that opens the hard freeze, scoped to this transaction and to
  -- this archive. Set after the gates above have all passed.
  perform set_config('homework.archive_purge',ar.id::text,true);
  -- Every branch is scoped by the year and is idempotent, so a step interrupted
  -- halfway can simply be run again (EC-705/AC-722).
  if st.step='reactions' then
   with d as (delete from public.homework_notice_reactions where notice_id in(select id from public.homework_notices where school_year_id=year_id) returning 1) select count(*) into removed from d;
  elsif st.step='reminders' then
   with d as (delete from public.homework_notice_reminders where notice_id in(select id from public.homework_notices where school_year_id=year_id) returning 1) select count(*) into removed from d;
  elsif st.step='duplicate_reviews' then
   with d as (delete from public.homework_duplicate_reviews where notice_id in(select id from public.homework_notices where school_year_id=year_id) returning 1) select count(*) into removed from d;
  elsif st.step='reports' then
   with d as (delete from public.homework_reports where notice_id in(select id from public.homework_notices where school_year_id=year_id) returning 1) select count(*) into removed from d;
  elsif st.step='corrections' then
   with d as (delete from public.homework_corrections where notice_id in(select id from public.homework_notices where school_year_id=year_id) returning 1) select count(*) into removed from d;
  elsif st.step='moderation_events' then
   with d as (delete from public.homework_moderation_events where class_id=any(cls) returning 1) select count(*) into removed from d;
  elsif st.step='notifications' then
   with d as (delete from public.homework_notifications where class_id=any(cls) returning 1) select count(*) into removed from d;
  elsif st.step='contribution_events' then
   with d as (delete from public.homework_contribution_events where class_id=any(cls) returning 1) select count(*) into removed from d;
  elsif st.step='notices' then
   -- Cascades homework_notice_media and homework_media_history, which is what
   -- lets the FEAT-006 worker finally drop the attachment rows once R2 confirms.
   update public.homework_notices set duplicate_of=null,duplicate_tombstone_id=null where school_year_id=year_id;
   with d as (delete from public.homework_notices where school_year_id=year_id returning 1) select count(*) into removed from d;
  elsif st.step='english_group_members' then
   with d as (delete from public.english_group_members where school_year_id=year_id returning 1) select count(*) into removed from d;
  elsif st.step='english_groups' then
   -- Groups a surviving tombstone still points at are kept; see DEC-091.
   with d as (delete from public.english_groups where school_year_id=year_id
     and id not in(select english_group_id from public.homework_tombstones where english_group_id is not null) returning 1)
   select count(*) into removed from d;
  elsif st.step='class_subjects' then
   -- Per-class rows only. grade_subject_catalog is shared across years and is
   -- never touched (RB-714/EC-706/AC-711). Subjects a surviving tombstone points
   -- at are kept too: FEAT-002 makes the tombstone permanent and undeletable, so
   -- its foreign keys must keep resolving (DEC-091).
   with d as (delete from public.class_subjects where class_id=any(cls)
     and id not in(select subject_id from public.homework_tombstones where subject_id is not null) returning 1)
   select count(*) into removed from d;
  elsif st.step='media_enqueue' then
   -- RB-713: media leaves R2 only through the FEAT-006 outbox, and only now,
   -- after the archive is verified. FEAT-007 adds no deletion path of its own.
   -- Deleting the notices above already queued the referenced objects through
   -- the FEAT-006 trigger; this sweeps up anything the year owns that no
   -- surviving row pointed at, and re-labels every job with the purge reason.
   select count(*) into removed from public.homework_attachments where school_year_id=year_id;
   perform homework_private.media_enqueue(m.id,'year_purge')
    from public.homework_attachments m where m.school_year_id=year_id;
  else raise exception 'Bước xoá không hợp lệ: %',st.step;
  end if;
  update public.homework_archive_steps set state='done',rows_removed=removed,finished_at=clock_timestamp()
   where archive_id=ar.id and step=st.step;
  insert into public.homework_archive_events(archive_id,actor_id,event_type,data)
   values(ar.id,a.id,'purge_step',jsonb_build_object('step',st.step,'rows_removed',removed));
  return jsonb_build_object('done',false,'step',st.step,'rows_removed',removed,
   'remaining',(select count(*) from public.homework_archive_steps where archive_id=ar.id and state<>'done'),
   'steps',(select coalesce(jsonb_agg(to_jsonb(s) order by s.seq),'[]'::jsonb) from public.homework_archive_steps s where s.archive_id=ar.id));

 elsif p_action='purge_status' then
  select * into ar from public.homework_archives where id=(p_data->>'archive_id')::uuid;
  if ar.id is null then raise exception 'Không tìm thấy bản lưu';end if;
  return to_jsonb(ar)||jsonb_build_object(
   'steps',(select coalesce(jsonb_agg(to_jsonb(s) order by s.seq),'[]'::jsonb) from public.homework_archive_steps s where s.archive_id=ar.id),
   'media_pending',(select count(*) from public.homework_attachments where school_year_id=ar.school_year_id));
 end if;
 raise exception 'Thao tác kho lưu trữ không hợp lệ';
end $$;

-- Export is a separate function purely for readability: it is one big paged
-- reader and has no state machine of its own. Rows go out as to_jsonb(row) so the
-- archive follows the real schema, except profiles, which is whitelisted — an
-- archive must carry the roster, not whatever columns Supabase auth grows next
-- (BR-711/AC-729).
create function public.homework_archive_export(p_archive uuid,p_entity text,p_after text default null,p_limit integer default 500)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare a public.profiles; ar public.homework_archives; rows_out jsonb; n integer:=least(coalesce(p_limit,500),1000); year_id uuid; cls uuid[];
begin
 a:=homework_private.archive_admin();
 select * into ar from public.homework_archives where id=p_archive;
 if ar.id is null then raise exception 'Không tìm thấy bản lưu';end if;
 year_id:=ar.school_year_id;
 select coalesce(array_agg(id),'{}'::uuid[]) into cls from public.classes where school_year_id=year_id;
 if p_entity='classes' then
  select jsonb_agg(to_jsonb(c) order by c.id) into rows_out from (select * from public.classes where school_year_id=year_id and (p_after is null or id>p_after::uuid) order by id limit n) c;
 elsif p_entity='students' then
  select jsonb_agg(jsonb_build_object('id',p.id,'full_name',p.full_name,'role',p.role,'active',p.active,'class_id',p.class_id,'deleted_at',p.deleted_at) order by p.id) into rows_out
   from (select * from public.profiles where class_id=any(cls) and (p_after is null or id>p_after::uuid) order by id limit n) p;
 elsif p_entity='subjects' then
  -- The shared catalog rows this year referenced. Exported for readability of the
  -- archive; never purged, because other years still use them.
  select jsonb_agg(to_jsonb(g) order by g.id) into rows_out from (
   select * from public.grade_subject_catalog where id in(select catalog_subject_id from public.class_subjects where class_id=any(cls))
    and (p_after is null or id>p_after::uuid) order by id limit n) g;
 elsif p_entity='class_subjects' then
  select jsonb_agg(to_jsonb(s) order by s.id) into rows_out from (select * from public.class_subjects where class_id=any(cls) and (p_after is null or id>p_after::uuid) order by id limit n) s;
 elsif p_entity='english_groups' then
  select jsonb_agg(to_jsonb(g) order by g.id) into rows_out from (select * from public.english_groups where school_year_id=year_id and (p_after is null or id>p_after::uuid) order by id limit n) g;
 elsif p_entity='english_group_memberships' then
  select jsonb_agg(to_jsonb(m) order by m.id) into rows_out from (select * from public.english_group_members where school_year_id=year_id and (p_after is null or id>p_after::uuid) order by id limit n) m;
 elsif p_entity='homework_notices' then
  select jsonb_agg(to_jsonb(x) order by x.id) into rows_out from (select * from public.homework_notices where school_year_id=year_id and (p_after is null or id>p_after::uuid) order by id limit n) x;
 elsif p_entity='homework_reactions' then
  select jsonb_agg(to_jsonb(x) order by x.notice_id,x.user_id) into rows_out from (
   select * from public.homework_notice_reactions where notice_id in(select id from public.homework_notices where school_year_id=year_id)
    and (p_after is null or (notice_id::text||':'||user_id::text)>p_after) order by notice_id,user_id limit n) x;
 elsif p_entity='homework_reminders' then
  select jsonb_agg(to_jsonb(x) order by x.id) into rows_out from (select * from public.homework_notice_reminders where notice_id in(select id from public.homework_notices where school_year_id=year_id) and (p_after is null or id>p_after::uuid) order by id limit n) x;
 elsif p_entity='homework_reports' then
  select jsonb_agg(to_jsonb(x) order by x.id) into rows_out from (select * from public.homework_reports where notice_id in(select id from public.homework_notices where school_year_id=year_id) and (p_after is null or id>p_after::uuid) order by id limit n) x;
 elsif p_entity='homework_corrections' then
  select jsonb_agg(to_jsonb(x) order by x.id) into rows_out from (select * from public.homework_corrections where notice_id in(select id from public.homework_notices where school_year_id=year_id) and (p_after is null or id>p_after::uuid) order by id limit n) x;
 elsif p_entity='homework_revisions' then
  select jsonb_agg(to_jsonb(x) order by x.correction_id,x.round) into rows_out from (
   select * from public.homework_correction_rounds where correction_id in(
     select id from public.homework_corrections where notice_id in(select id from public.homework_notices where school_year_id=year_id))
    and (p_after is null or (correction_id::text||':'||round::text)>p_after) order by correction_id,round limit n) x;
 elsif p_entity='homework_duplicate_reviews' then
  select jsonb_agg(to_jsonb(x) order by x.id) into rows_out from (select * from public.homework_duplicate_reviews where notice_id in(select id from public.homework_notices where school_year_id=year_id) and (p_after is null or id>p_after::uuid) order by id limit n) x;
 elsif p_entity='homework_tombstones' then
  -- EC-713: the hard-delete record is kept as FEAT-002 wrote it. The archive
  -- preserves the redaction rather than reconstructing what was removed.
  select jsonb_agg(to_jsonb(x) order by x.notice_id) into rows_out from (select * from public.homework_tombstones where class_id=any(cls) and (p_after is null or notice_id>p_after::uuid) order by notice_id limit n) x;
 elsif p_entity='audit' then
  select jsonb_agg(to_jsonb(x) order by x.id) into rows_out from (select * from public.homework_contribution_events where class_id=any(cls) and (p_after is null or id>p_after::uuid) order by id limit n) x;
 elsif p_entity='moderation' then
  select jsonb_agg(to_jsonb(x) order by x.id) into rows_out from (select * from public.homework_moderation_events where class_id=any(cls) and (p_after is null or id>p_after::uuid) order by id limit n) x;
 elsif p_entity='media_index' then
  select jsonb_agg(jsonb_build_object('attachment_id',m.attachment_id,'object_key',m.object_key,'size_bytes',m.size_bytes,
    'archive_path',m.archive_path,
    'notice_id',(select notice_id from public.homework_notice_media where attachment_id=m.attachment_id),
    'history',(select coalesce(jsonb_agg(jsonb_build_object('notice_id',h.notice_id,'revision',h.revision)),'[]'::jsonb) from public.homework_media_history h where h.attachment_id=m.attachment_id),
    'correction_round',(select coalesce(jsonb_agg(jsonb_build_object('correction_id',r.correction_id,'round',r.round)),'[]'::jsonb) from public.homework_correction_rounds r where r.attachment_id=m.attachment_id)) order by m.attachment_id) into rows_out
   from (select * from public.homework_archive_media where archive_id=ar.id and (p_after is null or attachment_id>p_after::uuid) order by attachment_id limit n) m;
 else raise exception 'Thực thể không hợp lệ: %',p_entity;
 end if;
 return jsonb_build_object('entity',p_entity,'rows',coalesce(rows_out,'[]'::jsonb));
end $$;

-- ── RB-711 read-only enforcement ─────────────────────────────────────────────
-- The dispatchers are wrapped, not rewritten, exactly as FEAT-008 wrapped
-- FEAT-006. Only the guard is new; a test asserts the wrapped bodies are still
-- byte-identical to migration 11.
alter function public.homework_api(text,jsonb) set schema homework_private;
alter function homework_private.homework_api(text,jsonb) rename to api_v8;
alter function public.homework_media(text,jsonb) set schema homework_private;
alter function homework_private.homework_media(text,jsonb) rename to media_v8;

create function public.homework_api(p_action text,p_data jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare c uuid:=nullif(p_data->>'class_id','')::uuid;begin
 -- An allowlist, not a blocklist: a new mutating action added later is withheld
 -- by default rather than silently permitted against an archived year.
 if c is not null and p_action not in('load','inbox','context','catalog_list','oversight')
  and homework_private.archive_readonly(c) then
  raise exception 'Năm học đã đóng gói và chỉ còn xem được. Dữ liệu cũ nằm trong bản lưu đã tải về.' using errcode='42501';
 end if;
 return homework_private.api_v8(p_action,p_data);
end $$;

create function public.homework_media(p_action text,p_data jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare c uuid:=nullif(p_data->>'class_id','')::uuid;begin
 if c is not null and p_action<>'read' and homework_private.archive_readonly(c) then
  raise exception 'Năm học đã đóng gói nên không nhận ảnh mới.' using errcode='42501';
 end if;
 return homework_private.media_v8(p_action,p_data);
end $$;

revoke all on function public.homework_api(text,jsonb),public.homework_media(text,jsonb) from public,anon;
grant execute on function public.homework_api(text,jsonb),public.homework_media(text,jsonb) to authenticated;
revoke all on function public.homework_archive(text,jsonb),public.homework_archive_export(uuid,text,text,integer) from public,anon;
grant execute on function public.homework_archive(text,jsonb),public.homework_archive_export(uuid,text,text,integer) to authenticated;

commit;
