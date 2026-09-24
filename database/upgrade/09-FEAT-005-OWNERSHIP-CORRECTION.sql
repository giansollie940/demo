-- FEAT-005 SYSTEM_ACTOR_RESOLVED. Apply once AFTER 08, in one transaction.
-- Never run this file against production as part of implementation/testing.
begin;
lock table public.homework_notices, public.homework_tombstones in access exclusive mode;
do $$ begin
 if exists(select 1 from public.homework_notices where status='deleted' and (deleted_at is null or deleted_by is null)) then
   raise exception 'FEAT-005 preflight: legacy deletion attribution requires investigation';
 end if;
end $$;
alter table public.homework_notices add column deleted_actor_type text;
update public.homework_notices set deleted_actor_type='user' where status='deleted';
alter table public.homework_notices add constraint homework_deletion_actor check (
 (status='deleted' and deleted_at is not null and deleted_actor_type is not null and
  ((deleted_actor_type='user' and deleted_by is not null) or (deleted_actor_type='system' and deleted_by is null)))
 or (status<>'deleted' and deleted_at is null and deleted_by is null and deleted_actor_type is null));
-- Constant default adds attribution without updating immutable historical records.
alter table public.homework_tombstones add column soft_delete_actor_type text not null default 'user';
alter table public.homework_tombstones alter column soft_deleted_by drop not null;
alter table public.homework_tombstones add constraint homework_tombstone_actor check (
 (soft_delete_actor_type='user' and soft_deleted_by is not null) or (soft_delete_actor_type='system' and soft_deleted_by is null));

create function homework_private.deletion_attribution() returns trigger language plpgsql set search_path=pg_catalog,public as $$
begin
 if new.status<>'deleted' then new.deleted_actor_type:=null;
 elsif new.deleted_by is not null then new.deleted_actor_type:='user'; end if;
 return new;
end $$;
create trigger homework_deletion_attribution before insert or update on public.homework_notices for each row execute function homework_private.deletion_attribution();

