-- FEAT-008, apply after FEAT-006 migration 10. Transactional, no existing data rewrite.
-- Measures Supabase DB and Cloudflare R2 usage, warns at 70/85%, and at 95%
-- withholds only non-essential writes. It adds no deletion path of its own:
-- cleanup_pending re-uses the FEAT-006 outbox, so CR-005 and DEC-081 hold.
begin;

-- Capacity is deployment configuration, never a provider constant. NULL means
-- "not configured yet": unknown capacity must not be read as 0% or as 100%,
-- so it yields no percentage and no protection at all.
create table public.homework_storage_capacity (
 provider text primary key check(provider in('database','r2')),
 configured_bytes bigint check(configured_bytes>0), note text,
 updated_at timestamptz not null default clock_timestamp(), updated_by uuid references public.profiles
);
insert into public.homework_storage_capacity(provider,note)
values('database','Đặt theo plan Supabase đang dùng.'),('r2','Đặt theo plan Cloudflare R2 đang dùng.');

-- One current row per provider. Two independent numbers are kept side by side:
-- metadata_bytes is what the app itself accounts for and is always available;
-- provider_bytes is what the provider API reports and may be absent. Keeping
-- them in separate columns means a refresh of one can never clobber the other.
create table public.homework_storage_usage (
 provider text primary key check(provider in('database','r2')),
 metadata_bytes bigint not null default 0, active_bytes bigint not null default 0,
 pending_bytes bigint not null default 0, deleting_bytes bigint not null default 0,
 media_count integer not null default 0,
 provider_bytes bigint, provider_measured_at timestamptz,
 measured_at timestamptz not null default clock_timestamp()
);

-- homework_contribution_events.class_id is NOT NULL; storage actions are
-- system-wide and have no class, so they need their own audit table.
create table public.homework_storage_events (
 id uuid primary key default gen_random_uuid(), actor_id uuid references public.profiles,
 event_type text not null, before_data jsonb, after_data jsonb,
 created_at timestamptz not null default clock_timestamp()
);
create index homework_storage_events_time on public.homework_storage_events(created_at desc);

alter table public.homework_storage_capacity enable row level security;
alter table public.homework_storage_usage enable row level security;
alter table public.homework_storage_events enable row level security;
revoke all on public.homework_storage_capacity,public.homework_storage_usage,public.homework_storage_events from public,anon,authenticated;

-- Storage administration is system-wide, so it cannot use homework_private.actor
-- (which resolves a role inside one class). Same source of truth: public.profiles.
create function homework_private.storage_admin() returns public.profiles language plpgsql security definer set search_path=pg_catalog,public as $$
declare a public.profiles;begin
 select * into a from public.profiles where id=auth.uid() and active and deleted_at is null;
 if a.id is null or a.role::text<>'admin' then raise exception 'Chỉ Admin xem được dung lượng hệ thống' using errcode='42501';end if;
 return a;
end $$;

create function homework_private.storage_measure() returns void language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 insert into public.homework_storage_usage(provider,metadata_bytes,measured_at)
 values('database',pg_database_size(current_database()),clock_timestamp())
 on conflict(provider) do update set metadata_bytes=excluded.metadata_bytes,measured_at=excluded.measured_at;
 -- 'deleting' rows are queued for purge but their objects are still in the
 -- bucket: media_enqueue only writes an outbox job, with safe_after minutes in
 -- the future, and the row disappears only when the worker confirms removal.
 -- Excluding them made queuing a cleanup look like space had already been
 -- freed, which is how a queued cleanup could unlock uploads while R2 was still
 -- full. They are counted as used and reported separately so Admin can see how
 -- much is on its way out.
 insert into public.homework_storage_usage(provider,metadata_bytes,active_bytes,pending_bytes,deleting_bytes,media_count,measured_at)
 select 'r2',coalesce(sum(size_bytes),0),
  coalesce(sum(size_bytes) filter(where status='active'),0),
  coalesce(sum(size_bytes) filter(where status='pending'),0),
  coalesce(sum(size_bytes) filter(where status='deleting'),0),
  count(*) filter(where status in('active','pending')),clock_timestamp()
 from public.homework_attachments
 on conflict(provider) do update set metadata_bytes=excluded.metadata_bytes,active_bytes=excluded.active_bytes,
  pending_bytes=excluded.pending_bytes,deleting_bytes=excluded.deleting_bytes,
  media_count=excluded.media_count,measured_at=excluded.measured_at;
end $$;

