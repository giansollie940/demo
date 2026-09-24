-- FEAT-004. Apply after 07. Entire upgrade is atomic, including preflight.
begin;
lock table public.classes, public.class_subjects in access exclusive mode;
do $$declare missing jsonb; ambiguous jsonb; begin
 select jsonb_agg(jsonb_build_object('class_id',id,'code',code,'name',name)) into missing
 from public.classes where id<>'4e0b25e4-ec47-4745-8b2b-ba91c1504254'::uuid;
 if missing is not null then raise exception 'FEAT-004 explicit grade mapping required: %',missing;end if;
 -- Same normalized label with differing canonical metadata requires Product review.
 select jsonb_agg(to_jsonb(x)) into ambiguous from (
 select lower(trim(name)) label,array_agg(id) subject_ids from public.class_subjects
 group by lower(trim(name)) having count(distinct (name,short_name,icon,is_english))>1
 )x;
 if ambiguous is not null then raise exception 'FEAT-004 ambiguous subject mapping: %',ambiguous;end if;
end$$;
alter table public.classes add column grade smallint;
update public.classes set grade=7 where id='4e0b25e4-ec47-4745-8b2b-ba91c1504254';
alter table public.classes alter column grade set not null;
alter table public.classes add constraint classes_grade_v1 check(grade between 6 and 12);
create function homework_private.immutable_grade() returns trigger language plpgsql set search_path=pg_catalog,public as $$
begin if new.grade is distinct from old.grade then raise exception 'Đổi khối lớp cần flow riêng';end if;return new;end$$;
create trigger classes_immutable_grade before update of grade on public.classes for each row execute function homework_private.immutable_grade();
create index classes_grade_scope on public.classes(grade,id);
create table public.grade_subject_catalog(
 id uuid primary key default gen_random_uuid(),grade smallint not null check(grade between 6 and 12),
 name text not null check(length(trim(name)) between 1 and 100),short_name text not null default '' check(length(short_name)<=40),
 icon text not null default '📚' check(length(icon) between 1 and 40),sort_order integer not null default 0,
 is_active boolean not null default true,is_english boolean not null default false,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(grade,name)
);
alter table public.grade_subject_catalog enable row level security;
revoke all on public.grade_subject_catalog from public,anon,authenticated;
insert into public.grade_subject_catalog(grade,name,short_name,icon,is_english,sort_order)
 select c.grade,s.name,s.short_name,s.icon,s.is_english,min(s.sort_order)
 from public.class_subjects s join public.classes c on c.id=s.class_id group by c.grade,s.name,s.short_name,s.icon,s.is_english;
alter table public.class_subjects add column catalog_subject_id uuid references public.grade_subject_catalog(id);
update public.class_subjects s set catalog_subject_id=g.id from public.classes c,public.grade_subject_catalog g
 where c.id=s.class_id and g.grade=c.grade and (g.name,g.short_name,g.icon,g.is_english)=(s.name,s.short_name,s.icon,s.is_english);
alter table public.class_subjects alter column catalog_subject_id set not null;
create index class_subjects_catalog on public.class_subjects(catalog_subject_id,class_id);
create index homework_history_scope on public.homework_notices(class_id,created_at desc,author_id,status);
create index homework_audit_scope on public.homework_contribution_events(class_id,created_at desc,actor_id,event_type);
create table public.homework_catalog_events(
 id uuid primary key default gen_random_uuid(),grade smallint not null,actor_id uuid not null references public.profiles(id),
 event_type text not null default 'catalog_save',catalog_id uuid not null references public.grade_subject_catalog(id),
 before_data jsonb,after_data jsonb,created_at timestamptz not null default now()
);
alter table public.homework_catalog_events enable row level security;
revoke all on public.homework_catalog_events from public,anon,authenticated;
-- Enforce relation and canonical metadata even for privileged callers.
create function homework_private.class_subject_catalog_guard() returns trigger language plpgsql set search_path=pg_catalog,public as $$
declare g public.grade_subject_catalog; cg smallint;begin
 select * into g from public.grade_subject_catalog where id=new.catalog_subject_id for share;
 select grade into cg from public.classes where id=new.class_id;
 if g.id is null or cg is distinct from g.grade then raise exception 'Môn không thuộc khối của lớp';end if;
 if tg_op='UPDATE' and (new.class_id is distinct from old.class_id or new.catalog_subject_id is distinct from old.catalog_subject_id) then raise exception 'Không đổi liên kết môn lớp';end if;
 if (tg_op='INSERT' or (new.is_active and not old.is_active)) and not g.is_active then raise exception 'Môn catalog đã ngừng hoạt động';end if;
 new.name:=g.name;new.short_name:=g.short_name;new.icon:=g.icon;new.is_english:=g.is_english;
 return new;end$$;