-- Restricted operational records. No direct client grants, including SELECT.
create table public.homework_reports (
 id uuid primary key default gen_random_uuid(), class_id uuid not null references public.classes,
 notice_id uuid not null references public.homework_notices on delete cascade,
 reporter_id uuid not null references public.profiles, created_at timestamptz not null default clock_timestamp(),
 category text not null check(category in('deadline','subject','content','duplicate','other')),
 note text check(length(note)<=2000), status text not null default 'open' check(status in('open','valid','invalid','suspected_abuse')),
 processed_by uuid references public.profiles, processed_at timestamptz, teacher_note text check(length(teacher_note)<=2000)
);
create unique index homework_report_one_open on public.homework_reports(notice_id,reporter_id) where status='open';
create index homework_reports_scope on public.homework_reports(class_id,created_at desc);
create table public.homework_corrections (
 id uuid primary key default gen_random_uuid(),class_id uuid not null references public.classes,
 notice_id uuid not null references public.homework_notices on delete cascade,
 round smallint not null default 1 check(round between 1 and 2), version integer not null default 1 check(version>0),
 status text not null default 'awaiting_author' check(status in('awaiting_author','awaiting_teacher','approved','timeout','rejected_final','withdrawn_by_author','emergency_removed')),
 created_at timestamptz not null default clock_timestamp(),closed_at timestamptz,
 check((status in('awaiting_author','awaiting_teacher'))=(closed_at is null))
);
create unique index homework_correction_one_open on public.homework_corrections(notice_id) where status in('awaiting_author','awaiting_teacher');
create table public.homework_correction_rounds (
 correction_id uuid not null references public.homework_corrections on delete cascade,
 round smallint not null check(round between 1 and 2),primary key(correction_id,round),
 requested_by uuid not null references public.profiles,requested_at timestamptz not null,
 due_at timestamptz not null,issue_types text[] not null,
 reason text not null check(length(trim(reason)) between 1 and 2000),
 draft jsonb,submitted_at timestamptz,decided_by uuid references public.profiles,decided_at timestamptz,
 decision text check(decision in('approved','rejected')),decision_reason text,
 check(due_at=requested_at+interval '72 hours'),
 check(cardinality(issue_types)>0 and issue_types <@ array['deadline','subject','content','other']::text[] and array_position(issue_types,null) is null)
);
-- Reporter identity and private revisions never enter the public contribution log.
create table public.homework_moderation_events (
 id uuid primary key default gen_random_uuid(),class_id uuid not null references public.classes,
 notice_id uuid not null references public.homework_notices on delete cascade,
 report_id uuid references public.homework_reports on delete cascade,
 correction_id uuid references public.homework_corrections on delete cascade,
 actor_id uuid references public.profiles,actor_type text not null check(actor_type in('user','system')),
 event_type text not null,round smallint check(round between 1 and 2),reason text,
 created_at timestamptz not null default clock_timestamp(),
 check((actor_type='user' and actor_id is not null) or (actor_type='system' and actor_id is null))
);
create index homework_moderation_scope on public.homework_moderation_events(class_id,notice_id,created_at);
do $$ declare t text; begin
 foreach t in array array['homework_reports','homework_corrections','homework_correction_rounds','homework_moderation_events'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
 end loop;
end $$;

create function homework_private.moderation_event(c uuid,n uuid,a uuid,e text,reason_text text default null,cor uuid default null,rnd smallint default null,rep uuid default null)
returns void language sql set search_path=pg_catalog,public as $$
 insert into public.homework_moderation_events(class_id,notice_id,actor_id,actor_type,event_type,reason,correction_id,round,report_id)
 values(c,n,a,case when a is null then 'system' else 'user' end,e,reason_text,cor,rnd,rep)
$$;
create function homework_private.notify_author(n public.homework_notices,k text,msg text) returns void language sql set search_path=pg_catalog,public as $$
 insert into public.homework_notifications(class_id,recipient_id,notice_id,kind,title,message)
 values(n.class_id,n.author_id,n.id,'correction_'||k,'Báo bài — cập nhật từ giáo viên/hệ thống',msg)
$$;
alter function homework_private.notification_visible(public.homework_notifications,public.profiles) rename to notification_visible_v4;
create function homework_private.notification_visible(hn public.homework_notifications,a public.profiles) returns boolean language sql stable set search_path=pg_catalog,public as $$
 select case when hn.kind like 'correction_%' then hn.recipient_id=a.id and exists(select 1 from public.homework_notices n where n.id=hn.notice_id and n.class_id=hn.class_id and n.author_id=a.id)
 else homework_private.notification_visible_v4(hn,a) end
$$;

create function homework_private.correction_delete(n public.homework_notices,actor uuid,why text,outcome text,cor public.homework_corrections)
returns void language plpgsql set search_path=pg_catalog,public as $$
begin
 if n.status in('deleted','replaced') then raise exception 'Bài đã thay đổi'; end if;
 update public.homework_notices set previous_status=status,status='deleted',deleted_at=clock_timestamp(),deleted_by=actor,
  deleted_actor_type=case when actor is null then 'system' else 'user' end,delete_reason=why,revision=revision+1,updated_at=clock_timestamp() where id=n.id;
 if cor.id is not null then
  update public.homework_corrections set status=outcome,closed_at=clock_timestamp(),version=version+1 where id=cor.id;
 end if;
 perform homework_private.moderation_event(n.class_id,n.id,actor,outcome,why,cor.id,cor.round);
 perform homework_private.moderation_event(n.class_id,n.id,actor,case when actor is null then 'system_soft_delete' else 'user_soft_delete' end,why,cor.id,cor.round);
 perform homework_private.notify_author(n,outcome,why);
 perform homework_private.backlog(n.class_id);
end $$;

create function homework_private.expire_corrections(c uuid) returns integer language plpgsql set search_path=pg_catalog,public as $$
declare cor public.homework_corrections;n public.homework_notices;total integer:=0;begin
 perform pg_advisory_xact_lock(hashtextextended('homework:'||c::text,0));
 for cor in select x.* from public.homework_corrections x join public.homework_correction_rounds r on r.correction_id=x.id and r.round=x.round
 where x.class_id=c and x.status='awaiting_author' and r.due_at<=clock_timestamp() order by x.id for update of x loop
  select * into n from public.homework_notices where id=cor.notice_id for update;
  if n.status not in('deleted','replaced') then
   perform homework_private.correction_delete(n,null,'Không chỉnh sửa Báo bài trong 72 giờ sau yêu cầu của giáo viên.','timeout',cor);
   total:=total+1;
  end if;
 end loop;return total;
end $$;

-- Keep all existing material-change and AI/duplicate behavior. This helper
-- applies only a Teacher-approved revision; it never changes auth.uid().
create function homework_private.apply_correction(n public.homework_notices,p jsonb,a uuid) returns jsonb language plpgsql set search_path=pg_catalog,public as $$
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

create function homework_private.validate_revision(n public.homework_notices,p jsonb) returns jsonb language plpgsql set search_path=pg_catalog,public as $$
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

alter function homework_private.card(public.homework_notices,uuid) rename to card_v4;
create function homework_private.card(n public.homework_notices,p_user uuid) returns jsonb language sql stable set search_path=pg_catalog,public as $$
 select homework_private.card_v4(n,p_user)||jsonb_build_object(
 'deleted_actor_type',n.deleted_actor_type,'deleted_by',n.deleted_by,'deleted_at',n.deleted_at,'deleted_actor_name',case when n.deleted_actor_type='system' then 'System' else (select full_name from public.profiles where id=n.deleted_by) end,
 'correction', (select jsonb_build_object('id',c.id,'round',c.round,'status',c.status,'version',c.version,'due_at',r.due_at)
 from public.homework_corrections c join public.homework_correction_rounds r on r.correction_id=c.id and r.round=c.round
 where c.notice_id=n.id and c.status in('awaiting_author','awaiting_teacher')))
$$;

-- Old dispatchers remain private and inaccessible; all public calls use this gate.
alter function public.homework_api(text,jsonb) set schema homework_private;
alter function homework_private.homework_api(text,jsonb) rename to api_v4;
create function public.homework_api(p_action text,p_data jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare c uuid:=nullif(p_data->>'class_id','')::uuid;a public.profiles;n public.homework_notices;
 cor public.homework_corrections;rr public.homework_correction_rounds;rep public.homework_reports;
 rid uuid:=nullif(p_data->>'id','')::uuid;why text:=trim(coalesce(p_data->>'reason',''));issues text[];
 out_data jsonb;payload jsonb;stamp timestamptz;
begin
 if p_action in('context','catalog_list','catalog_save','oversight') then return homework_private.api_v4(p_action,p_data);end if;
 perform 1 from public.profiles where id=auth.uid() for share;
 perform 1 from public.classes where id=c for share;
 perform 1 from public.class_teachers where class_id=c and teacher_id=auth.uid() for share;
 a:=homework_private.actor(c);
 perform pg_advisory_xact_lock(hashtextextended('homework:'||c::text,0));
 if a.role::text='admin' and p_action not in('load','inbox','read_notification','settings','alert_settings','hard_delete') then raise exception 'Admin chỉ giám sát Báo bài' using errcode='42501';end if;

 if p_action='load' then
  out_data:=homework_private.api_v4(p_action,p_data);
  if a.role::text in('student','monitor','teacher') then
   out_data:=out_data||jsonb_build_object('corrections',coalesce((select jsonb_agg(to_jsonb(x)||jsonb_build_object('rounds',(select jsonb_agg(to_jsonb(r) order by r.round)from public.homework_correction_rounds r where r.correction_id=x.id),
    'events',(select coalesce(jsonb_agg(to_jsonb(e)||jsonb_build_object('actor_name',(select full_name from public.profiles where id=e.actor_id)) order by e.created_at),'[]') from public.homework_moderation_events e where e.correction_id=x.id and e.report_id is null)))
    from public.homework_corrections x join public.homework_notices hn on hn.id=x.notice_id where x.class_id=c and (hn.author_id=a.id or a.role::text='teacher')),'[]'));
  end if;
  if a.role::text='teacher' then
   out_data:=jsonb_set(out_data,'{audit}',coalesce(out_data->'audit','[]')||coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'event_type',e.event_type,'actor_id',e.actor_id,'notice_id',e.notice_id,'created_at',e.created_at,'before_data',null,'after_data',jsonb_build_object('actor_type',e.actor_type,'round',e.round,'reason',e.reason,'report_id',e.report_id,'correction_id',e.correction_id)) order by e.created_at desc) from public.homework_moderation_events e where e.class_id=c),'[]'));
   out_data:=out_data||jsonb_build_object('reports',coalesce((select jsonb_agg(to_jsonb(r)||jsonb_build_object('reporter_name',p.full_name,'reporter_code',coalesce(to_jsonb(p)->>'student_code',to_jsonb(p)->>'username',to_jsonb(p)->>'login_code'),
    'class_name',(select code from public.classes where id=r.class_id),'events',(select coalesce(jsonb_agg(to_jsonb(e)||jsonb_build_object('actor_name',(select full_name from public.profiles where id=e.actor_id)) order by e.created_at),'[]')from public.homework_moderation_events e where e.report_id=r.id)) order by r.created_at desc)
    from public.homework_reports r join public.profiles p on p.id=r.reporter_id where r.class_id=c),'[]'),
    'report_statistics',coalesce((select jsonb_agg(to_jsonb(x)) from(select r.reporter_id,p.full_name,count(*) total,count(*)filter(where status='valid') valid,count(*)filter(where status='invalid') invalid,count(*)filter(where status='suspected_abuse') suspected_abuse
    from public.homework_reports r join public.profiles p on p.id=r.reporter_id where r.class_id=c group by r.reporter_id,p.full_name)x),'[]'));
  end if;
  return out_data;
 end if;

 if rid is not null and p_action not in('read_notification','group_save','group_assign','subject_save') then
  select * into n from public.homework_notices where id=rid and class_id=c for update;
 end if;
 if p_action in('submit','delete') and rid is not null then
  if n.id is null or n.author_id<>a.id then raise exception 'Chỉ tác giả được sửa/xóa bài' using errcode='42501';end if;
  if exists(select 1 from public.homework_corrections where notice_id=n.id and status in('awaiting_author','awaiting_teacher')) then raise exception 'Bài đang chỉnh sửa: dùng Gửi lại GV hoặc Xin rút bài';end if;
 end if;
 if p_action='remind' and a.role::text='monitor' and n.author_id is distinct from a.id then raise exception 'Cán sự không nhắc bài người khác' using errcode='42501';end if;
 -- Product decision, 2026-09-15: resolve the target's correction before replacing
 -- it through duplicate review. The shared class lock makes this race-safe with
 -- correction creation/closure and the existing replacement transaction.
 if p_action='review' and a.role::text='teacher' and p_data->>'decision'='replace_existing'
  and exists(select 1 from public.homework_corrections where notice_id=n.duplicate_of and status in('awaiting_author','awaiting_teacher')) then
  raise exception 'Bài cũ đang có yêu cầu chỉnh sửa. GV cần xử lý correction trước khi Thay bài cũ.';
 end if;

 if p_action not in('report','report_process','correction_request','correction_save','correction_submit','correction_decide','withdraw','emergency_remove') then
  return homework_private.api_v4(p_action,p_data);
 end if;
 if n.id is null then raise exception 'Không tìm thấy bài' using errcode='42501';end if;
 if not homework_private.visible(n,a) and n.author_id<>a.id then raise exception 'Ngoài nhóm Tiếng Anh' using errcode='42501';end if;
 if p_action in('report_process','correction_request','correction_decide','emergency_remove') and a.role::text<>'teacher' then raise exception 'Chỉ Teacher lớp được xử lý' using errcode='42501';end if;

 if p_action='report' then
  if a.role::text<>'monitor' or n.author_id=a.id then raise exception 'Chỉ Cán sự báo bài người khác' using errcode='42501';end if;
  if n.status<>'published' then raise exception 'Bài không còn công khai';end if;
  if exists(select 1 from jsonb_object_keys(p_data) k where k not in('class_id','id','category','note','action')) then raise exception 'Report payload không hợp lệ';end if;
  insert into public.homework_reports(class_id,notice_id,reporter_id,category,note)values(c,n.id,a.id,p_data->>'category',nullif(trim(p_data->>'note'),''))returning * into rep;
  perform homework_private.moderation_event(c,n.id,a.id,'report_created',null,null,null,rep.id);
  return '{"ok":true}';
 elsif p_action='report_process' then
  select * into rep from public.homework_reports where id=(p_data->>'report_id')::uuid and notice_id=n.id and class_id=c for update;
  if rep.id is null or rep.status<>'open' then raise exception 'Report đã xử lý hoặc không tồn tại';end if;
  if p_data->>'outcome' is null or p_data->>'outcome' not in('valid','invalid','suspected_abuse') then raise exception 'Kết quả report không hợp lệ';end if;
  update public.homework_reports set status=p_data->>'outcome',teacher_note=nullif(trim(p_data->>'note'),''),processed_at=clock_timestamp(),processed_by=a.id where id=rep.id;
  perform homework_private.moderation_event(c,n.id,a.id,'report_'||(p_data->>'outcome'),p_data->>'note',null,null,rep.id);
  return '{"ok":true}';
 end if;

 if n.status in('deleted','replaced') then raise exception 'Bài đã thay đổi hoặc đã gỡ';end if;
 select * into cor from public.homework_corrections where notice_id=n.id and status in('awaiting_author','awaiting_teacher') for update;
 if p_action='correction_request' then
  if cor.id is not null then raise exception 'Đã có yêu cầu chỉnh sửa đang mở';end if;
  if n.status<>'published' then raise exception 'Chỉ yêu cầu chỉnh sửa bài đã công bố';end if;
  if not exists(select 1 from public.profiles where id=n.author_id and role::text in('student','monitor')) then raise exception 'Chỉ yêu cầu tác giả học sinh/cán sự chỉnh sửa';end if;
  if length(why) not between 1 and 2000 then raise exception 'Cần hướng dẫn chỉnh sửa';end if;
  select array_agg(v) into issues from jsonb_array_elements_text(p_data->'issue_types')v;
  stamp:=clock_timestamp();
  insert into public.homework_corrections(class_id,notice_id)values(c,n.id)returning * into cor;
  insert into public.homework_correction_rounds(correction_id,round,requested_by,requested_at,due_at,issue_types,reason)values(cor.id,1,a.id,stamp,stamp+interval '72 hours',issues,why);
  perform homework_private.moderation_event(c,n.id,a.id,'correction_created',why,cor.id,cor.round);
  perform homework_private.notify_author(n,'requested','GV yêu cầu chỉnh sửa Báo bài. Hạn phản hồi: '||to_char((stamp+interval '72 hours') at time zone 'Asia/Ho_Chi_Minh','HH24:MI DD/MM/YYYY')||'. '||why);
  return to_jsonb(cor);
 elsif p_action='emergency_remove' then
  if not exists(select 1 from public.profiles where id=n.author_id and role::text in('student','monitor')) then raise exception 'Chỉ gỡ bài của học sinh/cán sự';end if;
  if p_data->>'category' is null or p_data->>'category' not in('inappropriate_content','posted_by_mistake','seriously_incorrect_information','other') or length(why) not between 1 and 2000 then raise exception 'Cần loại và lý do gỡ khẩn cấp';end if;
  perform homework_private.correction_delete(n,a.id,'GV gỡ bài ('||(p_data->>'category')||'): '||why,'emergency_removed',cor);
  return '{"ok":true}';
 end if;

 if cor.id is null or (p_data->>'correction_id')::uuid is distinct from cor.id or (p_data->>'round')::int is distinct from cor.round or (p_data->>'version')::int is distinct from cor.version then raise exception 'Yêu cầu đã thay đổi; hãy tải lại';end if;
 select * into rr from public.homework_correction_rounds where correction_id=cor.id and round=cor.round for update;
 if p_action in('correction_save','correction_submit','withdraw') and n.author_id<>a.id then raise exception 'Chỉ tác giả phản hồi' using errcode='42501';end if;
 stamp:=clock_timestamp();
 if cor.status='awaiting_author' and rr.due_at<=stamp then
  perform homework_private.expire_corrections(c);
  return jsonb_build_object('ok',false,'expired',true,'message','Đã hết hạn chỉnh sửa 72 giờ; bài đã được System gỡ.');
 end if;
 if p_action='withdraw' then
  if length(why) not between 1 and 2000 then raise exception 'Xin rút bài cần lý do';end if;
  perform homework_private.correction_delete(n,a.id,'Tác giả xin rút bài: '||why,'withdrawn_by_author',cor);
  return '{"ok":true}';
 elsif p_action in('correction_save','correction_submit') then
  if cor.status<>'awaiting_author' then raise exception 'Revision đã gửi; chờ GV xác nhận';end if;
  payload:=homework_private.validate_revision(n,p_data->'revision_data');
  update public.homework_correction_rounds set draft=payload,submitted_at=case when p_action='correction_submit' then stamp else null end where correction_id=cor.id and round=cor.round;
  update public.homework_corrections set status=case when p_action='correction_submit' then 'awaiting_teacher' else status end,version=version+1 where id=cor.id returning * into cor;
  perform homework_private.moderation_event(c,n.id,a.id,case when p_action='correction_submit' then 'revision_submitted' else 'revision_saved' end,null,cor.id,cor.round);
  return to_jsonb(cor)||jsonb_build_object('ok',true);
 elsif p_action='correction_decide' then
  if cor.status<>'awaiting_teacher' or rr.submitted_at is null then raise exception 'Chưa có revision gửi lại';end if;
  if p_data->>'decision' is null or p_data->>'decision' not in('approved','rejected') then raise exception 'Quyết định không hợp lệ';end if;
  if p_data->>'decision'='rejected' and length(why) not between 1 and 2000 then raise exception 'Chưa đạt cần lý do';end if;
  update public.homework_correction_rounds set decided_by=a.id,decided_at=clock_timestamp(),decision=p_data->>'decision',decision_reason=nullif(why,'')where correction_id=cor.id and round=cor.round;
  perform homework_private.moderation_event(c,n.id,a.id,'correction_'||(p_data->>'decision'),why,cor.id,cor.round);
  if p_data->>'decision'='approved' then
   payload:=homework_private.validate_revision(n,rr.draft);
   out_data:=homework_private.apply_correction(n,payload,a.id);
   update public.homework_corrections set status='approved',closed_at=clock_timestamp(),version=version+1 where id=cor.id;
   perform homework_private.notify_author(n,'approved','GV xác nhận chỉnh sửa đạt. Bài vẫn phải qua kiểm tra nội dung trùng theo quy định.');
   return out_data;
  elsif cor.round=1 then
   stamp:=clock_timestamp();
   insert into public.homework_correction_rounds(correction_id,round,requested_by,requested_at,due_at,issue_types,reason,draft)values(cor.id,2,a.id,stamp,stamp+interval '72 hours',rr.issue_types,why,rr.draft);
   update public.homework_corrections set round=2,status='awaiting_author',version=version+1 where id=cor.id returning * into cor;
   perform homework_private.moderation_event(c,n.id,a.id,'round_2_opened',why,cor.id,cor.round);
   perform homework_private.notify_author(n,'round_2','Lần chỉnh sửa cuối. Bạn có 72 giờ mới để gửi lại GV. '||why);
   return to_jsonb(cor);
  else
   perform homework_private.correction_delete(n,null,'Không đạt sau lần chỉnh sửa cuối. '||why,'rejected_final',cor);
   return '{"ok":true}';
  end if;
 end if;
 raise exception 'Thao tác không hợp lệ';
