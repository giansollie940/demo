-- ===========================================================================
-- Baseline for the "Báo bài: hạn không được ở quá khứ" harness.
--
-- Read from production (project tu-hoc, read-only catalog queries, 2026-11-06),
-- not written from memory. What is copied verbatim and what is a stub is marked
-- on every object, because a harness is only as trustworthy as the line between
-- those two.
--
--   VERBATIM (function bodies; md5 of the CRLF-normalised prosrc is asserted by
--   the test suite against the values measured on production):
--     homework_private.validate_revision      6416e306c0839044fe47a2c327240cab
--     homework_private.apply_correction       3e1b569a61be546f839f17d259f6d3dd
--     homework_private.archive_guard          766faa5f53f76ef2130874279c5cb341
--     homework_private.archive_guard_years    2dbefbcac28ddc75c73ad8ca038621b2
--     homework_private.archive_frozen         0eb454c4040140eaf1aa3e35be1207f6
--     homework_private.deletion_attribution   526a8fdfe99ad7f2ea949b7880cbc33a
--
--   VERBATIM (DDL): public.homework_notices — every column, default and
--   constraint; its two BEFORE ROW triggers with production's names, so the
--   firing order (alphabetical) is the real one.
--
--   STUB: tables that the functions above merely *reference* (columns reduced
--   to what is referenced), and homework_private.audit / card, which
--   apply_correction calls after the UPDATE this feature cares about.
--
--   ACL: homework_notices has RLS on, no policies, and table grants only for
--   postgres and service_role — so every client write goes through the
--   SECURITY DEFINER dispatcher, and the table trigger is the one boundary
--   every path crosses. homework_private has USAGE for postgres only.
-- ===========================================================================

create role anon;
create role authenticated;
create role service_role bypassrls;

create schema auth;
create function auth.uid() returns uuid language sql stable as
  $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;

create type public.app_role as enum ('student','monitor','teacher','admin');

create table public.school_years (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  start_date date not null,
  end_date date not null,
  is_active boolean default false not null,
  created_at timestamptz default now() not null,
  archive_state text default 'active' not null
    check (archive_state in ('active','archiving','archived_read_only'))
);

create table public.classes (
  id uuid default gen_random_uuid() primary key,
  school_year_id uuid not null references public.school_years(id),
  code text not null,
  name text not null,
  active boolean default true not null,
  created_by uuid,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  grade smallint not null
);

create table public.profiles (
  id uuid primary key,
  student_code text,
  full_name text not null,
  email text,
  role public.app_role default 'student' not null,
  class_name text default '10A1',
  active boolean default true not null,
  created_at timestamptz default now() not null,
  class_id uuid,
  deleted_at timestamptz,
  avatar_path text
);

create table public.class_subjects (
  id uuid default gen_random_uuid() not null,
  class_id uuid not null references public.classes(id),
  name text not null,
  short_name text default '' not null,
  icon text default '📚' not null,
  sort_order integer default 0 not null,
  is_english boolean default false not null,
  is_active boolean default true not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  catalog_subject_id uuid not null default gen_random_uuid(),
  primary key (id),
  unique (id, class_id)
);

create table public.english_groups (
  id uuid default gen_random_uuid() not null,
  class_id uuid not null references public.classes(id),
  school_year_id uuid not null,
  name text not null,
  is_active boolean default true not null,
  created_at timestamptz default now() not null,
  primary key (id),
  unique (id, class_id)
);

create table public.english_group_members (
  id uuid default gen_random_uuid() primary key,
  english_group_id uuid not null,
  student_id uuid not null,
  school_year_id uuid not null,
  joined_at timestamptz default now() not null,
  left_at timestamptz
);

-- STUB: only the key the notice FK points at.
create table public.homework_tombstones (notice_id uuid primary key);

