-- Storage change notification only. No periodic measurement, no user-content payloads.
begin;
do $$ begin
 if to_regprocedure('homework_private.storage_measure()') is null then
   raise exception 'Install FEAT-008 storage health before this upgrade';
 end if;
end $$;
create schema if not exists storage_live_private;
revoke all on schema storage_live_private from public,anon,authenticated;
create table if not exists public.storage_change_signals (
  source_table text primary key,
  changed_at timestamptz not null default clock_timestamp(),
  affects_r2 boolean not null default false
);
alter table public.storage_change_signals enable row level security;
revoke all on public.storage_change_signals from public, anon, authenticated;
grant select on public.storage_change_signals to authenticated;

create or replace function storage_live_private.is_admin() returns boolean
language sql stable security definer set search_path=pg_catalog,public as $$
  select exists(select 1 from public.profiles
    where id=auth.uid() and active and deleted_at is null and role::text='admin')
$$;
revoke all on function storage_live_private.is_admin() from public,anon,authenticated;
grant usage on schema storage_live_private to authenticated;
grant execute on function storage_live_private.is_admin() to authenticated;
drop policy if exists storage_signals_admin_read on public.storage_change_signals;
create policy storage_signals_admin_read on public.storage_change_signals
  for select to authenticated using ((select storage_live_private.is_admin()));

create or replace function storage_live_private.emit_signal() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if tg_table_schema <> 'public' or tg_table_name in
     ('storage_change_signals','homework_storage_usage','homework_storage_events') then
    return null;
  end if;
  insert into public.storage_change_signals(source_table,changed_at,affects_r2)
  values(tg_table_name,clock_timestamp(),tg_table_name='homework_attachments')
  on conflict(source_table) do update
    set changed_at=excluded.changed_at,affects_r2=excluded.affects_r2;
  return null;
end $$;
revoke all on function storage_live_private.emit_signal() from public,anon,authenticated;
-- Signal per source table avoids a single global row for unrelated writers.
-- Do not observe usage snapshots: the dashboard's own measure must not retrigger itself.
do $$
declare t record;
begin
  for t in select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind='r' and not c.relispartition
      and c.relname not in ('storage_change_signals','homework_storage_usage','homework_storage_events')
  loop
    execute format('drop trigger if exists storage_change_signal on public.%I',t.relname);
    execute format('create trigger storage_change_signal after insert or update or delete or truncate on public.%I for each statement execute function storage_live_private.emit_signal()',t.relname);
  end loop;
  if exists(select 1 from pg_publication where pubname='supabase_realtime') then
    if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='storage_change_signals') then
      alter publication supabase_realtime add table public.storage_change_signals;
    end if;
  else
    raise warning 'supabase_realtime publication is absent; configure it before expecting browser events';
  end if;
end $$;
commit;