create trigger class_subject_catalog_guard before insert or update on public.class_subjects for each row execute function homework_private.class_subject_catalog_guard();
create or replace function homework_private.actor(p_class uuid) returns public.profiles language plpgsql security definer set search_path=pg_catalog,public as $$
declare a public.profiles;begin
 select * into a from public.profiles where id=auth.uid() and active and deleted_at is null;
 if a.id is null then raise exception 'Phiên đăng nhập không hợp lệ' using errcode='42501';end if;
 if not exists(select 1 from public.classes where id=p_class and (active or a.role::text='admin')) then raise exception 'Lớp không hoạt động';end if;
 if a.role::text='admin' then return a;end if;
 if a.role::text='teacher' and exists(select 1 from public.class_teachers where class_id=p_class and teacher_id=a.id and active) then return a;end if;
 if a.role::text in('student','monitor') and a.class_id=p_class then return a;end if;
 raise exception 'Bạn không có quyền trong lớp này' using errcode='42501';end$$;

-- Move the old dispatcher out of exposed schemas; it must not remain a bypass API.
alter function public.homework_api(text,jsonb) set schema homework_private;
alter function homework_private.homework_api(text,jsonb) rename to api_v3;
revoke all on function homework_private.api_v3(text,jsonb) from public,anon,authenticated;
create function public.homework_api(p_action text,p_data jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare a public.profiles;c uuid:=nullif(p_data->>'class_id','')::uuid;g public.grade_subject_catalog;
 s public.class_subjects;rid uuid:=nullif(p_data->>'id','')::uuid;gr integer:=nullif(p_data->>'grade','')::integer;
 out_data jsonb;before_json jsonb;scope uuid[];lim integer:=least(100,greatest(1,coalesce((p_data->>'limit')::int,100)));
 offst integer:=greatest(0,coalesce((p_data->>'offset')::int,0));start_at timestamptz:=nullif(p_data->>'from','')::timestamptz;
 end_at timestamptz:=nullif(p_data->>'to','')::timestamptz;who uuid:=nullif(p_data->>'actor_id','')::uuid;
 state text:=nullif(p_data->>'status','');event text:=nullif(p_data->>'event_type','');
begin
 select * into a from public.profiles where id=auth.uid() and active and deleted_at is null;
 if a.id is null then raise exception 'Cần đăng nhập' using errcode='42501';end if;
 if gr is not null and gr not between 6 and 12 then raise exception 'Khối không hợp lệ';end if;
 if p_action='context' then
 return jsonb_build_object('weeks',coalesce((select jsonb_agg(jsonb_build_object('id',w.id,'school_year_id',w.school_year_id,'week_number',w.week_number) order by w.start_date)from public.weeks w where a.role::text='admin' or exists(select 1 from public.classes x where x.school_year_id=w.school_year_id and x.active and ((a.role::text='teacher' and exists(select 1 from public.class_teachers t where t.class_id=x.id and t.teacher_id=a.id and t.active))or(a.role::text in('student','monitor') and a.class_id=x.id)))),'[]'),'grades',jsonb_build_array(6,7,8,9,10,11,12),'classes',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'code',x.code,'name',x.name,'grade',x.grade,'active',x.active,'school_year_id',x.school_year_id) order by x.grade,x.code,x.id)
 from public.classes x where a.role::text='admin' or (x.active and ((a.role::text='teacher' and exists(select 1 from public.class_teachers t where t.class_id=x.id and t.teacher_id=a.id and t.active))or(a.role::text in('student','monitor') and a.class_id=x.id)))),'[]'));
 end if;
 if p_action in('catalog_list','catalog_save','oversight') then
 if a.role::text<>'admin' then raise exception 'Chỉ Admin được giám sát/catalog' using errcode='42501';end if;
 if c is not null and not exists(select 1 from public.classes where id=c and (gr is null or grade=gr)) then raise exception 'Khối/lớp không khớp';end if;
 if p_action='catalog_list' then return coalesce((select jsonb_agg(to_jsonb(x) order by grade,sort_order,name) from public.grade_subject_catalog x where gr is null or x.grade=gr),'[]');end if;
 if p_action='catalog_save' then
 if exists(select 1 from jsonb_object_keys(p_data) k where k not in('class_id','id','grade','name','short_name','icon','sort_order','is_active','is_english')) then raise exception 'Payload catalog không hợp lệ';end if;
 if gr is null then raise exception 'Cần chọn khối';end if;
 -- Catalog edits and class activation share row locks; no inactive activation race.
 if rid is not null then
 select * into g from public.grade_subject_catalog where id=rid and grade=gr for update;
 if not found then raise exception 'Không tìm thấy môn catalog';end if;before_json:=to_jsonb(g);
 if g.is_english is distinct from coalesce((p_data->>'is_english')::boolean,g.is_english) and exists(select 1 from public.class_subjects cs where cs.catalog_subject_id=rid and (exists(select 1 from public.homework_notices n where n.subject_id=cs.id)or exists(select 1 from public.homework_tombstones t where t.subject_id=cs.id))) then raise exception 'Môn đã có lịch sử; giữ nguyên loại Tiếng Anh';end if;
 update public.grade_subject_catalog set name=trim(p_data->>'name'),short_name=coalesce(p_data->>'short_name',short_name),icon=coalesce(p_data->>'icon',icon),sort_order=coalesce((p_data->>'sort_order')::int,sort_order),is_active=coalesce((p_data->>'is_active')::boolean,is_active),is_english=coalesce((p_data->>'is_english')::boolean,is_english),updated_at=now() where id=rid returning * into g;
 else
 insert into public.grade_subject_catalog(grade,name,short_name,icon,sort_order,is_active,is_english) values(gr,trim(p_data->>'name'),coalesce(p_data->>'short_name',''),coalesce(p_data->>'icon','📚'),coalesce((p_data->>'sort_order')::int,0),coalesce((p_data->>'is_active')::boolean,true),coalesce((p_data->>'is_english')::boolean,false)) returning * into g;rid:=g.id;
 end if;
 update public.class_subjects set name=g.name,short_name=g.short_name,icon=g.icon,is_english=g.is_english,updated_at=now() where catalog_subject_id=rid;
 insert into public.homework_catalog_events(grade,actor_id,catalog_id,before_data,after_data)values(gr,a.id,rid,before_json,to_jsonb(g));
 perform homework_private.audit(cs.class_id,null,a.id,'catalog_save',before_json,to_jsonb(g)) from (select distinct class_id from public.class_subjects where catalog_subject_id=rid)cs;
 return to_jsonb(g);
 end if;
 select coalesce(array_agg(id),'{}'::uuid[])into scope from public.classes where (c is null or id=c)and(gr is null or grade=gr);
 if start_at is not null and end_at is not null and start_at>=end_at then raise exception 'Khoảng thời gian không hợp lệ';end if;
 out_data:=jsonb_build_object('metrics',(select jsonb_build_object('published',count(*)filter(where status='published'),'week',count(*)filter(where published_at>=date_trunc('week',now() at time zone 'Asia/Ho_Chi_Minh') at time zone 'Asia/Ho_Chi_Minh' and status='published'),'pending',count(*)filter(where homework_private.actionable(n)),'deleted',count(*)filter(where status='deleted'),'contributors',count(distinct author_id)filter(where status='published' and exists(select 1 from public.profiles p where p.id=n.author_id and p.role::text in('student','monitor'))))from public.homework_notices n where class_id=any(scope)),
 'hearts',(select count(*)from public.homework_notice_reactions r join public.homework_notices n on n.id=r.notice_id where n.class_id=any(scope)and n.status='published'));
 return out_data||jsonb_build_object(
 'history',coalesce((select jsonb_agg(row_data order by happened desc,id)from(
 select n.id,n.created_at happened,homework_private.card(n,a.id) row_data from public.homework_notices n where n.class_id=any(scope)and(who is null or n.author_id=who)and(state is null or n.status=state)and(start_at is null or n.created_at>=start_at)and(end_at is null or n.created_at<end_at)
 union all select t.notice_id,t.original_created_at,to_jsonb(t)||jsonb_build_object('id',t.notice_id,'status','hard_deleted','marker','[Đã xóa vĩnh viễn]')from public.homework_tombstones t where t.class_id=any(scope)and(who is null or t.author_id=who)and(state is null or state='hard_deleted')and(start_at is null or t.original_created_at>=start_at)and(end_at is null or t.original_created_at<end_at)
 order by happened desc,id limit lim offset offst)x),'[]'),
 'audit',coalesce((select jsonb_agg(x.row_data order by x.created_at desc,x.id)from(
 select *from(
 select e.id,e.class_id,e.actor_id,e.event_type,e.created_at,to_jsonb(e)row_data from public.homework_contribution_events e where e.class_id=any(scope)
 union all select t.notice_id,t.class_id,t.hard_deleted_by,'hard_delete',t.hard_deleted_at,jsonb_build_object('id',t.notice_id,'class_id',t.class_id,'actor_id',t.hard_deleted_by,'event_type','hard_delete','created_at',t.hard_deleted_at,'before_data',null,'after_data',to_jsonb(t))from public.homework_tombstones t where t.class_id=any(scope)
 )e where (who is null or e.actor_id=who)and(event is null or e.event_type=event)and(start_at is null or e.created_at>=start_at)and(end_at is null or e.created_at<end_at)order by created_at desc,id limit lim offset offst)x),'[]'),
 'catalog_audit',coalesce((select jsonb_agg(to_jsonb(x)order by x.created_at desc,x.id)from(select *from public.homework_catalog_events e where c is null and(gr is null or e.grade=gr)and(who is null or e.actor_id=who)and(event is null or e.event_type=event)and(start_at is null or e.created_at>=start_at)and(end_at is null or e.created_at<end_at)order by created_at desc,id limit lim offset offst)x),'[]'),
 'trash',coalesce((select jsonb_agg(row_data order by deleted_at desc,id)from(select n.id,n.deleted_at,homework_private.card(n,a.id)||jsonb_build_object('delete_reason',n.delete_reason)row_data from public.homework_notices n where n.class_id=any(scope)and status='deleted'order by n.deleted_at desc,n.id limit lim offset offst)x),'[]'),
 'people',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.full_name)order by p.full_name)from public.profiles p where p.class_id=any(scope)or p.id in(select actor_id from public.homework_contribution_events where class_id=any(scope))or p.id in(select hard_deleted_by from public.homework_tombstones where class_id=any(scope))or(c is null and p.id in(select actor_id from public.homework_catalog_events where gr is null or grade=gr))),'[]'));
 end if;
 -- Lock assignment/class rows so deactivation cannot race an authorized mutation.
 perform 1 from public.classes where id=c for share;
 if a.role::text='teacher' then perform 1 from public.class_teachers where class_id=c and teacher_id=a.id for share;end if;
 a:=homework_private.actor(c);
 if p_action='subject_save' then
 if a.role::text<>'teacher' then raise exception 'Chỉ Teacher được cấu hình môn lớp' using errcode='42501';end if;
 if exists(select 1 from jsonb_object_keys(p_data) k where k not in('class_id','id','catalog_subject_id','sort_order','is_active')) then raise exception 'Chỉ sửa thứ tự/trạng thái môn lớp';end if;
 select *into g from public.grade_subject_catalog where id=(p_data->>'catalog_subject_id')::uuid and grade=(select grade from public.classes where id=c)for share;
 if not found then raise exception 'Catalog không thuộc khối lớp';end if;
 perform pg_advisory_xact_lock(hashtextextended('homework:'||c::text,0));
 if rid is null then select *into s from public.class_subjects where class_id=c and catalog_subject_id=g.id order by created_at,id limit 1;rid:=s.id;
 else select *into s from public.class_subjects where id=rid and class_id=c and catalog_subject_id=g.id;if not found then raise exception 'Môn không thuộc lớp/catalog';end if;end if;
 before_json:=case when s.id is null then null else to_jsonb(s)end;
 if rid is null then insert into public.class_subjects(class_id,catalog_subject_id,name,sort_order,is_active)values(c,g.id,g.name,coalesce((p_data->>'sort_order')::int,g.sort_order),coalesce((p_data->>'is_active')::boolean,true))returning id into rid;
 else update public.class_subjects set sort_order=coalesce((p_data->>'sort_order')::int,sort_order),is_active=coalesce((p_data->>'is_active')::boolean,is_active),updated_at=now()where id=rid;end if;
 perform homework_private.audit(c,null,a.id,'subject_save',before_json,(select to_jsonb(x)from public.class_subjects x where id=rid));return jsonb_build_object('id',rid);
 end if;
 out_data:=homework_private.api_v3(p_action,p_data);
 if p_action='load' and a.role::text='teacher' then out_data:=out_data||jsonb_build_object('history',coalesce((select jsonb_agg(homework_private.card(n,a.id) order by n.created_at desc,n.id)from public.homework_notices n where n.class_id=c),'[]'),'catalog',coalesce((select jsonb_agg(to_jsonb(cat) order by cat.sort_order,cat.name)from public.grade_subject_catalog cat where cat.is_active and cat.grade=(select grade from public.classes where id=c)),'[]'));end if;
 return out_data;
end$$;
revoke all on all functions in schema homework_private from public,anon,authenticated;
revoke all on function public.homework_api(text,jsonb) from public,anon;
grant execute on function public.homework_api(text,jsonb) to authenticated;
commit;