-- VERBATIM DDL.
create table public.homework_notices (
  id uuid default gen_random_uuid() not null,
  class_id uuid not null,
  school_year_id uuid not null,
  subject_id uuid not null,
  english_group_id uuid,
  author_id uuid not null,
  title text not null,
  content text not null,
  due_at timestamptz not null,
  status text default 'pending_duplicate_review' not null,
  duplicate_of uuid,
  published_at timestamptz,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  pending_since timestamptz default now() not null,
  revision integer default 1 not null,
  deleted_at timestamptz,
  deleted_by uuid,
  delete_reason text,
  previous_status text,
  request_id uuid not null,
  duplicate_tombstone_id uuid,
  deleted_actor_type text
);
alter table public.homework_notices add constraint homework_notices_pkey primary key (id);
alter table public.homework_notices add constraint homework_deletion_actor check ((((status = 'deleted'::text) and (deleted_at is not null) and (deleted_actor_type is not null) and (((deleted_actor_type = 'user'::text) and (deleted_by is not null)) or ((deleted_actor_type = 'system'::text) and (deleted_by is null)))) or ((status <> 'deleted'::text) and (deleted_at is null) and (deleted_by is null) and (deleted_actor_type is null))));
alter table public.homework_notices add constraint homework_notices_author_id_fkey foreign key (author_id) references profiles(id);
alter table public.homework_notices add constraint homework_notices_author_id_request_id_key unique (author_id, request_id);
alter table public.homework_notices add constraint homework_notices_check check ((duplicate_of is distinct from id));
alter table public.homework_notices add constraint homework_notices_class_id_fkey foreign key (class_id) references classes(id);
alter table public.homework_notices add constraint homework_notices_content_check check (((length(trim(both from content)) >= 1) and (length(trim(both from content)) <= 6000)));
alter table public.homework_notices add constraint homework_notices_deleted_by_fkey foreign key (deleted_by) references profiles(id);
alter table public.homework_notices add constraint homework_notices_due_at_check check (isfinite(due_at));
alter table public.homework_notices add constraint homework_notices_duplicate_of_fkey foreign key (duplicate_of) references homework_notices(id);
alter table public.homework_notices add constraint homework_notices_duplicate_tombstone_id_fkey foreign key (duplicate_tombstone_id) references homework_tombstones(notice_id);
alter table public.homework_notices add constraint homework_notices_english_group_id_class_id_fkey foreign key (english_group_id, class_id) references english_groups(id, class_id);
alter table public.homework_notices add constraint homework_notices_school_year_id_fkey foreign key (school_year_id) references school_years(id);
alter table public.homework_notices add constraint homework_notices_status_check check ((status = any (array['published'::text, 'pending_duplicate_review'::text, 'duplicate_rejected'::text, 'replaced'::text, 'deleted'::text])));
alter table public.homework_notices add constraint homework_notices_subject_id_class_id_fkey foreign key (subject_id, class_id) references class_subjects(id, class_id);
alter table public.homework_notices add constraint homework_notices_title_check check (((length(trim(both from title)) >= 1) and (length(trim(both from title)) <= 200)));

alter table public.homework_notices enable row level security;
revoke all on public.homework_notices from public;
grant all on public.homework_notices to service_role;

-- STUB: referenced by archive_guard_years / archive_frozen only.
create table public.homework_attachments (id uuid primary key, school_year_id uuid);
create table public.homework_corrections (id uuid primary key, notice_id uuid);
create table public.homework_reports (id uuid primary key, notice_id uuid);
create table public.homework_archives (id uuid primary key, school_year_id uuid, status text);

create schema homework_private;
revoke all on schema homework_private from public;

-- ---------------------------------------------------------------------------
-- VERBATIM function bodies. CRLF line endings are production's; they are kept
-- out of this file and the md5 is taken over the LF-normalised text, which is
-- what the test asserts.
-- ---------------------------------------------------------------------------

create function homework_private.archive_frozen(p_year uuid) returns boolean
language plpgsql stable security definer set search_path = pg_catalog, public as $$
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

create function homework_private.archive_guard_years(p_row jsonb) returns uuid[]
language sql stable security definer set search_path = pg_catalog, public as $$
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

create function homework_private.archive_guard() returns trigger
language plpgsql security definer set search_path = pg_catalog, public as $$
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

create function homework_private.deletion_attribution() returns trigger
language plpgsql set search_path = pg_catalog, public as $$
begin
 if new.status<>'deleted' then new.deleted_actor_type:=null;
 elsif new.deleted_by is not null then new.deleted_actor_type:='user'; end if;
 return new;