end $$;

create or replace function homework_private.hard_delete(c uuid, a profiles, p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare n public.homework_notices; last_review public.homework_duplicate_reviews; target uuid:=(p->>'id')::uuid;
 reason_text text:=regexp_replace(coalesce(p->>'hard_delete_reason',''),'^[[:space:]]+|[[:space:]]+$','','g');
begin
 if a.role::text<>'admin' then raise exception 'Chỉ Admin được xóa vĩnh viễn' using errcode='42501';end if;
 if p->'confirm_irreversible' is distinct from 'true'::jsonb or jsonb_typeof(p->'hard_delete_reason') is distinct from 'string' or length(reason_text) not between 1 and 500 then raise exception 'Cần xác nhận không thể hoàn tác và lý do từ 1 đến 500 ký tự';end if;
 if exists(select 1 from jsonb_object_keys(p) k where k not in('class_id','id','confirm_irreversible','hard_delete_reason')) then raise exception 'Payload hard delete không hợp lệ';end if;
 -- Caller holds the common class transaction lock; re-read locked row after any restore.
 select * into n from public.homework_notices where id=target and class_id=c for update;
 if n.id is null then
 if exists(select 1 from public.homework_tombstones where notice_id=target and class_id=c)then return '{"ok":true,"already_deleted":true}';end if;
 raise exception 'Không tìm thấy bài';end if;
 if n.status<>'deleted' or n.deleted_at is null or not ((n.deleted_actor_type='user' and n.deleted_by is not null) or (n.deleted_actor_type='system' and n.deleted_by is null)) then raise exception 'Chỉ xóa vĩnh viễn bài đã soft-delete';end if;
 select * into last_review from (
 select rv.* from public.homework_duplicate_reviews rv where (rv.notice_id=n.id or rv.candidate_id=n.id) and rv.decision is not null
 union all
 select (jsonb_populate_record(null::public.homework_duplicate_reviews,ev.after_data)).* from public.homework_contribution_events ev
 where ev.notice_id=n.id and ev.event_type='duplicate_reference_redacted' and ev.after_data->>'decision' is not null
 ) decisions order by decided_at desc nulls last,id desc nulls last limit 1;
 -- This insert is a mandatory gate; any later error also rolls the entire transaction back.
 insert into public.homework_tombstones(notice_id,class_id,author_id,subject_id,english_group_id,original_created_at,original_published_at,final_status,soft_deleted_at,soft_deleted_by,soft_delete_actor_type,soft_delete_reason,hard_deleted_by,hard_delete_reason,was_duplicate,last_decision,decided_at,decided_by)
 values(n.id,c,n.author_id,n.subject_id,n.english_group_id,n.created_at,n.published_at,n.previous_status,n.deleted_at,n.deleted_by,n.deleted_actor_type,n.delete_reason,a.id,reason_text,
 n.duplicate_of is not null or n.duplicate_tombstone_id is not null or n.previous_status in('pending_duplicate_review','duplicate_rejected','replaced') or exists(select 1 from public.homework_duplicate_reviews where (notice_id=n.id and (candidate_id is not null or candidate_tombstone_id is not null or decision is not null)) or candidate_id=n.id) or exists(select 1 from public.homework_contribution_events where notice_id=n.id and event_type='duplicate_reference_redacted'),last_review.decision,last_review.decided_at,last_review.decided_by);
 -- Preserve other notice identities/decisions while irreversibly redacting comparison details.
 update public.homework_notices set duplicate_of=null,duplicate_tombstone_id=n.id where duplicate_of=n.id;
 update public.homework_duplicate_reviews set candidate_id=null,candidate_tombstone_id=n.id,score=null,reason=null,decision_reason=null where candidate_id=n.id and notice_id<>n.id;
 update public.homework_contribution_events set before_data=null,after_data=jsonb_build_object('redacted_notice_id',n.id)
 where notice_id is distinct from n.id and (position(n.id::text in coalesce(before_data::text,''))>0 or position(n.id::text in coalesce(after_data::text,''))>0);
 -- If the deleted notice owns a comparison, its surviving target still needs a
 -- minimal decision trace. No score, reason, content, deadline or prompt survives.
 insert into public.homework_contribution_events(class_id,notice_id,actor_id,event_type,after_data)
 select o.class_id,o.id,a.id,'duplicate_reference_redacted',jsonb_build_object('redacted_notice_id',n.id,'decision',rv.decision,'decided_at',rv.decided_at,'decided_by',rv.decided_by)
 from public.homework_duplicate_reviews rv join public.homework_notices o on o.id=rv.candidate_id where rv.notice_id=n.id and o.id<>n.id;
 delete from public.homework_notice_reactions where notice_id=n.id;
 delete from public.homework_notice_reminders where notice_id=n.id;
 delete from public.homework_notifications where notice_id=n.id;
 delete from public.homework_duplicate_reviews where notice_id=n.id;
 delete from public.homework_contribution_events where notice_id=n.id;
 delete from public.homework_notices where id=n.id;
 perform homework_private.backlog(c);
 return '{"ok":true}';
end$function$;

-- Maintenance remains server-only; no human UUID is supplied or impersonated.
alter function public.homework_maintenance() rename to homework_maintenance_v4;
alter function public.homework_maintenance_v4() set schema homework_private;
create function public.homework_maintenance() returns void language plpgsql security definer set search_path=pg_catalog,public as $$
declare c uuid;begin
 for c in select distinct class_id from public.homework_corrections where status='awaiting_author' order by class_id loop
  perform homework_private.expire_corrections(c);
 end loop;
 perform homework_private.homework_maintenance_v4();
end $$;

revoke all on all functions in schema homework_private from public,anon,authenticated;
revoke all on function public.homework_api(text,jsonb) from public,anon;
grant execute on function public.homework_api(text,jsonb) to authenticated;
revoke all on function public.homework_maintenance() from public,anon,authenticated;
grant execute on function public.homework_maintenance() to service_role;
-- Existing server job is replaced by name, avoiding duplicate schedulers.
-- Eligibility is exactly requested_at + 72 hours; cron processes eligible rows
-- on its next minute tick. Resubmission enforces the boundary synchronously.
do $$ begin
 if to_regnamespace('cron') is not null then
  execute $q$select cron.schedule('homework-backlog-feat001','* * * * *','select public.homework_maintenance()')$q$;
 end if;
end $$;
commit;
