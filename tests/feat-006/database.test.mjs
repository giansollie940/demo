import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { setup as baseline,seed,rpc,ids,classId } from '../feat-005/fixture.mjs';
async function setup(){const db=await baseline();try{await db.exec(await readFile(new URL('../../database/upgrade/10-FEAT-006-HOMEWORK-MEDIA.sql',import.meta.url),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
// FEAT008_UPGRADE proves installing FEAT-008 changes nothing until an Admin
// configures a capacity: the whole FEAT-006 suite must still pass unchanged.
if(process.env.FEAT008_UPGRADE)await db.exec(await readFile(new URL('../../database/upgrade/11-FEAT-008-STORAGE-HEALTH.sql',import.meta.url),'utf8'));
// FEAT007_UPGRADE does the same for migration 12: until an Admin archives a
// year, the read-only guard must be invisible to every existing behaviour.
if(process.env.FEAT008_UPGRADE&&process.env.FEAT007_UPGRADE){await db.exec(`alter table public.school_years add column if not exists name text; alter table public.school_years add column if not exists is_active boolean not null default false; update public.school_years set name=coalesce(name,'nam-hoc'), is_active=true;`);await db.exec(await readFile(new URL('../../database/upgrade/12-FEAT-007-ARCHIVE-PURGE.sql',import.meta.url),'utf8'));}return db;}
async function media(db,user,action,p={}){await db.exec(`set role authenticated; set request.jwt.claim.sub='${user}'`);try{return (await db.query('select homework_media($1,$2::jsonb) r',[action,JSON.stringify({class_id:classId,...p})])).rows[0].r;}finally{await db.exec('reset role');}}
async function service(db,action,p={}){await db.exec('set role service_role');try{return (await db.query('select homework_media_service($1,$2::jsonb) r',[action,JSON.stringify(p)])).rows[0].r;}finally{await db.exec('reset role');}}
const meta={size_bytes:300000,width:1600,height:900,checksum:'a'.repeat(64)};
const rev=n=>Object.fromEntries(['subject_id','english_group_id','title','content','due_at'].map(k=>[k,n[k]]));
async function prepare(db,n,extra={}){return media(db,ids.s,'prepare',{notice_id:n.id,revision:n.revision,request_id:crypto.randomUUID(),...meta,...extra});}
async function seal(db,a){await media(db,ids.s,'ticket',{attachment_id:a.id});return service(db,'seal',{attachment_id:a.id,owner_id:ids.s});}
test('author pending upload is private, unsealed attachment cannot be committed, failure is retryable',async()=>{
 const db=await setup();try{const n=await seed(db),a=await prepare(db,n);
 assert.equal(a.status,'pending');assert.ok(a.object_key);assert.equal(a.owner_id,ids.s);
 for(const user of [ids.other,ids.m,ids.t,ids.a])await assert.rejects(media(db,user,'ticket',{attachment_id:a.id}));
 await assert.rejects(prepare(db,n,{width:1601}));await assert.rejects(prepare(db,n,{size_bytes:500001}));
 await assert.rejects(rpc(db,ids.s,'submit',{...n,attachment_id:a.id}));
 await seal(db,a);
 await assert.rejects(rpc(db,ids.s,'submit',{...n,title:'',attachment_id:a.id}));
 assert.equal((await media(db,ids.s,'ticket',{attachment_id:a.id})).status,'pending');
 const result=await rpc(db,ids.s,'submit',{...n,attachment_id:a.id});assert.equal(result.attachment_id,a.id);
 assert.equal((await media(db,ids.other,'read',{attachment_id:a.id})).object_key,a.object_key);
 await assert.rejects(media(db,ids.a,'prepare',{notice_id:n.id,...meta,request_id:crypto.randomUUID()}));
 }finally{await db.close();}
});
test('correction images stay private until approval; published and historical images survive soft deletion',async()=>{
 const db=await setup();try{let n=await seed(db);const first=await prepare(db,n);await seal(db,first);n=await rpc(db,ids.s,'submit',{...n,attachment_id:first.id});
 let c=await rpc(db,ids.t,'correction_request',{id:n.id,reason:'Sửa ảnh',issue_types:['content']});
 const second=await prepare(db,n,{correction_id:c.id,round:c.round,version:c.version});await seal(db,second);
 c=await rpc(db,ids.s,'correction_submit',{id:n.id,correction_id:c.id,round:c.round,version:c.version,revision_data:rev(n),attachment_id:second.id});
 for(const user of [ids.other,ids.m,ids.a])await assert.rejects(media(db,user,'read',{attachment_id:second.id}));
 assert.ok((await media(db,ids.t,'read',{attachment_id:second.id})).object_key);
 assert.equal((await rpc(db,ids.other,'load')).notices[0].attachment_id,first.id);
 n=await rpc(db,ids.t,'correction_decide',{id:n.id,correction_id:c.id,round:c.round,version:c.version,decision:'approved'});assert.equal(n.attachment_id,second.id);
 await rpc(db,ids.s,'delete',{id:n.id,reason:'test'});
 await assert.rejects(media(db,ids.other,'read',{attachment_id:second.id}));
 assert.ok((await media(db,ids.s,'read',{attachment_id:second.id})).object_key);
 assert.ok((await media(db,ids.s,'read',{attachment_id:first.id})).object_key);
 const removed=await rpc(db,ids.a,'hard_delete',{id:n.id,confirm_irreversible:true,hard_delete_reason:'test'});
 assert.equal(removed.media_cleanup,'queued');
 for(const user of [ids.s,ids.t,ids.a])await assert.rejects(media(db,user,'read',{attachment_id:second.id}));
 const jobs=await service(db,'jobs');assert.equal(jobs.length,2);
 assert.equal((await db.query('select count(*) n from homework_tombstones')).rows[0].n,1);
 }finally{await db.close();}
});
test('cancel and expiry enqueue durable cleanup; failures do not lose jobs; metadata removed only after final sweep',async()=>{
 const db=await setup();try{const n=await seed(db),a=await prepare(db,n);await media(db,ids.s,'ticket',{attachment_id:a.id});
 await media(db,ids.s,'cancel',{attachment_id:a.id});await assert.rejects(media(db,ids.s,'ticket',{attachment_id:a.id}));
 let jobs=await service(db,'jobs');assert.equal(jobs.length,1);
 await service(db,'ack',{attachment_id:a.id,token:jobs[0].token,success:false});assert.equal((await db.query('select count(*) n from homework_media_outbox')).rows[0].n,1);
 await db.exec("update homework_media_outbox set next_attempt_at=now()-interval '1 second',safe_after=now()-interval '1 second'");
 await service(db,'ack',{attachment_id:a.id,token:jobs[0].token,success:true});assert.equal((await db.query('select count(*) n from homework_attachments')).rows[0].n,0);
 const b=await prepare(db,n);await db.query("update homework_attachments set expires_at=now()-interval '1 second' where id=$1",[b.id]);
 jobs=await service(db,'jobs');assert.equal(jobs[0].id,b.id);
 await db.exec('set role authenticated');await assert.rejects(db.exec("select homework_media_service('jobs','{}')"),{code:'42501'});await db.exec('reset role');
 }finally{await db.close();}
});
test('new post retry keeps image and commits only once; image request cannot cross drafts or owners',async()=>{
 const db=await setup();try{const n=await seed(db),request_id=crypto.randomUUID();
 const a=await media(db,ids.s,'prepare',{...meta,request_id});await seal(db,a);
 const payload={...rev(n),title:'Bài mới',request_id,attachment_id:a.id,media_operation_id:crypto.randomUUID()};
 const first=await rpc(db,ids.s,'submit',payload);const second=await rpc(db,ids.s,'submit',payload);assert.equal(first.id,second.id);assert.equal(second.attachment_id,a.id);
 assert.equal((await rpc(db,ids.s,'submit',{...rev(n),request_id})).attachment_id,a.id);
 await assert.rejects(rpc(db,ids.other,'submit',{...rev(n),request_id:crypto.randomUUID(),attachment_id:a.id}));
 const b=await media(db,ids.s,'prepare',{...meta,request_id:crypto.randomUUID()});await seal(db,b);
 await assert.rejects(rpc(db,ids.s,'submit',{...rev(n),request_id:crypto.randomUUID(),attachment_id:b.id}));
 }finally{await db.close();}
});
test('RLS denies direct reads/mutations and service sealing; class revocation and English membership checked at read time',async()=>{
 const db=await setup();try{let n=await seed(db);const a=await prepare(db,n);await seal(db,a);n=await rpc(db,ids.s,'submit',{...n,attachment_id:a.id});
 for(const role of ['anon','authenticated']){
  await db.exec(`set role ${role}`);
  for(const table of ['homework_attachments','homework_notice_media','homework_media_history','homework_media_outbox','homework_media_receipts']){
   await assert.rejects(db.exec(`select * from ${table}`),{code:'42501'});await assert.rejects(db.exec(`delete from ${table}`),{code:'42501'});
  }
  await assert.rejects(db.exec("select homework_media_service('seal','{}')"),{code:'42501'});await db.exec('reset role');
 }
 const group=await rpc(db,ids.t,'group_save',{name:'E1'});
 await db.query('update homework_notices set english_group_id=$1 where id=$2',[group.id,n.id]);
 await assert.rejects(media(db,ids.other,'read',{attachment_id:a.id}),{code:'42501'});
 await rpc(db,ids.t,'group_assign',{student_id:ids.other,english_group_id:group.id});assert.ok(await media(db,ids.other,'read',{attachment_id:a.id}));
 await db.query('update class_teachers set active=false where teacher_id=$1',[ids.t]);await assert.rejects(media(db,ids.t,'read',{attachment_id:a.id}),{code:'42501'});
 await db.query('update profiles set class_id=null where id=$1',[ids.other]);await assert.rejects(media(db,ids.other,'read',{attachment_id:a.id}),{code:'42501'});
 }finally{await db.close();}
});
test('stale cleanup acknowledgement cannot delete a newly escalated hard-delete job',async()=>{
 const db=await setup();try{let n=await seed(db);const a=await prepare(db,n);await seal(db,a);n=await rpc(db,ids.s,'submit',{...n,attachment_id:a.id});
 await db.exec("update homework_media_outbox set next_attempt_at=now()-interval '1 second',safe_after=now()-interval '1 second'");
 const old=(await service(db,'jobs'))[0];assert.equal(old.kind,'staging');
 await rpc(db,ids.s,'delete',{id:n.id,reason:'test'});await rpc(db,ids.a,'hard_delete',{id:n.id,confirm_irreversible:true,hard_delete_reason:'test'});
 await service(db,'ack',{attachment_id:a.id,token:old.token,success:true});
 assert.equal((await db.query('select kind from homework_media_outbox where attachment_id=$1',[a.id])).rows[0].kind,'purge');
 }finally{await db.close();}
});
test('restore reuses image; pending duplicate stays private; forged class and removal of image preserve history',async()=>{
 const db=await setup();try{let n=await seed(db);const a=await prepare(db,n);await seal(db,a);n=await rpc(db,ids.s,'submit',{...n,attachment_id:a.id});
 await rpc(db,ids.s,'delete',{id:n.id,reason:'test'});await rpc(db,ids.t,'restore',{id:n.id});assert.equal((await rpc(db,ids.s,'load')).notices[0].attachment_id,a.id);
 await assert.rejects(media(db,ids.s,'read',{attachment_id:a.id,class_id:crypto.randomUUID()}));
 await db.query("update homework_notices set status='pending_duplicate_review' where id=$1",[n.id]);await assert.rejects(media(db,ids.other,'read',{attachment_id:a.id}));
 await db.query("update homework_notices set status='published' where id=$1",[n.id]);
 n=(await rpc(db,ids.s,'load')).notices.find(x=>x.id===n.id);n=await rpc(db,ids.s,'submit',{...n,attachment_id:null});assert.equal(n.attachment_id,null);
 assert.ok((await db.query('select 1 from homework_media_history where attachment_id=$1',[a.id])).rows.length);
 assert.ok((await media(db,ids.s,'read',{attachment_id:a.id})).object_key);
 }finally{await db.close();}
});
test('round two inherits private image and terminal System soft deletion preserves it until Admin hard delete',async()=>{
 const db=await setup();try{let n=await seed(db);let c=await rpc(db,ids.t,'correction_request',{id:n.id,reason:'Ảnh cần chỉnh',issue_types:['content']});
 const a=await prepare(db,n,{correction_id:c.id,round:c.round,version:c.version});await seal(db,a);
 const token=()=>({id:n.id,correction_id:c.id,round:c.round,version:c.version});
 const payload={...token(),revision_data:rev(n),attachment_id:a.id,media_operation_id:crypto.randomUUID()};
 c=await rpc(db,ids.s,'correction_submit',payload);const again=await rpc(db,ids.s,'correction_submit',payload);assert.equal(again.version,c.version);
 c=await rpc(db,ids.t,'correction_decide',{...token(),decision:'rejected',reason:'Chỉnh tiếp'});
 assert.equal((await db.query('select attachment_id from homework_correction_rounds where correction_id=$1 and round=2',[c.id])).rows[0].attachment_id,a.id);
 c=await rpc(db,ids.s,'correction_submit',{...token(),revision_data:rev(n)});await rpc(db,ids.t,'correction_decide',{...token(),decision:'rejected',reason:'Chưa đạt'});
 await assert.rejects(media(db,ids.a,'read',{attachment_id:a.id}));assert.ok(await media(db,ids.t,'read',{attachment_id:a.id}));
 const result=await rpc(db,ids.a,'hard_delete',{id:n.id,confirm_irreversible:true,hard_delete_reason:'test'});assert.equal(result.media_cleanup,'queued');
 assert.equal((await db.query('select soft_delete_actor_type from homework_tombstones where notice_id=$1',[n.id])).rows[0].soft_delete_actor_type,'system');
 }finally{await db.close();}
});
test('P1 Monitor published-image reads require active English membership; Teacher and Admin oversight unchanged',async()=>{
 const db=await setup();try{let n=await seed(db);const a=await prepare(db,n);await seal(db,a);n=await rpc(db,ids.s,'submit',{...n,attachment_id:a.id});
 // No English-group restriction for ordinary class notices.
 assert.ok(await media(db,ids.m,'read',{attachment_id:a.id}));
 const e1=await rpc(db,ids.t,'group_save',{name:'E1'}),e2=await rpc(db,ids.t,'group_save',{name:'E2'});
 await db.query('update homework_notices set english_group_id=$1 where id=$2',[e1.id,n.id]);
 await assert.rejects(media(db,ids.m,'read',{attachment_id:a.id}),{code:'42501'});
 await rpc(db,ids.t,'group_assign',{student_id:ids.m,english_group_id:e2.id});
 await assert.rejects(media(db,ids.m,'read',{attachment_id:a.id}),{code:'42501'});
 await rpc(db,ids.t,'group_assign',{student_id:ids.m,english_group_id:e1.id});
 assert.equal((await media(db,ids.m,'read',{attachment_id:a.id})).object_key,a.object_key);
 // Existing assignment API closes E1 membership when moving to E2.
 await rpc(db,ids.t,'group_assign',{student_id:ids.m,english_group_id:e2.id});
 await assert.rejects(media(db,ids.m,'read',{attachment_id:a.id}),{code:'42501'});
 for(const user of [ids.t,ids.a])assert.ok(await media(db,user,'read',{attachment_id:a.id}));
 assert.ok((await db.query('select 1 from english_group_members where student_id=$1 and english_group_id=$2 and left_at is not null',[ids.m,e1.id])).rows.length);
 }finally{await db.close();}
});
test('RC1 function-only upgrade preserves media data, denies Monitor bypass, and is repeatable',async()=>{
 const db=await setup();try{let n=await seed(db);const a=await prepare(db,n);await seal(db,a);n=await rpc(db,ids.s,'submit',{...n,attachment_id:a.id});
 const e1=await rpc(db,ids.t,'group_save',{name:'E1'});await db.query('update homework_notices set english_group_id=$1 where id=$2',[e1.id,n.id]);
 await db.exec(await readFile(new URL('./fixtures/rc1-media-function.sql',import.meta.url),'utf8'));
 assert.ok(await media(db,ids.m,'read',{attachment_id:a.id})); // reproduce exact RC1 behavior
 const before=(await db.query('select to_jsonb(x) data from homework_attachments x order by id')).rows;
 const visible=(await db.query("select pg_get_functiondef('homework_private.visible(public.homework_notices,public.profiles)'::regprocedure) definition")).rows;
 const patch=await readFile(new URL('../../deploy/feat-006/rc1-monitor-read-fix.sql',import.meta.url),'utf8');
 await db.exec(patch);await db.exec(patch);
 assert.deepEqual((await db.query('select to_jsonb(x) data from homework_attachments x order by id')).rows,before);
 assert.deepEqual((await db.query("select pg_get_functiondef('homework_private.visible(public.homework_notices,public.profiles)'::regprocedure) definition")).rows,visible);
 await assert.rejects(media(db,ids.m,'read',{attachment_id:a.id}),{code:'42501'});
 await db.exec('set role anon');await assert.rejects(db.query("select homework_media('read',$1::jsonb)",[JSON.stringify({class_id:classId,attachment_id:a.id})]),{code:'42501'});await db.exec('reset role');
 for(const user of [ids.t,ids.a])assert.ok(await media(db,user,'read',{attachment_id:a.id}));
 }finally{await db.close();}
});