-- Derived on every read. There is no stored protection flag to get stuck on, so
-- "Admin cannot switch protection off while usage is still >=95%" is true by
-- construction instead of by guarding an update path.
create function homework_private.storage_state() returns jsonb language sql stable security definer set search_path=pg_catalog,public as $$
 with p as (
  select c.provider,c.configured_bytes,c.note,
   u.metadata_bytes,u.active_bytes,u.pending_bytes,u.deleting_bytes,u.media_count,
   u.provider_bytes,u.provider_measured_at,u.measured_at,
   u.provider is not null measured,
   -- A provider reading is authoritative only while it is recent. Preferring any
   -- non-null provider_bytes forever meant one old R2 answer kept driving the
   -- percentage: a later in-database measurement showing 97% could not raise the
   -- lock, and an old 97% could not be lowered by a cleanup. Six hours is well
   -- inside any sane refresh cadence, and outside it the reading simply stops
   -- counting rather than being trusted or deleted.
   case when u.provider_measured_at>clock_timestamp()-interval '6 hours' then u.provider_bytes end fresh_provider
  from public.homework_storage_capacity c left join public.homework_storage_usage u on u.provider=c.provider
 ), e as (
  -- metadata_bytes is the application's own accounting and always counts: it
  -- includes pending uploads the provider has not seen yet, so a provider figure
  -- that predates them must not pull the total back down. greatest() ignores
  -- NULL, so a stale or absent provider reading leaves metadata alone.
  select p.*, greatest(fresh_provider,metadata_bytes) total_bytes,
   provider_bytes is not null and fresh_provider is null provider_stale,
   case when not measured then 'none'
    when fresh_provider is not null and fresh_provider>=coalesce(metadata_bytes,0) then 'provider'
    else 'metadata' end source
  from p
 ), q as (
  select e.*,
   case when configured_bytes is null or total_bytes is null then null
    else round(total_bytes::numeric*100/configured_bytes,2) end percent,
   -- A snapshot nobody refreshed is not evidence of health; it is reported as
   -- stale so Admin can see the measurement stopped, but it is never escalated
   -- into protection by itself.
   measured_at is null or measured_at<clock_timestamp()-interval '24 hours' stale
  from e
 ), l as (
  select q.*, case
   when configured_bytes is null then 'unconfigured'
   when percent is null then 'unknown'
   when percent>=95 then 'critical' when percent>=85 then 'warning'
   when percent>=70 then 'info' else 'normal' end level
  from q
 )
 select jsonb_build_object(
  'providers',(select jsonb_object_agg(provider,to_jsonb(l)-'provider') from l),
  'flags',jsonb_build_object(
   'protection_mode',(select coalesce(bool_or(level='critical'),false) from l where provider='database'),
   'r2_upload_locked',(select coalesce(bool_or(level='critical'),false) from l where provider='r2')),
  'measured_at',(select max(measured_at) from l))
$$;

-- F8-RB-004: a withheld action must say it is a capacity hold. 53100 (disk_full)
-- is a resource error, distinct from the 42501 this codebase raises for
-- permission, so the client never has to guess from message text.
create function homework_private.storage_guard(p_kind text) returns void language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare f jsonb:=homework_private.storage_state()->'flags';begin
 if coalesce((f->>'protection_mode')::boolean,false) then
  raise exception 'Hệ thống đang ở chế độ bảo vệ dung lượng. Bài dạng chữ, chỉnh sửa và báo cáo vẫn hoạt động.' using errcode='53100';
 end if;
 if p_kind='media' and coalesce((f->>'r2_upload_locked')::boolean,false) then
  raise exception 'Kho ảnh đã gần đầy nên tạm khóa ảnh mới. Bạn vẫn đăng được bài dạng chữ.' using errcode='53100';
 end if;
end $$;

