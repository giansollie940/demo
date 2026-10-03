-- User request 2026-10-03: 8-item minimum; Admin receives no homework alerts.
-- Existing bag verifiers and notification history remain unchanged.
begin;

-- One version byte followed by 8..20 catalogue codes.
create or replace function auth_bag.valid_input(p_input bytea, p_catalog smallint, p_catalog_size int)
returns boolean language sql immutable set search_path = '' as $$
  select length(p_input) between 9 and 21
     and get_byte(p_input, 0) = p_catalog
     and not exists (
       select 1 from generate_series(1, length(p_input) - 1) i where get_byte(p_input, i) >= p_catalog_size
     )
$$;

-- Teacher delivery is unchanged; legacy Admin preferences no longer opt in.
create or replace function homework_private.notify_managers(c uuid,n uuid,k text,msg text)
returns void language plpgsql set search_path=pg_catalog,public as $$
begin
  if k='system' then return; end if;
  insert into public.homework_notifications(class_id,recipient_id,notice_id,kind,title,message)
  select c,p.id,n,k,'Báo bài',msg
  from public.profiles p join public.class_teachers ct on ct.teacher_id=p.id
  where ct.class_id=c and ct.active and p.active and p.deleted_at is null and p.role::text='teacher';
end $$;

-- Keep the backlog aggregate available to oversight/history, without Admin alerts.
create or replace function homework_private.backlog(c uuid)
returns void language plpgsql set search_path=pg_catalog,public as $$
declare qty int;
begin
  insert into public.homework_backlog_state(class_id)values(c)on conflict do nothing;
  perform 1 from public.homework_backlog_state where class_id=c for update;
  select count(*) into qty from public.homework_notices
  where class_id=c and homework_private.actionable(homework_notices)
    and pending_since<=now()-interval '24 hours';
  update public.homework_backlog_state set active=(qty>=5) where class_id=c;
end $$;

-- Enforce recipient policy at the shared delivery table, including reminders,
-- correction notices and accounts that have since been promoted to Admin.
create or replace function homework_private.skip_admin_notification()
returns trigger language plpgsql set search_path=pg_catalog,public as $$
begin
  if exists(select 1 from public.profiles p where p.id=new.recipient_id and p.role::text='admin') then
    return null;
  end if;
  return new;
end $$;
revoke all on function homework_private.skip_admin_notification() from public,anon,authenticated;
drop trigger if exists homework_notifications_skip_admin on public.homework_notifications;
create trigger homework_notifications_skip_admin
before insert or update of recipient_id on public.homework_notifications
for each row execute function homework_private.skip_admin_notification();

-- Hide legacy rows without deleting or marking them as read.
create or replace function homework_private.notification_visible(hn public.homework_notifications,a public.profiles)
returns boolean language sql stable set search_path=pg_catalog,public as $$
  select a.role::text<>'admin' and (
    case when hn.kind like 'correction_%' then hn.recipient_id=a.id and exists(
      select 1 from public.homework_notices n where n.id=hn.notice_id and n.class_id=hn.class_id and n.author_id=a.id)
    else homework_private.notification_visible_v4(hn,a) end
  )
$$;

-- Preserve private helper boundaries even when applied to a fresh database.
revoke all on function auth_bag.valid_input(bytea,smallint,int) from public,anon,authenticated;
revoke all on function homework_private.notify_managers(uuid,uuid,text,text) from public,anon,authenticated;
revoke all on function homework_private.backlog(uuid) from public,anon,authenticated;
revoke all on function homework_private.notification_visible(public.homework_notifications,public.profiles) from public,anon,authenticated;
commit;
