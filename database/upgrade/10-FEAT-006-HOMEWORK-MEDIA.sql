-- FEAT-006, apply after RC2 migration 09. Transactional, no existing data rewrite.
begin;
create table public.homework_attachments (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.profiles,
 class_id uuid not null references public.classes, school_year_id uuid not null references public.school_years,
 notice_id uuid, request_id uuid not null, upload_id uuid not null, base_revision integer,
 correction_id uuid, correction_round smallint,
 object_key text not null unique, staging_key text not null unique,
 mime_type text not null default 'image/webp' check(mime_type='image/webp'),
 size_bytes integer not null check(size_bytes between 1 and 500000),
 width integer not null check(width between 1 and 1600), height integer not null check(height between 1 and 1600),
 checksum text not null check(checksum ~ '^[a-f0-9]{64}$'),
 status text not null default 'pending' check(status in('pending','active','deleting')),
 created_at timestamptz not null default clock_timestamp(), expires_at timestamptz not null default clock_timestamp()+interval '24 hours',
 verified_at timestamptz, finalized_at timestamptz, grant_until timestamptz,
 unique(owner_id,upload_id), check((correction_id is null)=(correction_round is null))
);
create index homework_attachments_expiry on public.homework_attachments(expires_at) where status='pending';
create index homework_attachments_notice on public.homework_attachments(notice_id);
create table public.homework_notice_media (
 notice_id uuid primary key references public.homework_notices on delete cascade,
 attachment_id uuid not null references public.homework_attachments
);
-- Historical published images remain retained with the notice, including soft deletion.
create table public.homework_media_history (
 notice_id uuid not null references public.homework_notices on delete cascade,
 attachment_id uuid not null references public.homework_attachments,
 revision integer not null, primary key(notice_id,revision)
);
alter table public.homework_correction_rounds add column attachment_id uuid references public.homework_attachments;
alter table public.homework_correction_rounds add column media_set boolean not null default false;
create table public.homework_media_outbox (
 attachment_id uuid primary key references public.homework_attachments on delete cascade,
 reason text not null, kind text not null default 'purge' check(kind in('purge','staging')), token uuid not null default gen_random_uuid(), safe_after timestamptz not null, next_attempt_at timestamptz not null default clock_timestamp(),
 attempts integer not null default 0, last_error text, created_at timestamptz not null default clock_timestamp()
);
create index homework_media_outbox_due on public.homework_media_outbox(next_attempt_at);
-- Receipts make an image-bearing retry idempotent even if the HTTP response was lost.
create table public.homework_media_receipts (
 owner_id uuid not null references public.profiles, operation_id uuid not null,
 notice_id uuid not null references public.homework_notices on delete cascade,
 class_id uuid not null references public.classes, payload_hash text not null,
 correction_id uuid, primary key(owner_id,operation_id)
);
alter table public.homework_attachments enable row level security;
alter table public.homework_notice_media enable row level security;
alter table public.homework_media_history enable row level security;
alter table public.homework_media_outbox enable row level security;
alter table public.homework_media_receipts enable row level security;
revoke all on public.homework_attachments,public.homework_notice_media,public.homework_media_history,public.homework_media_outbox,public.homework_media_receipts from public,anon,authenticated;

create function homework_private.media_referenced(target uuid) returns boolean language sql stable set search_path=pg_catalog,public as $$
 select exists(select 1 from public.homework_notice_media where attachment_id=target)
 or exists(select 1 from public.homework_media_history where attachment_id=target)
 or exists(select 1 from public.homework_correction_rounds where attachment_id=target)
$$;
create function homework_private.media_enqueue(target uuid,why text) returns void language plpgsql set search_path=pg_catalog,public as $$
declare m public.homework_attachments;begin
 select * into m from public.homework_attachments where id=target for update;
 if m.id is null then return;end if;
 update public.homework_attachments set status='deleting' where id=target;
 insert into public.homework_media_outbox(attachment_id,reason,safe_after)
 values(target,why,greatest(clock_timestamp(),coalesce(m.grant_until,clock_timestamp()))+interval '3 minutes')
 on conflict(attachment_id) do update set kind='purge',reason=excluded.reason,token=gen_random_uuid(),next_attempt_at=clock_timestamp(),safe_after=greatest(homework_media_outbox.safe_after,excluded.safe_after);
