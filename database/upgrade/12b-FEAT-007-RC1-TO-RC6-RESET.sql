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