create function public.homework_storage(p_action text,p_data jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare a public.profiles; before_bytes bigint; queued integer:=0; m record; target text;
begin
 a:=homework_private.storage_admin();
 if p_action='status' then
  return homework_private.storage_state()||jsonb_build_object('candidates',(
   select coalesce(jsonb_agg(x order by x->>'school_year_id'),'[]'::jsonb) from (
    select jsonb_build_object('school_year_id',at.school_year_id,'media_count',count(*),
     'media_bytes',coalesce(sum(at.size_bytes),0),
     'notice_count',(select count(distinct nm.notice_id) from public.homework_notice_media nm
       join public.homework_attachments a2 on a2.id=nm.attachment_id where a2.school_year_id=at.school_year_id),
     -- FEAT-007 owns archive state; until it exists nothing has been archived.
     'archived',false) x
    from public.homework_attachments at where at.status='active' group by at.school_year_id) c));
 elsif p_action='refresh' then
  perform homework_private.storage_measure();
  return homework_private.storage_state();
 elsif p_action='set_capacity' then
  target:=p_data->>'provider';
  if target not in('database','r2') then raise exception 'Nhà cung cấp không hợp lệ';end if;
  select configured_bytes into before_bytes from public.homework_storage_capacity where provider=target;
  update public.homework_storage_capacity
   set configured_bytes=nullif(p_data->>'configured_bytes','')::bigint,
    note=coalesce(nullif(p_data->>'note',''),note),updated_at=clock_timestamp(),updated_by=a.id
   where provider=target;
  insert into public.homework_storage_events(actor_id,event_type,before_data,after_data)
   values(a.id,'storage_capacity',jsonb_build_object('provider',target,'configured_bytes',before_bytes),
    jsonb_build_object('provider',target,'configured_bytes',nullif(p_data->>'configured_bytes','')::bigint));
  return homework_private.storage_state();
 elsif p_action='cleanup_pending' then
  -- Only pending uploads past the 24h window (DEC-081 case 2). Active and
  -- referenced media are untouched; the FEAT-006 outbox does the actual purge.
  for m in select id from public.homework_attachments
   where status='pending' and expires_at<=clock_timestamp()
   and coalesce(grant_until,clock_timestamp())<=clock_timestamp() loop
   perform homework_private.media_enqueue(m.id,'storage_cleanup');queued:=queued+1;
  end loop;
  -- Queuing a cleanup is not evidence that R2 has shrunk. media_enqueue only
  -- writes an outbox job; the objects are deleted later, asynchronously, and may
  -- fail. RC2 cleared the provider reading here, which let one queued pending
  -- attachment unlock uploads while the bucket could still be over 95% — and
  -- threw away the only evidence about untracked objects the app cannot see.
  -- The reading is left alone: it expires on its own after six hours, and Admin
  -- can ask R2 for a fresh figure at any time. Staying locked a little longer is
  -- the safe direction; unlocking on a promise is not.
  perform homework_private.storage_measure();
  insert into public.homework_storage_events(actor_id,event_type,after_data)
   values(a.id,'storage_cleanup',jsonb_build_object('queued',queued));
  return homework_private.storage_state()||jsonb_build_object('queued',queued);
 end if;
 raise exception 'Thao tác dung lượng không hợp lệ';
end $$;

create function public.homework_storage_service(p_action text,p_data jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if p_action='record_usage' then
  perform homework_private.storage_measure();
  update public.homework_storage_usage
   set provider_bytes=nullif(p_data->>'provider_bytes','')::bigint,provider_measured_at=clock_timestamp()
   where provider=coalesce(nullif(p_data->>'provider',''),'r2');
  return homework_private.storage_state();
 elsif p_action='state' then
  return homework_private.storage_state();
 elsif p_action='measure' then
  perform homework_private.storage_measure();
  return homework_private.storage_state();
 end if;
 raise exception 'Thao tác dung lượng không hợp lệ';
end $$;

-- Wrap, do not rewrite. The FEAT-006 bodies move behind the guard unchanged so
-- the read-authorization logic reviewed in RC2 is not re-opened.
alter function public.homework_api(text,jsonb) set schema homework_private;
alter function homework_private.homework_api(text,jsonb) rename to api_v6;
create function public.homework_api(p_action text,p_data jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 -- Removing a reaction deletes a row and releases space, so only adding one is
 -- withheld. Clearing an image (attachment_id present but null) is allowed for
 -- the same reason.
 if p_action='heart' and coalesce((p_data->>'liked')::boolean,false) then
  perform homework_private.storage_guard('reaction');
 elsif nullif(p_data->>'attachment_id','') is not null then
  perform homework_private.storage_guard('media');
 end if;
 return homework_private.api_v6(p_action,p_data);
end $$;

alter function public.homework_media(text,jsonb) set schema homework_private;
alter function homework_private.homework_media(text,jsonb) rename to media_v6;
create function public.homework_media(p_action text,p_data jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 -- Only new uploads are withheld. 'ticket', 'seal', 'read' and 'cancel' keep
 -- working so an upload already in flight can finish or be cleaned up instead
 -- of being stranded as a pending row nobody can resolve.
 if p_action='prepare' then perform homework_private.storage_guard('media');end if;
 return homework_private.media_v6(p_action,p_data);
end $$;

revoke all on all functions in schema homework_private from public,anon,authenticated;
revoke all on function public.homework_storage(text,jsonb),public.homework_storage_service(text,jsonb),public.homework_api(text,jsonb),public.homework_media(text,jsonb) from public,anon,authenticated;
grant execute on function public.homework_storage(text,jsonb),public.homework_api(text,jsonb),public.homework_media(text,jsonb) to authenticated;
grant execute on function public.homework_storage_service(text,jsonb) to service_role;
commit;