end $$;
create function homework_private.media_before_purge() returns trigger language plpgsql set search_path=pg_catalog,public as $$
declare m record;begin
 for m in select id from public.homework_attachments where notice_id=old.id loop
  perform homework_private.media_enqueue(m.id,'notice_hard_delete');
 end loop;
 return old;
end $$;
create trigger homework_media_before_purge before delete on public.homework_notices for each row execute function homework_private.media_before_purge();

create function public.homework_media(p_action text,p_data jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare c uuid:=(p_data->>'class_id')::uuid; a public.profiles; m public.homework_attachments;
 n public.homework_notices;cor public.homework_corrections; target uuid:=nullif(p_data->>'notice_id','')::uuid;
 rid uuid:=nullif(p_data->>'request_id','')::uuid; mid uuid; until_time timestamptz;
begin
 a:=homework_private.actor(c);
 perform pg_advisory_xact_lock(hashtextextended('homework:'||c::text,0));
 if p_action='prepare' then
  if a.role::text not in('student','monitor','teacher') then raise exception 'Chỉ tác giả được tải ảnh' using errcode='42501';end if;
  if rid is null then raise exception 'Thiếu mã yêu cầu';end if;
  if target is not null then
   select * into n from public.homework_notices where id=target and class_id=c for update;
   if n.id is null or n.author_id<>a.id or n.status in('deleted','replaced') then raise exception 'Không có quyền thay ảnh' using errcode='42501';end if;
   select * into cor from public.homework_corrections where notice_id=target and status in('awaiting_author','awaiting_teacher');
   if cor.id is not null then
    if cor.status<>'awaiting_author' or cor.id is distinct from nullif(p_data->>'correction_id','')::uuid or cor.round is distinct from (p_data->>'round')::smallint or cor.version is distinct from (p_data->>'version')::int
     or exists(select 1 from public.homework_correction_rounds where correction_id=cor.id and round=cor.round and due_at<=clock_timestamp()) then raise exception 'Yêu cầu chỉnh sửa đã thay đổi';end if;
   elsif nullif(p_data->>'correction_id','') is not null or n.revision is distinct from (p_data->>'revision')::int then raise exception 'Bài đã thay đổi';end if;
  elsif nullif(p_data->>'correction_id','') is not null then raise exception 'Không có bản chỉnh sửa';end if;
  select * into m from public.homework_attachments where owner_id=a.id and upload_id=coalesce(nullif(p_data->>'upload_id','')::uuid,rid);
  if m.id is not null then
   if m.class_id<>c or m.notice_id is distinct from target or m.checksum is distinct from p_data->>'checksum' or m.size_bytes is distinct from (p_data->>'size_bytes')::int or m.width is distinct from (p_data->>'width')::int or m.height is distinct from (p_data->>'height')::int
    or m.correction_id is distinct from cor.id or m.status<>'pending' or m.expires_at<=clock_timestamp() then raise exception 'Yêu cầu tải ảnh đã thay đổi hoặc hết hạn';end if;
   return to_jsonb(m);
  end if;
  mid:=gen_random_uuid();
  insert into public.homework_attachments(id,owner_id,class_id,school_year_id,notice_id,request_id,upload_id,base_revision,correction_id,correction_round,object_key,staging_key,size_bytes,width,height,checksum)
  values(mid,a.id,c,(select school_year_id from public.classes where id=c),target,rid,coalesce(nullif(p_data->>'upload_id','')::uuid,rid),n.revision,cor.id,cor.round,
   'homework/'||c::text||'/'||mid::text||'/image.webp','pending/'||c::text||'/'||mid::text||'/upload.webp',
   (p_data->>'size_bytes')::int,(p_data->>'width')::int,(p_data->>'height')::int,p_data->>'checksum')returning * into m;
  return to_jsonb(m);
 end if;
 select * into m from public.homework_attachments where id=(p_data->>'attachment_id')::uuid and class_id=c for update;
 if m.id is null or m.status='deleting' then raise exception 'Không có ảnh khả dụng' using errcode='42501';end if;
 if p_action in('ticket','cancel') then
  if m.owner_id<>a.id or a.role::text='admin' or m.status<>'pending' then raise exception 'Chỉ tác giả dùng ảnh chờ' using errcode='42501';end if;
  if p_action='cancel' then perform homework_private.media_enqueue(m.id,'pending_canceled');return '{"ok":true,"cleanup":"queued"}';end if;
  if m.expires_at<=clock_timestamp() then raise exception 'Ảnh chờ đã hết hạn 24 giờ';end if;
  if m.notice_id is not null then
   select * into n from public.homework_notices where id=m.notice_id and author_id=a.id and class_id=c;
   if n.id is null or n.status in('deleted','replaced') then raise exception 'Bài không còn nhận ảnh';end if;
   if m.correction_id is not null then
    if not exists(select 1 from public.homework_corrections x join public.homework_correction_rounds r on r.correction_id=x.id and r.round=x.round where x.id=m.correction_id and x.notice_id=n.id and x.round=m.correction_round and x.status='awaiting_author' and r.due_at>clock_timestamp()) then raise exception 'Correction không còn nhận ảnh';end if;
   elsif n.revision<>m.base_revision or exists(select 1 from public.homework_corrections where notice_id=n.id and status in('awaiting_author','awaiting_teacher')) then raise exception 'Bài đã thay đổi';end if;
  end if;
  -- Covers short PUT/signing + bounded promotion work; cleanup sweeps again after this grant.
  until_time:=least(m.expires_at,clock_timestamp()+interval '5 minutes');
  update public.homework_attachments set grant_until=until_time where id=m.id returning * into m;
  return to_jsonb(m);
 elsif p_action='read' then
  if m.status='pending' then
   if a.id<>m.owner_id or m.verified_at is null or m.expires_at<=clock_timestamp() then raise exception 'Ảnh chờ riêng tư' using errcode='42501';end if;
  else
   select * into n from public.homework_notices where id=m.notice_id and class_id=c;
   if n.id is null then raise exception 'Ảnh đã gỡ' using errcode='42501';end if;
   if exists(select 1 from public.homework_notice_media where notice_id=n.id and attachment_id=m.id) then
    -- FEAT-006 P1: peer image access requires active English membership for
    -- Student AND Monitor; the legacy visible() helper exempts Monitor.
    if not (n.author_id=a.id or a.role::text in('teacher','admin') or (n.status='published' and (
     n.english_group_id is null or exists(
      select 1 from public.english_group_members membership
      where membership.english_group_id=n.english_group_id
       and membership.student_id=a.id and membership.left_at is null
     )
    ))) then raise exception 'Ngoài phạm vi bài' using errcode='42501';end if;
   elsif exists(select 1 from public.homework_media_history where notice_id=n.id and attachment_id=m.id) then
    if not(n.author_id=a.id or a.role::text in('teacher','admin')) then raise exception 'Lịch sử ảnh riêng tư' using errcode='42501';end if;
   elsif exists(select 1 from public.homework_correction_rounds r join public.homework_corrections x on x.id=r.correction_id where x.notice_id=n.id and r.attachment_id=m.id) then
    if not(n.author_id=a.id or a.role::text='teacher') then raise exception 'Ảnh chỉnh sửa riêng tư' using errcode='42501';end if;
   else raise exception 'Ảnh không còn tham chiếu' using errcode='42501';end if;
  end if;
  return jsonb_build_object('id',m.id,'object_key',m.object_key,'width',m.width,'height',m.height);
 end if;
 raise exception 'Thao tác ảnh không hợp lệ';
end $$;

create function public.homework_media_service(p_action text,p_data jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare m public.homework_attachments;j public.homework_media_outbox;row_item record;result jsonb;begin
 if current_setting('role',true) is distinct from 'service_role' then raise exception 'Service only' using errcode='42501';end if;
 if p_action='seal' then
  select * into m from public.homework_attachments where id=(p_data->>'attachment_id')::uuid;
  perform pg_advisory_xact_lock(hashtextextended('homework:'||m.class_id::text,0));
  select * into m from public.homework_attachments where id=m.id for update;
  if m.id is null or m.owner_id is distinct from (p_data->>'owner_id')::uuid or m.status<>'pending' or m.expires_at<=clock_timestamp() or m.grant_until is null or m.grant_until<=clock_timestamp() then raise exception 'Ảnh chờ không còn khả dụng';end if;
  update public.homework_attachments set verified_at=clock_timestamp() where id=m.id;
  return '{"ok":true}';
 elsif p_action='jobs' then
  for row_item in select id,class_id from public.homework_attachments where status='pending' and expires_at<=clock_timestamp() order by expires_at limit 100 loop
   perform pg_advisory_xact_lock(hashtextextended('homework:'||row_item.class_id::text,0));
   if exists(select 1 from public.homework_attachments where id=row_item.id and status='pending' and expires_at<=clock_timestamp()) then perform homework_private.media_enqueue(row_item.id,'pending_expired');end if;
  end loop;
  with picked as(select attachment_id from public.homework_media_outbox where next_attempt_at<=clock_timestamp() and (p_data->>'attachment_id' is null or attachment_id=(p_data->>'attachment_id')::uuid) order by next_attempt_at for update skip locked limit 50),
  claimed as(update public.homework_media_outbox o set token=gen_random_uuid(),attempts=attempts+1,next_attempt_at=clock_timestamp()+interval '5 minutes' from picked p where p.attachment_id=o.attachment_id returning o.*)
  select coalesce(jsonb_agg(jsonb_build_object('id',att.id,'staging_key',att.staging_key,'object_key',att.object_key,'safe_after',x.safe_after,'kind',x.kind,'token',x.token)),'[]') into result from claimed x join public.homework_attachments att on att.id=x.attachment_id;
  return result;
 elsif p_action='ack' then
  select * into j from public.homework_media_outbox where attachment_id=(p_data->>'attachment_id')::uuid for update;
  if j.attachment_id is null or j.token is distinct from (p_data->>'token')::uuid then return '{"ok":true}';end if;
  if p_data->'success'='true'::jsonb then
   if clock_timestamp()>=j.safe_after and j.kind='staging' then
    delete from public.homework_media_outbox where attachment_id=j.attachment_id;
   elsif clock_timestamp()>=j.safe_after and not homework_private.media_referenced(j.attachment_id) then
    delete from public.homework_attachments where id=j.attachment_id and status='deleting';
   else update public.homework_media_outbox set next_attempt_at=greatest(j.safe_after,clock_timestamp()+interval '1 minute'),last_error=null where attachment_id=j.attachment_id;end if;
  else update public.homework_media_outbox set next_attempt_at=clock_timestamp()+interval '1 minute',last_error='R2_DELETE_FAILED' where attachment_id=j.attachment_id;end if;
  return '{"ok":true}';
 end if;
 raise exception 'Unknown media service action';
end $$;

create function homework_private.media_after_attach() returns trigger language plpgsql set search_path=pg_catalog,public as $$
begin
 if new.status='active' and old.status='pending' then
  insert into public.homework_media_outbox(attachment_id,kind,reason,safe_after,next_attempt_at)
  values(new.id,'staging','promoted_staging',greatest(clock_timestamp(),coalesce(new.grant_until,clock_timestamp()))+interval '3 minutes',greatest(clock_timestamp(),coalesce(new.grant_until,clock_timestamp()))+interval '3 minutes')
  on conflict do nothing;
 end if;return new;
end $$;
create trigger homework_media_after_attach after update on public.homework_attachments for each row execute function homework_private.media_after_attach();

alter function homework_private.card(public.homework_notices,uuid) rename to card_v5;
create function homework_private.card(n public.homework_notices,p_user uuid) returns jsonb language sql stable set search_path=pg_catalog,public as $$
 select homework_private.card_v5(n,p_user)||jsonb_build_object('attachment_id',(select attachment_id from public.homework_notice_media where notice_id=n.id))
$$;
alter function public.homework_api(text,jsonb) set schema homework_private;
alter function homework_private.homework_api(text,jsonb) rename to api_v5;
create function public.homework_api(p_action text,p_data jsonb default '{}'::jsonb) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare a public.profiles;c uuid:=nullif(p_data->>'class_id','')::uuid;n public.homework_notices;
 m public.homework_attachments;cor public.homework_corrections;rr public.homework_correction_rounds;
 out_data jsonb;mid uuid:=nullif(p_data->>'attachment_id','')::uuid;old_mid uuid;new_mid uuid;
 supplied boolean:=p_data ? 'attachment_id';op uuid:=nullif(p_data->>'media_operation_id','')::uuid;
 receipt public.homework_media_receipts;payload_hash text:=md5(p_action||p_data::text);
begin
 if p_action not in('submit','correction_save','correction_submit','correction_decide','correction_request','hard_delete') then
  if supplied then raise exception 'Thao tác không nhận ảnh';end if;
  return homework_private.api_v5(p_action,p_data);
 end if;
 a:=homework_private.actor(c);
 perform pg_advisory_xact_lock(hashtextextended('homework:'||c::text,0));
 if op is not null then
  select * into receipt from public.homework_media_receipts where owner_id=a.id and operation_id=op;
  if receipt.owner_id is not null then
   if receipt.class_id<>c or receipt.payload_hash<>payload_hash then raise exception 'Yêu cầu gửi lại đã thay đổi';end if;
   if receipt.correction_id is not null then return (select to_jsonb(x)||'{"ok":true}'::jsonb from public.homework_corrections x where x.id=receipt.correction_id);end if;
   return (select homework_private.card(x,a.id) from public.homework_notices x where x.id=receipt.notice_id);
  end if;
 end if;
 if p_action='submit' and nullif(p_data->>'id','') is null then
  select * into n from public.homework_notices where author_id=a.id and request_id=nullif(p_data->>'request_id','')::uuid;
  if n.id is not null then
   if n.class_id<>c then raise exception 'Request không thuộc lớp';end if;
   return homework_private.card(n,a.id);
  end if;
 end if;
 select * into n from public.homework_notices where id=nullif(p_data->>'id','')::uuid and class_id=c for update;
 select attachment_id into old_mid from public.homework_notice_media where notice_id=n.id;
 if n.id is not null then
  select * into cor from public.homework_corrections where notice_id=n.id and status in('awaiting_author','awaiting_teacher');
  select * into rr from public.homework_correction_rounds where correction_id=cor.id and round=cor.round;
 end if;
 if supplied then
  if p_action not in('submit','correction_save','correction_submit') or a.role::text='admin' or (n.id is not null and n.author_id<>a.id) then raise exception 'Chỉ tác giả thay ảnh' using errcode='42501';end if;
  if mid is not null then
   select * into m from public.homework_attachments where id=mid for update;
   if m.id is null or m.owner_id<>a.id or m.class_id<>c or m.status='deleting' or m.verified_at is null then raise exception 'Ảnh chưa được xác minh hoặc không thuộc tác giả' using errcode='42501';end if;
   if m.status='pending' then
    if m.expires_at<=clock_timestamp() or m.notice_id is distinct from n.id then raise exception 'Ảnh chờ hết hạn hoặc sai bài';end if;
    if n.id is null and m.request_id is distinct from nullif(p_data->>'request_id','')::uuid then raise exception 'Sai yêu cầu tạo bài';end if;
    if p_action='submit' and (m.correction_id is not null or (n.id is not null and m.base_revision<>n.revision)) then raise exception 'Ảnh thuộc revision khác';end if;
    if p_action<>'submit' and (m.correction_id is distinct from cor.id or m.correction_round is distinct from cor.round) then raise exception 'Ảnh thuộc correction khác';end if;
   elsif m.notice_id is distinct from n.id or (mid is distinct from old_mid and mid is distinct from rr.attachment_id) then raise exception 'Không thể dùng lại ảnh của bản khác';end if;
  end if;
 end if;
 out_data:=homework_private.api_v5(p_action,p_data-'attachment_id'-'media_operation_id');
 if coalesce((out_data->>'expired')::boolean,false) then return out_data;end if;
 if p_action='hard_delete' then
  if exists(select 1 from public.homework_attachments where notice_id=(p_data->>'id')::uuid and status='deleting') then out_data:=out_data||'{"media_cleanup":"queued"}'::jsonb;end if;
  return out_data;
 elsif p_action='correction_request' then
  update public.homework_correction_rounds set media_set=true,attachment_id=old_mid where correction_id=(out_data->>'id')::uuid and round=1;
 elsif p_action in('correction_save','correction_submit') then
  if supplied then
   update public.homework_correction_rounds set media_set=true,attachment_id=mid where correction_id=cor.id and round=cor.round;
   if mid is not null then update public.homework_attachments set status='active',finalized_at=coalesce(finalized_at,clock_timestamp()) where id=mid;end if;
   -- Old unsubmitted drafts have no history reference; submitted rounds remain retained.
   if rr.attachment_id is not null and not homework_private.media_referenced(rr.attachment_id) then perform homework_private.media_enqueue(rr.attachment_id,'superseded_draft');end if;
  end if;
 elsif p_action='submit' or (p_action='correction_decide' and p_data->>'decision'='approved') then
  if old_mid is not null then insert into public.homework_media_history(notice_id,attachment_id,revision) values(n.id,old_mid,n.revision) on conflict do nothing;end if;
  new_mid:=case when p_action='correction_decide' then case when rr.media_set then rr.attachment_id else old_mid end when supplied then mid else old_mid end;
  if new_mid is null then delete from public.homework_notice_media where notice_id=(out_data->>'id')::uuid;
  else
   insert into public.homework_notice_media(notice_id,attachment_id)values((out_data->>'id')::uuid,new_mid)on conflict(notice_id)do update set attachment_id=excluded.attachment_id;
   update public.homework_attachments set status='active',notice_id=(out_data->>'id')::uuid,finalized_at=coalesce(finalized_at,clock_timestamp())where id=new_mid;
  end if;
  out_data:=out_data||jsonb_build_object('attachment_id',new_mid);
 elsif p_action='correction_decide' and p_data->>'decision'='rejected' and cor.round=1 then
  update public.homework_correction_rounds set media_set=rr.media_set,attachment_id=rr.attachment_id where correction_id=cor.id and round=2;
 end if;
 if supplied then perform homework_private.audit(c,coalesce(n.id,(out_data->>'id')::uuid),a.id,'media_reference',jsonb_build_object('attachment_id',old_mid),jsonb_build_object('attachment_id',mid,'action',p_action));end if;
 if op is not null then insert into public.homework_media_receipts(owner_id,operation_id,notice_id,class_id,payload_hash,correction_id) values(a.id,op,coalesce(n.id,(out_data->>'id')::uuid),c,payload_hash,case when p_action in('correction_save','correction_submit') then cor.id end);end if;
 return out_data;
end $$;
revoke all on all functions in schema homework_private from public,anon,authenticated;
revoke all on function public.homework_media(text,jsonb),public.homework_media_service(text,jsonb),public.homework_api(text,jsonb) from public,anon,authenticated;
grant execute on function public.homework_media(text,jsonb),public.homework_api(text,jsonb) to authenticated;
grant execute on function public.homework_media_service(text,jsonb) to service_role;
commit;
