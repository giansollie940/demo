-- FEAT-001. Additive migration for the supplied V9 compatible database.
-- Run once after existing V8.8.0 / recycle-bin migrations. No existing rows are changed.
begin;
create schema if not exists homework_private;
revoke all on schema homework_private from public,anon,authenticated;
create table public.class_subjects (
 id uuid primary key default gen_random_uuid(), class_id uuid not null references public.classes(id),
 name text not null check(length(trim(name)) between 1 and 100),short_name text not null default '',icon text not null default '📚',
 sort_order int not null default 0,is_english boolean not null default false,is_active boolean not null default true,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(id,class_id)
);
create table public.english_groups (
 id uuid primary key default gen_random_uuid(),class_id uuid not null references public.classes(id),
 school_year_id uuid not null references public.school_years(id),name text not null check(length(trim(name)) between 1 and 100),
 is_active boolean not null default true,created_at timestamptz not null default now(),unique(id,class_id)
);
create table public.english_group_members (
 id uuid primary key default gen_random_uuid(),english_group_id uuid not null references public.english_groups(id),
 student_id uuid not null references public.profiles(id),school_year_id uuid not null references public.school_years(id),
 joined_at timestamptz not null default now(),left_at timestamptz
);
create unique index homework_one_current_group on public.english_group_members(student_id,school_year_id) where left_at is null;
create table public.homework_settings (
 class_id uuid primary key references public.classes(id),seed_threshold int not null default 3 check(seed_threshold>0),
 pending_threshold int not null default 70, reject_threshold int not null default 90,
 check(pending_threshold between 1 and 99 and reject_threshold>pending_threshold and reject_threshold<=100)
);
create table public.homework_admin_preferences (
 admin_id uuid primary key references public.profiles(id),alert_level text not null default 'system' check(alert_level in('system','backlog','all'))
);
create table public.homework_notices (
 id uuid primary key default gen_random_uuid(),class_id uuid not null references public.classes(id),
 school_year_id uuid not null references public.school_years(id),subject_id uuid not null,
 english_group_id uuid,author_id uuid not null references public.profiles(id),
 title text not null check(length(trim(title)) between 1 and 200),content text not null check(length(trim(content)) between 1 and 6000),
 due_at timestamptz not null check(isfinite(due_at)),
 status text not null default 'pending_duplicate_review' check(status in('published','pending_duplicate_review','duplicate_rejected','replaced','deleted')),
 duplicate_of uuid references public.homework_notices(id),published_at timestamptz,created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),pending_since timestamptz not null default now(),revision int not null default 1,
 deleted_at timestamptz,deleted_by uuid references public.profiles(id),delete_reason text,previous_status text,
 request_id uuid not null,unique(author_id,request_id),
 foreign key(subject_id,class_id) references public.class_subjects(id,class_id),
 foreign key(english_group_id,class_id) references public.english_groups(id,class_id),check(duplicate_of is distinct from id)
);
create index homework_feed on public.homework_notices(class_id,status,due_at);
create index homework_candidates on public.homework_notices(class_id,subject_id,english_group_id,due_at);
create table public.homework_notice_reactions (
 notice_id uuid not null references public.homework_notices(id),user_id uuid not null references public.profiles(id),
 created_at timestamptz not null default now(),primary key(notice_id,user_id)
);
create table public.homework_duplicate_reviews (
 id uuid primary key default gen_random_uuid(),notice_id uuid not null references public.homework_notices(id),
 revision int not null,candidate_id uuid references public.homework_notices(id),score numeric check(score between 0 and 100),
 reason text,decision text check(decision in('keep_existing','replace_existing','keep_both')),
 decided_by uuid references public.profiles(id),decision_reason text,created_at timestamptz not null default now(),decided_at timestamptz,
 unique(notice_id,revision)
);
create table public.homework_notice_reminders (
 id uuid primary key default gen_random_uuid(),notice_id uuid not null references public.homework_notices(id),
 sent_by uuid not null references public.profiles(id),sent_at timestamptz not null default now()
);
create index homework_reminder_actor on public.homework_notice_reminders(sent_by,sent_at);
create index homework_reminder_notice on public.homework_notice_reminders(notice_id,sent_at);
create table public.homework_contribution_events (
 id uuid primary key default gen_random_uuid(),class_id uuid not null references public.classes(id),notice_id uuid references public.homework_notices(id),
 actor_id uuid references public.profiles(id),event_type text not null,before_data jsonb,after_data jsonb,created_at timestamptz not null default now()
);
create table public.homework_notifications (
 id uuid primary key default gen_random_uuid(),class_id uuid not null references public.classes(id),recipient_id uuid not null references public.profiles(id),
 notice_id uuid references public.homework_notices(id),kind text not null,title text not null,message text not null,
 is_read boolean not null default false,created_at timestamptz not null default now()
);
create table public.homework_backlog_state (
 class_id uuid primary key references public.classes(id),active boolean not null default false,last_alert_at timestamptz
);
-- RLS default-deny + explicit revokes. All reads/writes use checked RPCs;
-- no broad table SELECT exposes AI details to monitors or students.
do $$declare t text;begin
 foreach t in array array['class_subjects','english_groups','english_group_members','homework_settings','homework_admin_preferences','homework_notices','homework_notice_reactions','homework_duplicate_reviews','homework_notice_reminders','homework_contribution_events','homework_notifications','homework_backlog_state'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 end loop;
end$$;
create function homework_private.actor(p_class uuid) returns public.profiles language plpgsql security definer set search_path=pg_catalog,public as $$
declare a public.profiles;begin
 select * into a from public.profiles where id=auth.uid() and active and deleted_at is null;
 if a.id is null then raise exception 'Phiên đăng nhập không hợp lệ' using errcode='42501';end if;
 if not exists(select 1 from public.classes where id=p_class and active) then raise exception 'Lớp không hoạt động';end if;
 if a.role::text='admin' then return a;end if;
 if a.role::text='teacher' and exists(select 1 from public.class_teachers where class_id=p_class and teacher_id=a.id and active) then return a;end if;
 if a.role::text in('student','monitor') and a.class_id=p_class then return a;end if;
 raise exception 'Bạn không có quyền trong lớp này' using errcode='42501';end$$;
create function homework_private.visible(n public.homework_notices,a public.profiles) returns boolean language sql stable set search_path=pg_catalog,public as $$
 select a.role::text in('admin','teacher','monitor') or n.english_group_id is null or exists(
 select 1 from public.english_group_members m where m.english_group_id=n.english_group_id and m.student_id=a.id and m.left_at is null)
$$;
create function homework_private.card(n public.homework_notices,p_user uuid) returns jsonb language sql stable set search_path=pg_catalog,public as $$
 select jsonb_build_object('id',n.id,'class_id',n.class_id,'subject_id',n.subject_id,'english_group_id',n.english_group_id,
 'author_id',n.author_id,'author_name',p.full_name,'author_role',p.role,'title',n.title,'content',n.content,'due_at',n.due_at,
 'status',n.status,'created_at',n.created_at,'updated_at',n.updated_at,'published_at',n.published_at,'revision',n.revision,
 'subject',s.name,'icon',s.icon,'english_group',g.name,'duplicate_of',n.duplicate_of,
 'hearts',(select count(*) from public.homework_notice_reactions r where r.notice_id=n.id),
 'liked',exists(select 1 from public.homework_notice_reactions r where r.notice_id=n.id and r.user_id=p_user),
 'can_retry',n.status='pending_duplicate_review' and not exists(select 1 from public.homework_duplicate_reviews rv where rv.notice_id=n.id and rv.revision=n.revision and (rv.score is not null or rv.decision is not null))
 and exists(select 1 from public.profiles actor where actor.id=p_user and (actor.id=n.author_id or (actor.role::text in('teacher','admin') and p.role::text in('student','monitor')))))
 from public.profiles p join public.class_subjects s on s.id=n.subject_id left join public.english_groups g on g.id=n.english_group_id where p.id=n.author_id
$$;
-- BR-025: explicit allow-list; changes to the full card never broaden monitor data.
create function homework_private.queue_card(n public.homework_notices) returns jsonb language sql stable set search_path=pg_catalog,public as $$
 select jsonb_build_object('id',n.id,'subject',s.name,'english_group',g.name,
 'title',n.title,'content',n.content,'due_at',n.due_at,'author_name',p.full_name,
 'author_role',p.role,'created_at',n.created_at,'status',n.status)
 from public.profiles p join public.class_subjects s on s.id=n.subject_id
 left join public.english_groups g on g.id=n.english_group_id where p.id=n.author_id
$$;
create function homework_private.audit(c uuid,n uuid,a uuid,e text,b jsonb default null,v jsonb default null) returns void language sql set search_path=pg_catalog,public as $$
 insert into public.homework_contribution_events(class_id,notice_id,actor_id,event_type,before_data,after_data)values(c,n,a,e,b,v)
$$;
create function homework_private.notify_managers(c uuid,n uuid,k text,msg text) returns void language plpgsql set search_path=pg_catalog,public as $$
begin
 if k='system' then
 insert into public.homework_notifications(class_id,recipient_id,notice_id,kind,title,message)
 select c,p.id,n,k,'Báo bài — cần kiểm tra hệ thống',msg from public.profiles p where p.role::text='admin' and p.active and p.deleted_at is null;
 else
 insert into public.homework_notifications(class_id,recipient_id,notice_id,kind,title,message)
 select c,p.id,n,k,'Báo bài',msg from public.profiles p join public.class_teachers ct on ct.teacher_id=p.id
 where ct.class_id=c and ct.active and p.active and p.deleted_at is null and p.role::text='teacher';
 if not found then perform homework_private.notify_managers(c,n,'system','Lớp không có giáo viên đang hoạt động phụ trách Báo bài.');end if;
 insert into public.homework_notifications(class_id,recipient_id,notice_id,kind,title,message) select c,p.id,n,k,'Báo bài',msg from public.profiles p join public.homework_admin_preferences pref on pref.admin_id=p.id where p.role::text='admin' and p.active and p.deleted_at is null and pref.alert_level='all';
 end if;
end$$;
create function homework_private.backlog(c uuid) returns void language plpgsql set search_path=pg_catalog,public as $$
declare b public.homework_backlog_state; qty int;begin
 insert into public.homework_backlog_state(class_id)values(c)on conflict do nothing;
 select * into b from public.homework_backlog_state where class_id=c for update;
 select count(*) into qty from public.homework_notices where class_id=c and status='pending_duplicate_review' and pending_since<=now()-interval '24 hours';
 if qty<5 then update public.homework_backlog_state set active=false where class_id=c;return;end if;
 if not b.active or b.last_alert_at is null or b.last_alert_at<=now()-interval '24 hours' then
 insert into public.homework_notifications(class_id,recipient_id,kind,title,message)
 select c,p.id,'backlog','Báo bài tồn đọng',qty||' bài đã chờ giáo viên từ 24 giờ.' from public.profiles p join public.homework_admin_preferences pref on pref.admin_id=p.id
 where p.role::text='admin' and p.active and p.deleted_at is null and pref.alert_level in('backlog','all');
 if found then update public.homework_backlog_state set active=true,last_alert_at=now() where class_id=c;end if;
 end if;
end$$;
-- A class-level transaction lock is shared by every homework mutation and AI
-- finalization. It serializes hearts/review/restore/reminders without a lost update.
create function public.homework_api(p_action text,p_data jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare c uuid:=(p_data->>'class_id')::uuid; a public.profiles; n public.homework_notices; old public.homework_notices;
 s public.class_subjects; g public.english_groups; y uuid; rid uuid; target uuid; r jsonb; before_json jsonb;
 st public.homework_settings; decision text; pending boolean; win_start timestamptz;win_end timestamptz;wk public.weeks;
begin
 a:=homework_private.actor(c);
 perform pg_advisory_xact_lock(hashtextextended('homework:'||c::text,0));
 select school_year_id into y from public.classes where id=c;
 insert into public.homework_settings(class_id)values(c)on conflict do nothing;
 select * into st from public.homework_settings where class_id=c;
 if p_action in('load','inbox') then
 perform homework_private.backlog(c);
 if p_action='inbox' then return coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from (select id,title,message,kind,notice_id,is_read,created_at from public.homework_notifications hn where recipient_id=a.id and class_id=c and (hn.notice_id is null or exists(select 1 from public.homework_notices x where x.id=hn.notice_id and homework_private.visible(x,a) and (x.status='published' or a.role::text in('teacher','admin')))) order by created_at desc limit 100)x),'[]');end if;
 select start_date::timestamp at time zone 'Asia/Ho_Chi_Minh',(end_date+1)::timestamp at time zone 'Asia/Ho_Chi_Minh' into win_start,win_end from public.school_years where id=y;
 if nullif(p_data->>'week_id','') is not null then
 select * into wk from public.weeks where id=(p_data->>'week_id')::uuid and school_year_id=y;
 if wk.id is null then raise exception 'Tuần không thuộc năm học';end if;
 win_start:=wk.start_date::timestamp at time zone 'Asia/Ho_Chi_Minh';win_end:=(wk.end_date+1)::timestamp at time zone 'Asia/Ho_Chi_Minh';
 end if;
 r:=jsonb_build_object('settings',jsonb_build_object('seed_threshold',st.seed_threshold),
 'subjects',coalesce((select jsonb_agg(to_jsonb(x) order by x.sort_order,x.name)from public.class_subjects x where x.class_id=c),'[]'),
 'groups',coalesce((select jsonb_agg(to_jsonb(x) order by x.name)from public.english_groups x where x.class_id=c and (a.role::text<>'student' or exists(select 1 from public.english_group_members m where m.english_group_id=x.id and m.student_id=a.id and m.left_at is null))),'[]'),
 'notices',coalesce((select jsonb_agg(homework_private.card(x,a.id) order by x.due_at,x.created_at)from public.homework_notices x where x.class_id=c and x.status='published' and homework_private.visible(x,a)),'[]'),
 'history',coalesce((select jsonb_agg(homework_private.card(x,a.id) order by x.created_at desc)from public.homework_notices x where x.class_id=c and x.author_id=a.id),'[]'),
 'queue','[]'::jsonb,'trash','[]'::jsonb,'audit','[]'::jsonb,'members','[]'::jsonb,'learners','[]'::jsonb);
 if a.role::text in('monitor','teacher','admin') then
 r:=r||jsonb_build_object('queue',coalesce((select jsonb_agg((case when a.role::text='monitor' then homework_private.queue_card(x) else homework_private.card(x,a.id) end)||jsonb_build_object('candidate',case when a.role::text='monitor' then homework_private.queue_card(o) else homework_private.card(o,a.id) end)||
 case when a.role::text in('teacher','admin') then jsonb_build_object('score',rv.score,'reason',rv.reason,'decision',rv.decision)else '{}'::jsonb end order by x.pending_since)
 from public.homework_notices x left join public.homework_notices o on o.id=x.duplicate_of left join public.homework_duplicate_reviews rv on rv.notice_id=x.id and rv.revision=x.revision
 where x.class_id=c and (x.status='pending_duplicate_review' or (a.role::text in('teacher','admin') and x.status='duplicate_rejected'))),'[]'));
 end if;
 if a.role::text in('teacher','admin') then
 r:=r||jsonb_build_object('settings',to_jsonb(st),
 'trash',coalesce((select jsonb_agg(homework_private.card(x,a.id)||jsonb_build_object('delete_reason',x.delete_reason) order by x.deleted_at desc)from public.homework_notices x where x.class_id=c and x.status='deleted'),'[]'),
 'audit',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc)from (select * from public.homework_contribution_events where class_id=c order by created_at desc limit 300)x),'[]'),
 'members',coalesce((select jsonb_agg(to_jsonb(m)) from public.english_group_members m join public.english_groups eg on eg.id=m.english_group_id where eg.class_id=c and m.left_at is null),'[]'),
 'learners',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.full_name))from public.profiles p where p.class_id=c and p.active and p.deleted_at is null and p.role::text in('student','monitor')),'[]'));
 end if;
 -- Independent rankings; current validity is authoritative, timestamps attribute
 -- each event to its original week. No derived point total or weekly reset.
 r:=r||jsonb_build_object('leaderboard',coalesce((select jsonb_agg(to_jsonb(l))from (
 with counts as(select p.id,p.full_name,
 (select count(*) from public.homework_notices x where x.author_id=p.id and x.class_id=c and x.status='published' and x.published_at>=win_start and x.published_at<win_end) notices,
 (select count(*) from public.homework_notice_reactions hr join public.homework_notices x on x.id=hr.notice_id where x.author_id=p.id and x.class_id=c and x.status='published' and hr.created_at>=win_start and hr.created_at<win_end) hearts,
 (select count(*) from public.homework_notices x where x.author_id=p.id and x.class_id=c and x.school_year_id=y and x.status='published') year_notices,
 (select x.published_at from public.homework_notices x where x.author_id=p.id and x.class_id=c and x.school_year_id=y and x.status='published' order by x.published_at,x.id offset (st.seed_threshold-1) limit 1) seed_at
 from public.profiles p where p.class_id=c and p.role::text in('student','monitor'))
 select *,dense_rank()over(order by notices desc) notice_rank,dense_rank()over(order by hearts desc) heart_rank from counts)l),'[]'),
 'notifications',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc)from (select id,title,message,kind,notice_id,is_read,created_at from public.homework_notifications hn where recipient_id=a.id and class_id=c and (hn.notice_id is null or exists(select 1 from public.homework_notices x where x.id=hn.notice_id and homework_private.visible(x,a) and (x.status='published' or a.role::text in('teacher','admin')))) order by created_at desc limit 100)x),'[]'));
 if a.role::text='admin' then r:=r||jsonb_build_object('alert_level',coalesce((select alert_level from public.homework_admin_preferences where admin_id=a.id),'system'),
 'health',jsonb_build_object('total',(select count(*)from public.homework_notices where class_id=c),'pending',(select count(*)from public.homework_notices where class_id=c and status='pending_duplicate_review')));end if;
 return r;
 elsif p_action='read_notification' then update public.homework_notifications set is_read=true where id=(p_data->>'id')::uuid and recipient_id=a.id and class_id=c;return '{"ok":true}';
 elsif p_action='settings' then
 if a.role::text<>'admin' then raise exception 'Chỉ Admin được đổi cấu hình thi đua' using errcode='42501';end if;
 if exists(select 1 from jsonb_object_keys(p_data) k where k not in('class_id','seed_threshold')) then raise exception 'Chỉ ngưỡng Mầm xanh được cấu hình';end if;
 update public.homework_settings set seed_threshold=(p_data->>'seed_threshold')::int where class_id=c;
 perform homework_private.audit(c,null,a.id,'settings',to_jsonb(st),p_data);return '{"ok":true}';
 elsif p_action='ai_settings' then
 if a.role::text<>'admin' then raise exception 'Chỉ Admin được đổi cấu hình AI' using errcode='42501';end if;
 update public.homework_settings set pending_threshold=(p_data->>'pending_threshold')::int,reject_threshold=(p_data->>'reject_threshold')::int where class_id=c;
 perform homework_private.audit(c,null,a.id,'ai_settings',to_jsonb(st),p_data);return '{"ok":true}';
 elsif p_action='alert_settings' then
 if a.role::text<>'admin' then raise exception 'Chỉ Admin được đổi cảnh báo' using errcode='42501';end if;
 insert into public.homework_admin_preferences(admin_id,alert_level)values(a.id,p_data->>'alert_level')on conflict(admin_id)do update set alert_level=excluded.alert_level;
 perform homework_private.audit(c,null,a.id,'alert_settings',null,p_data);return '{"ok":true}';
 elsif p_action in('subject_save','group_save','group_assign') then
 if a.role::text not in('admin','teacher') then raise exception 'Chỉ giáo viên/Admin được cấu hình' using errcode='42501';end if;
 if p_action='subject_save' then
 rid:=nullif(p_data->>'id','')::uuid;
 if rid is null then insert into public.class_subjects(class_id,name,short_name,icon,sort_order,is_english)values(c,trim(p_data->>'name'),coalesce(p_data->>'short_name',''),coalesce(p_data->>'icon','📚'),coalesce((p_data->>'sort_order')::int,0),coalesce((p_data->>'is_english')::boolean,false))returning id into rid;
 else
 select * into s from public.class_subjects where id=rid and class_id=c;
 if s.id is null then raise exception 'Không tìm thấy môn';end if;
 if s.is_english is distinct from coalesce((p_data->>'is_english')::boolean,s.is_english) and exists(select 1 from public.homework_notices where subject_id=rid)then raise exception 'Môn đã có bài; hãy tạo môn mới để giữ lịch sử';end if;
 update public.class_subjects set name=trim(p_data->>'name'),short_name=coalesce(p_data->>'short_name',short_name),icon=coalesce(p_data->>'icon',icon),sort_order=coalesce((p_data->>'sort_order')::int,sort_order),is_english=coalesce((p_data->>'is_english')::boolean,is_english),is_active=coalesce((p_data->>'is_active')::boolean,is_active),updated_at=now()where id=rid;
 end if;
 elsif p_action='group_save' then
 rid:=nullif(p_data->>'id','')::uuid;
 if rid is null then insert into public.english_groups(class_id,school_year_id,name)values(c,y,trim(p_data->>'name'))returning id into rid;
 else update public.english_groups set name=trim(p_data->>'name'),is_active=coalesce((p_data->>'is_active')::boolean,is_active)where id=rid and class_id=c;if not found then raise exception 'Không tìm thấy nhóm';end if;end if;
 else
 target:=(p_data->>'student_id')::uuid;rid:=(p_data->>'english_group_id')::uuid;
 if not exists(select 1 from public.profiles where id=target and class_id=c and active and role::text in('student','monitor'))or not exists(select 1 from public.english_groups where id=rid and class_id=c and school_year_id=y and is_active)then raise exception 'Nhóm/học sinh không hợp lệ';end if;
 update public.english_group_members set left_at=now()where student_id=target and school_year_id=y and left_at is null;
 insert into public.english_group_members(english_group_id,student_id,school_year_id)values(rid,target,y);
 end if;
 perform homework_private.audit(c,null,a.id,p_action,null,p_data);return jsonb_build_object('id',rid);
 end if;
 if p_action='submit' then
 rid:=nullif(p_data->>'id','')::uuid;
 if rid is not null then
 select * into old from public.homework_notices where id=rid and class_id=c;
 if old.id is null or old.status in('deleted','replaced') then raise exception 'Không thể sửa bài này';end if;
 if old.author_id<>a.id and not(a.role::text in('admin','teacher','monitor') and exists(select 1 from public.profiles where id=old.author_id and role::text in('student','monitor')))then raise exception 'Không có quyền sửa bài' using errcode='42501';end if;
 -- Monitor cannot alter pending/rejected cases through the edit endpoint.
 if a.role::text='monitor' and old.author_id<>a.id and old.status<>'published' then raise exception 'Cán sự chỉ được xem case đang chờ' using errcode='42501';end if;
 if not homework_private.visible(old,a) then raise exception 'Ngoài nhóm Tiếng Anh' using errcode='42501';end if;
 if (p_data->>'revision')::int is distinct from old.revision then raise exception 'Bài đã thay đổi; hãy tải lại';end if;
 end if;
 select * into s from public.class_subjects where id=(p_data->>'subject_id')::uuid and class_id=c and is_active;
 if s.id is null then raise exception 'Môn không hoạt động';end if;
 target:=nullif(p_data->>'english_group_id','')::uuid;
 if s.is_english then
 select * into g from public.english_groups where id=target and class_id=c and school_year_id=y and is_active;
 if g.id is null then raise exception 'Cần chọn nhóm Tiếng Anh';end if;
 if a.role::text='student' and not exists(select 1 from public.english_group_members where student_id=a.id and english_group_id=g.id and left_at is null)then raise exception 'Ngoài nhóm Tiếng Anh' using errcode='42501';end if;
 elsif target is not null then raise exception 'Môn này không dùng nhóm Tiếng Anh';end if;
 if rid is null then
 insert into public.homework_notices(class_id,school_year_id,subject_id,english_group_id,author_id,title,content,due_at,request_id)
 values(c,y,s.id,target,a.id,trim(p_data->>'title'),trim(p_data->>'content'),(p_data->>'due_at')::timestamptz,(p_data->>'request_id')::uuid)
 on conflict(author_id,request_id)do nothing returning * into n;
 if n.id is null then select * into n from public.homework_notices where author_id=a.id and request_id=(p_data->>'request_id')::uuid;
 if n.class_id<>c then raise exception 'Request không thuộc lớp';end if;return homework_private.card(n,a.id);end if;
 else
 before_json:=to_jsonb(old);
 -- Only whitespace-only text edits with a <24h deadline shift skip semantic
 -- review. Any other text change is classified by server AI before restoring
 -- publication. The prior publication timestamp and reactions are preserved.
 pending:=old.status<>'published' or s.id<>old.subject_id or target is distinct from old.english_group_id
 or abs(extract(epoch from ((p_data->>'due_at')::timestamptz-old.due_at)))>=86400
 or regexp_replace(trim(p_data->>'title'),'\s+',' ','g')<>regexp_replace(old.title,'\s+',' ','g')
 or regexp_replace(trim(p_data->>'content'),'\s+',' ','g')<>regexp_replace(old.content,'\s+',' ','g');
 update public.homework_notices set subject_id=s.id,english_group_id=target,title=trim(p_data->>'title'),content=trim(p_data->>'content'),due_at=(p_data->>'due_at')::timestamptz,
 revision=revision+1,updated_at=now(),pending_since=case when pending then now()else pending_since end,status=case when pending then 'pending_duplicate_review'else status end,duplicate_of=case when pending then null else duplicate_of end
 where id=rid returning * into n;
 end if;
 perform homework_private.audit(c,n.id,a.id,'submit',before_json,to_jsonb(n));
 return homework_private.card(n,a.id);
 end if;
 select * into n from public.homework_notices where id=(p_data->>'id')::uuid and class_id=c;
 if n.id is null then raise exception 'Không tìm thấy bài';end if;
 if not homework_private.visible(n,a) and n.author_id<>a.id then raise exception 'Ngoài nhóm Tiếng Anh' using errcode='42501';end if;
 before_json:=to_jsonb(n);
 if p_action='retry' then
 -- Retry reuses the existing edit permission; no content/status/revision change.
 if not homework_private.visible(n,a) or (n.author_id<>a.id and not(a.role::text in('teacher','admin') and exists(select 1 from public.profiles where id=n.author_id and role::text in('student','monitor'))))then raise exception 'Không có quyền kiểm tra lại bài' using errcode='42501';end if;
 if n.status<>'pending_duplicate_review' then return homework_private.card(n,a.id);end if;
 if not exists(select 1 from public.homework_duplicate_reviews rv where rv.notice_id=n.id and rv.revision=n.revision and (rv.score is not null or rv.decision is not null))then
 perform homework_private.audit(c,n.id,a.id,'ai_retry_requested',null,jsonb_build_object('revision',n.revision));end if;
 return homework_private.card(n,a.id);
 elsif p_action='heart' then
 if n.status<>'published' or not homework_private.visible(n,a)then raise exception 'Bài không nhận tim';end if;
 if n.author_id=a.id then raise exception 'Không được tự thả tim';end if;
 if (p_data->>'liked')::boolean then insert into public.homework_notice_reactions(notice_id,user_id)values(n.id,a.id)on conflict do nothing;
 else delete from public.homework_notice_reactions where notice_id=n.id and user_id=a.id;end if;
 if found then perform homework_private.audit(c,n.id,a.id,case when (p_data->>'liked')::boolean then 'heart_received'else 'heart_removed'end);end if;
 elsif p_action='remind' then
 if a.role::text not in('admin','teacher','monitor')then raise exception 'Không có quyền nhắc' using errcode='42501';end if;
 if n.status<>'published' then raise exception 'Chỉ nhắc bài đã công bố';end if;
 -- Cross-class actor quota has its own lock, always after class lock.
 perform pg_advisory_xact_lock(hashtextextended('homework-reminder-actor:'||a.id::text,0));
 if (select count(*)from public.homework_notice_reminders where notice_id=n.id and sent_at>now()-interval '24 hours')>=2
 or exists(select 1 from public.homework_notice_reminders where notice_id=n.id and sent_at>now()-interval '6 hours')
 or (select count(*)from public.homework_notice_reminders where sent_by=a.id and sent_at>now()-interval '24 hours')>=10 then raise exception 'Đã đạt giới hạn nhắc: 2 lần/bài/24 giờ, cách 6 giờ; 10 lần/người/24 giờ';end if;
 insert into public.homework_notice_reminders(notice_id,sent_by)values(n.id,a.id);
 insert into public.homework_notifications(class_id,recipient_id,notice_id,kind,title,message)
 select c,p.id,n.id,'reminder','🔔 Nhắc học tập',n.title||' — hạn '||to_char(n.due_at at time zone 'Asia/Ho_Chi_Minh','HH24:MI DD/MM/YYYY')from public.profiles p
 where p.class_id=c and p.active and p.deleted_at is null and p.role::text in('student','monitor')and homework_private.visible(n,p);
 perform homework_private.audit(c,n.id,a.id,'reminder');
 elsif p_action='delete' then
 if n.author_id<>a.id and not(a.role::text in('admin','teacher','monitor') and exists(select 1 from public.profiles where id=n.author_id and role::text in('student','monitor')))then raise exception 'Không có quyền xóa bài' using errcode='42501';end if;
 if a.role::text='monitor' and n.author_id<>a.id and n.status<>'published' then raise exception 'Cán sự chỉ được xem case đang chờ' using errcode='42501';end if;
 if length(trim(coalesce(p_data->>'reason','')))=0 then raise exception 'Cần lý do xóa';end if;
 if n.status='deleted' then return '{"ok":true}';end if;
 update public.homework_notices set previous_status=status,status='deleted',deleted_at=now(),deleted_by=a.id,delete_reason=trim(p_data->>'reason'),revision=revision+1,updated_at=now()where id=n.id;
 perform homework_private.audit(c,n.id,a.id,'notice_invalidated',before_json,p_data);
 elsif p_action='restore' then
 if a.role::text not in('admin','teacher')then raise exception 'Không có quyền khôi phục' using errcode='42501';end if;
 if n.status<>'deleted' then raise exception 'Bài không trong thùng rác';end if;
 -- Never resurrect a replaced/rejected post as published. A formerly published
 -- post is rechecked if the board changed while deleted.
 update public.homework_notices set status=case when previous_status='published' and exists(select 1 from public.homework_notices x where x.id<>n.id and x.class_id=c and x.subject_id=n.subject_id and x.english_group_id is not distinct from n.english_group_id and x.status='published' and abs(extract(epoch from(x.due_at-n.due_at)))<=86400 and not exists(select 1 from public.homework_duplicate_reviews rv where rv.decision='keep_both' and ((rv.notice_id=x.id and rv.candidate_id=n.id)or(rv.notice_id=n.id and rv.candidate_id=x.id)) and not exists(select 1 from public.homework_contribution_events ev where ev.notice_id in(x.id,n.id) and ev.event_type='submit' and ev.created_at>rv.decided_at)))then 'pending_duplicate_review'else coalesce(previous_status,'pending_duplicate_review')end,
 deleted_at=null,deleted_by=null,delete_reason=null,revision=revision+1,pending_since=now(),updated_at=now()where id=n.id;
 perform homework_private.audit(c,n.id,a.id,'notice_restored',before_json,null);
 elsif p_action='review' then
 if a.role::text not in('admin','teacher')then raise exception 'Không có quyền quyết định AI' using errcode='42501';end if;
 if n.status not in('pending_duplicate_review','duplicate_rejected')then raise exception 'Case đã được xử lý';end if;
 decision:=p_data->>'decision';
 if decision is null or decision not in('keep_existing','replace_existing','keep_both')then raise exception 'Quyết định không hợp lệ';end if;
 select * into old from public.homework_notices where id=n.duplicate_of and class_id=c;
 if decision='keep_both' and length(trim(coalesce(p_data->>'reason','')))=0 then raise exception 'Giữ cả hai cần lý do';end if;
 if old.id is null then
 raise exception 'Chưa có kết quả so sánh hợp lệ; bài tiếp tục chờ kiểm tra';
 else
 if old.status<>'published' then raise exception 'Bài gốc đã thay đổi; cần kiểm tra AI lại';end if;
 if decision='replace_existing' then update public.homework_notices set status='replaced',revision=revision+1,updated_at=now()where id=old.id;
 perform homework_private.audit(c,old.id,a.id,'notice_replaced',to_jsonb(old),jsonb_build_object('replacement',n.id));end if;
 end if;
 update public.homework_notices set status=case when decision='keep_existing'then 'duplicate_rejected'else 'published'end,
 published_at=case when decision='keep_existing'then published_at else coalesce(published_at,now())end,updated_at=now()where id=n.id;
 insert into public.homework_duplicate_reviews(notice_id,revision,candidate_id,decision,decided_by,decision_reason,decided_at)
 values(n.id,n.revision,n.duplicate_of,decision,a.id,p_data->>'reason',now())on conflict(notice_id,revision)do update set decision=excluded.decision,decided_by=excluded.decided_by,decision_reason=excluded.decision_reason,decided_at=now();
 perform homework_private.audit(c,n.id,a.id,'review_'||decision,before_json,p_data);
 else raise exception 'Thao tác không hợp lệ';end if;
 perform homework_private.backlog(c);return '{"ok":true}';