end $$;

create function homework_private.validate_revision(n public.homework_notices, p jsonb) returns jsonb
language plpgsql set search_path = pg_catalog, public as $$
declare s public.class_subjects;g uuid:=nullif(p->>'english_group_id','')::uuid;author public.profiles;begin
 if jsonb_typeof(p) is distinct from 'object' or exists(select 1 from jsonb_object_keys(p) k where k not in('subject_id','english_group_id','title','content','due_at')) then raise exception 'Revision không hợp lệ';end if;
 if p->>'title' is null or p->>'content' is null or length(trim(p->>'title')) not between 1 and 200 or length(trim(p->>'content')) not between 1 and 6000
  or p->>'due_at' is null or not isfinite((p->>'due_at')::timestamptz) then raise exception 'Nội dung/hạn không hợp lệ';end if;
 select * into s from public.class_subjects where id=(p->>'subject_id')::uuid and class_id=n.class_id and is_active;
 if s.id is null then raise exception 'Môn không hoạt động';end if;
 select * into author from public.profiles where id=n.author_id;
 if s.is_english then
  if not exists(select 1 from public.english_groups where id=g and class_id=n.class_id and school_year_id=n.school_year_id and is_active) then raise exception 'Nhóm Tiếng Anh không hợp lệ';end if;
  if author.role::text='student' and not exists(select 1 from public.english_group_members where student_id=author.id and english_group_id=g and left_at is null) then raise exception 'Ngoài nhóm Tiếng Anh' using errcode='42501';end if;
 elsif g is not null then raise exception 'Môn này không dùng nhóm Tiếng Anh';end if;
 return jsonb_build_object('subject_id',s.id,'english_group_id',g,'title',trim(p->>'title'),'content',trim(p->>'content'),'due_at',(p->>'due_at')::timestamptz);
end $$;

-- STUB: called by apply_correction after the UPDATE.
create function homework_private.audit(c uuid, n uuid, a uuid, kind text, before_data jsonb, after_data jsonb)
returns void language sql as $$ select null::void $$;
create function homework_private.card(n public.homework_notices, a uuid)
returns jsonb language sql as $$ select to_jsonb(n) $$;

create function homework_private.apply_correction(n public.homework_notices, p jsonb, a uuid) returns jsonb
language plpgsql set search_path = pg_catalog, public as $$
declare pending boolean;fresh public.homework_notices;begin
 pending:=n.status<>'published' or (p->>'subject_id')::uuid<>n.subject_id or nullif(p->>'english_group_id','')::uuid is distinct from n.english_group_id
  or abs(extract(epoch from ((p->>'due_at')::timestamptz-n.due_at)))>=86400
  or regexp_replace(trim(p->>'title'),'\s+',' ','g')<>regexp_replace(n.title,'\s+',' ','g')
  or regexp_replace(trim(p->>'content'),'\s+',' ','g')<>regexp_replace(n.content,'\s+',' ','g');
 update public.homework_notices set subject_id=(p->>'subject_id')::uuid,english_group_id=nullif(p->>'english_group_id','')::uuid,
 title=trim(p->>'title'),content=trim(p->>'content'),due_at=(p->>'due_at')::timestamptz,
 revision=revision+1,updated_at=clock_timestamp(),pending_since=case when pending then clock_timestamp() else pending_since end,
 status=case when pending then 'pending_duplicate_review' else status end,
 duplicate_of=case when pending then null else duplicate_of end,duplicate_tombstone_id=case when pending then null else duplicate_tombstone_id end
 where id=n.id returning * into fresh;
 -- The AI edit classifier uses submit events to recover the previous revision.
 perform homework_private.audit(n.class_id,n.id,a,'submit',to_jsonb(n),to_jsonb(fresh));
 return homework_private.card(fresh,a);
end $$;

revoke all on all functions in schema homework_private from public;

create trigger homework_archive_guard before insert or delete or update on public.homework_notices
  for each row execute function homework_private.archive_guard();
create trigger homework_deletion_attribution before insert or update on public.homework_notices
  for each row execute function homework_private.deletion_attribution();