end$$;
create function homework_private.candidates(n public.homework_notices) returns jsonb language sql stable set search_path=pg_catalog,public as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'title',x.title,'content',x.content,'due_at',x.due_at,'revision',x.revision,'status',x.status,'published_at',x.published_at,'created_at',x.created_at)
 order by (x.published_at is null),x.published_at,x.created_at,x.id),'[]')from public.homework_notices x
 where x.id<>n.id and x.class_id=n.class_id and x.subject_id=n.subject_id and x.english_group_id is not distinct from n.english_group_id
 and x.status in('published','pending_duplicate_review') and abs(extract(epoch from(x.due_at-n.due_at)))<=86400
 -- A later unreviewed submission cannot suppress an earlier submission.
 and (x.published_at is not null or (x.created_at,x.id)<(n.created_at,n.id))
$$;
create function public.homework_ai(p_action text,p_data jsonb)returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare n public.homework_notices; cand jsonb; score numeric; candidate uuid; st public.homework_settings; final_state text; old jsonb;begin
 select * into n from public.homework_notices where id=(p_data->>'id')::uuid;
 if n.id is null then raise exception 'Không tìm thấy bài';end if;
 perform pg_advisory_xact_lock(hashtextextended('homework:'||n.class_id::text,0));
 select * into n from public.homework_notices where id=n.id;
 if n.status<>'pending_duplicate_review' then return jsonb_build_object('done',true,'status',n.status);end if;
 -- An error attempt (no score/decision) is retryable, not a completed review.
 if exists(select 1 from public.homework_duplicate_reviews rv where rv.notice_id=n.id and rv.revision=n.revision and (rv.score is not null or rv.decision is not null))then return jsonb_build_object('done',true,'status',n.status);end if;
 cand:=homework_private.candidates(n);
 select * into st from public.homework_settings where class_id=n.class_id;
 if p_action='snapshot' then
 select before_data into old from public.homework_contribution_events where notice_id=n.id and event_type='submit' order by created_at desc,id desc limit 1;
 return jsonb_build_object('notice',to_jsonb(n),'previous',old,'candidates',cand,'fingerprint',md5(cand::text),'settings',to_jsonb(st));
 elsif p_action='finish' then
 if n.revision is distinct from (p_data->>'revision')::int or md5(cand::text) is distinct from (p_data->>'fingerprint') then return '{"stale":true}';end if;

 if not exists(select 1 from public.profiles where id=n.author_id and active and deleted_at is null) or not exists(select 1 from public.classes where id=n.class_id and active) then
 insert into public.homework_duplicate_reviews(notice_id,revision,reason)values(n.id,n.revision,'Tài khoản hoặc lớp đã ngừng hoạt động trong lúc AI xử lý.')on conflict(notice_id,revision)do update set reason=excluded.reason;
 perform homework_private.audit(n.class_id,n.id,null,'ai_authorization_changed');
 return '{"status":"pending_duplicate_review"}';
 end if;
 if p_data->>'error' is not null then
 insert into public.homework_duplicate_reviews(notice_id,revision,reason)values(n.id,n.revision,'AI tạm thời không xử lý được; có thể thử kiểm tra lại.')on conflict(notice_id,revision)do update set reason=excluded.reason;
 perform homework_private.audit(n.class_id,n.id,null,'ai_error',null,jsonb_build_object('code',left(p_data->>'error',80)));
 perform homework_private.notify_managers(n.class_id,n.id,'system','AI Báo bài lỗi; nội dung đã lưu và đang chờ giáo viên.');
 perform homework_private.notify_managers(n.class_id,n.id,'pending','Có Báo bài chưa được AI kiểm tra.');return '{"status":"pending_duplicate_review"}';
 end if;
 score:=(p_data->>'score')::numeric;candidate:=nullif(p_data->>'candidate_id','')::uuid;
 if score is null or score<0 or score>100 or (score>=st.pending_threshold and candidate is null)then raise exception 'Kết quả AI không hợp lệ';end if;
 if candidate is not null and not exists(select 1 from jsonb_array_elements(cand)x where (x->>'id')::uuid=candidate)then raise exception 'Candidate ngoài snapshot';end if;
 final_state:=case when score>=st.reject_threshold then 'duplicate_rejected'when score>=st.pending_threshold then 'pending_duplicate_review'else 'published'end;
 update public.homework_notices set status=final_state,duplicate_of=case when score>=st.pending_threshold then candidate else null end,
 published_at=case when final_state='published'then coalesce(published_at,now())else published_at end,updated_at=now()where id=n.id;
 insert into public.homework_duplicate_reviews(notice_id,revision,candidate_id,score,reason)values(n.id,n.revision,candidate,score,left(p_data->>'reason',2000))on conflict(notice_id,revision)do update set candidate_id=excluded.candidate_id,score=excluded.score,reason=excluded.reason;
 perform homework_private.audit(n.class_id,n.id,null,'ai_'||final_state,to_jsonb(n),jsonb_build_object('score',score,'candidate',candidate));
 if final_state in('published','pending_duplicate_review')then perform homework_private.notify_managers(n.class_id,n.id,final_state,case when final_state='published'then 'Có Báo bài mới: 'else 'Có bài nghi trùng: 'end||n.title);end if;
 perform homework_private.backlog(n.class_id);return jsonb_build_object('status',final_state);
 end if;raise exception 'Thao tác AI không hợp lệ';end$$;
create function public.homework_maintenance()returns void language plpgsql security definer set search_path=pg_catalog,public as $$
declare c uuid;begin
 for c in select id from public.classes where active loop
 perform pg_advisory_xact_lock(hashtextextended('homework:'||c::text,0));perform homework_private.backlog(c);
 end loop;
end$$;
-- Privileged helpers are never client-callable, including through schema access.
revoke all on all functions in schema homework_private from public,anon,authenticated;
revoke all on function public.homework_api(text,jsonb) from public,anon;
grant execute on function public.homework_api(text,jsonb) to authenticated;
revoke all on function public.homework_ai(text,jsonb),public.homework_maintenance() from public,anon,authenticated;
grant execute on function public.homework_ai(text,jsonb),public.homework_maintenance() to service_role;
-- Install scheduler when pg_cron is already available; manual setup is described
-- in the release instructions when this extension is not installed.
do $$begin
 if to_regnamespace('cron') is not null then
 execute $q$select cron.schedule('homework-backlog-feat001','*/10 * * * *','select public.homework_maintenance()')$q$;
 end if;
end$$;
commit;
