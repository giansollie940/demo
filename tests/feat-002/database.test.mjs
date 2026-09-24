import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createFixture,ids} from '../homework/fixture.mjs';
const db=await createFixture();
for(const file of ['05-FEAT-001-BAO-BAI.sql','06-FEAT-001-AI-RECOVERY.sql','07-FEAT-002-PERMISSIONS-LIFECYCLE.sql']){
 try {await db.exec(await readFile(new URL('../../database/upgrade/'+file,import.meta.url),'utf8'));} catch(e){if(e.code!=='ENOENT')throw e;}
}

if(process.env.FEAT004_UPGRADE)await db.exec(await readFile(new URL('../../database/upgrade/08-FEAT-004-MULTI-CLASS-CATALOG.sql',import.meta.url),'utf8'));
async function call(role,fn,action,p={}){
 await db.exec(`reset role; select set_config('request.jwt.claim.sub','${role}',false); set role ${fn==='homework_api'?'authenticated':'service_role'};`);
 try{return (await db.query(`select public.${fn}($1,$2::jsonb) result`,[action,JSON.stringify({class_id:ids.c,...p})])).rows[0].result;}finally{await db.exec('reset role');}
}
const rpc=(actor,action,p)=>call(actor,'homework_api',action,p);
const ai=(action,p)=>call(ids.a,'homework_ai',action,p);
const subject=process.env.FEAT004_UPGRADE?await rpc(ids.t,'subject_save',{catalog_subject_id:(await rpc(ids.a,'catalog_save',{grade:7,name:'KHTN'})).id}):await rpc(ids.t,'subject_save',{name:'KHTN'});
const payload={subject_id:subject.id,title:'Private title',content:'Private content',due_at:'2026-09-10T13:00:00Z'};
const make=(actor=ids.s,p={})=>rpc(actor,'submit',{...payload,request_id:crypto.randomUUID(),...p});
async function finish(n,score=0,candidate_id=null){const s=await ai('snapshot',{id:n.id});return ai('finish',{id:n.id,revision:s.notice.revision,fingerprint:s.fingerprint,score,candidate_id,reason:'SECRET_AI_REASON'});}
const hard=(id,p={})=>rpc(ids.a,'hard_delete',{id,confirm_irreversible:true,hard_delete_reason:' Remove test ',...p});
const settings={semantic_duplicate_enabled:true,duplicate_review_threshold:70,duplicate_auto_threshold:90};
await test('AC-202/204 Admin operational actions and other roles AI settings are denied by RPC',async()=>{
 for(const action of ['submit','subject_save','group_save','group_assign','retry','heart','remind','delete','restore','review','ai_settings'])
  await assert.rejects(rpc(ids.a,action,{...payload,...settings,name:'Forbidden',request_id:crypto.randomUUID()}),{code:'42501'},action);
 for(const actor of [ids.s,ids.m])await assert.rejects(rpc(actor,'ai_settings',settings),{code:'42501'});
});
await test('AC-203 AI settings Teacher only, strict validation, exact audit and no learner disclosure',async()=>{
 await rpc(ids.t,'ai_settings',settings);
 for(const patch of [{duplicate_review_threshold:90,duplicate_auto_threshold:70},{duplicate_auto_threshold:70},{duplicate_review_threshold:-1},{duplicate_auto_threshold:101},{duplicate_review_threshold:70.5},{duplicate_review_threshold:'70'},{semantic_duplicate_enabled:'false'},{model:'forbidden'},{duplicate_auto_threshold:null}])
  await assert.rejects(rpc(ids.t,'ai_settings',{...settings,...patch}));
 await rpc(ids.t,'ai_settings',{...settings,duplicate_review_threshold:0,duplicate_auto_threshold:100});
 const data=await rpc(ids.t,'load');assert.equal(data.ai_settings.duplicate_review_threshold,0);
 const event=data.audit.find(x=>x.event_type==='ai_settings');assert.equal(event.actor_id,ids.t);assert.ok(event.created_at);assert.deepEqual(event.before_data,settings);assert.equal(event.after_data.duplicate_auto_threshold,100);
 for(const actor of [ids.s,ids.m,ids.a]){const d=await rpc(actor,'load');assert.equal(d.ai_settings,undefined);assert.equal(d.settings.pending_threshold,undefined);}
 const noCandidates=await make(ids.s,{due_at:'2027-02-01T13:00:00Z'});assert.equal((await finish(noCandidates)).status,'published');
 await rpc(ids.t,'ai_settings',settings);
});
let original,pending;
await test('AC-206/207 deleted pending disappears from queue/inbox/count and returns on restore',async()=>{
 original=await make();await finish(original);pending=await make(ids.other);await finish(pending,80,original.id);
 assert.ok((await rpc(ids.t,'inbox')).some(x=>x.notice_id===pending.id));
 await rpc(ids.other,'delete',{id:pending.id,reason:'Wrong duplicate'});
 let t=await rpc(ids.t,'load');assert.ok(!t.queue.some(x=>x.id===pending.id));assert.ok(!t.notifications.some(x=>x.notice_id===pending.id));assert.ok(!(await rpc(ids.t,'inbox')).some(x=>x.notice_id===pending.id));
 assert.equal((await rpc(ids.a,'load')).health.pending,0);assert.ok(t.audit.some(x=>x.notice_id===pending.id));assert.ok((await rpc(ids.other,'load')).history.some(x=>x.id===pending.id));
 await rpc(ids.t,'restore',{id:pending.id});assert.ok((await rpc(ids.t,'load')).queue.some(x=>x.id===pending.id));
 const restored=await ai('snapshot',{id:pending.id});await ai('finish',{id:pending.id,revision:restored.notice.revision,fingerprint:restored.fingerprint,error:'TEMP_AFTER_RESTORE'});
 await assert.rejects(rpc(ids.t,'review',{id:pending.id,decision:'keep_both',reason:'Old comparison cannot bypass failed current revision'}));
 await finish(pending,80,original.id);await rpc(ids.t,'review',{id:pending.id,decision:'keep_both',reason:'Separate tasks'});
 assert.ok(!(await rpc(ids.t,'inbox')).some(x=>x.notice_id===pending.id&&['pending','pending_duplicate_review'].includes(x.kind)));
});
await test('AC-208 hard delete requires soft deletion, Admin, confirmation and trimmed reason',async()=>{
 const n=await make();const before=(await db.query('select * from homework_notices where id=$1',[n.id])).rows[0];
 await assert.rejects(hard(n.id));assert.deepEqual((await db.query('select * from homework_notices where id=$1',[n.id])).rows[0],before);
 await rpc(ids.s,'delete',{id:n.id,reason:'Cleanup'});
 for(const actor of [ids.s,ids.m,ids.t])await assert.rejects(rpc(actor,'hard_delete',{id:n.id,confirm_irreversible:true,hard_delete_reason:'test'}),{code:'42501'});
 for(const p of [{confirm_irreversible:false},{confirm_irreversible:'true'},{hard_delete_reason:' '},{hard_delete_reason:'\n \t'},{hard_delete_reason:123},{hard_delete_reason:'x'.repeat(501)}])await assert.rejects(hard(n.id,p));
 await rpc(ids.t,'restore',{id:n.id});await assert.rejects(hard(n.id)); // state rechecked after competing restore wins
});
await test('AC-209/210 atomic tombstone failure rolls back all children; immutable after success',async()=>{
 await rpc(ids.other,'heart',{id:original.id,liked:true});await rpc(ids.m,'remind',{id:original.id});
 await rpc(ids.s,'delete',{id:original.id,reason:'Remove private task'});
 await db.exec("create function reject_tombstone_test() returns trigger language plpgsql as $$begin raise exception 'INJECTED_TOMBSTONE_FAILURE';end$$; create trigger fail_insert before insert on homework_tombstones for each row execute function reject_tombstone_test();");
 await assert.rejects(hard(original.id),/INJECTED_TOMBSTONE_FAILURE/);
 assert.equal((await db.query('select count(*)::int n from homework_notices where id=$1',[original.id])).rows[0].n,1);
 assert.equal((await db.query('select count(*)::int n from homework_notice_reactions where notice_id=$1',[original.id])).rows[0].n,1);
 await db.exec('drop trigger fail_insert on homework_tombstones; drop function reject_tombstone_test()');
 await hard(original.id);
 for(const sql of ["update homework_tombstones set hard_delete_reason='tamper'","delete from homework_tombstones","truncate homework_tombstones cascade"])await assert.rejects(db.exec(sql),/immutable/i);
 assert.equal((await hard(original.id)).already_deleted,true);
 await assert.rejects(rpc(ids.t,'restore',{id:original.id}));
});
await test('AC-211/212 minimal tombstone and role-specific redacted history',async()=>{
 const tomb=(await rpc(ids.a,'load')).tombstones.find(x=>x.notice_id===original.id);
 assert.deepEqual(Object.keys(tomb).sort(),['notice_id','class_id','author_id','subject_id','english_group_id','original_created_at','original_published_at','final_status','soft_deleted_at','soft_deleted_by','soft_delete_reason','hard_deleted_at','hard_deleted_by','hard_delete_reason','was_duplicate','last_decision','decided_at','decided_by'].sort());
 assert.equal(tomb.hard_deleted_by,ids.a);assert.equal(tomb.hard_delete_reason,'Remove test');assert.equal(tomb.final_status,'published');assert.equal(tomb.was_duplicate,true);assert.equal(tomb.last_decision,'keep_both');
 const author=await rpc(ids.s,'load');const marker=author.history_markers.find(x=>x.notice_id===original.id);
 assert.deepEqual(Object.keys(marker).sort(),['notice_id','marker','original_created_at','hard_deleted_at'].sort());assert.equal(marker.marker,'[Đã xóa vĩnh viễn]');
 assert.equal((await rpc(ids.other,'load')).history_markers.length,0);assert.equal((await rpc(ids.other,'load')).tombstones.length,0);
 const teacher=(await rpc(ids.t,'load')).tombstones.find(x=>x.notice_id===original.id);assert.deepEqual(Object.keys(teacher).sort(),['notice_id','event','hard_deleted_at'].sort());
});
await test('AC-213/214 purge all operational children; preserve referenced notice and master data',async()=>{
 for(const table of ['homework_notices','homework_notice_reactions','homework_notice_reminders','homework_duplicate_reviews','homework_notifications','homework_contribution_events']){
 const key=table==='homework_notices'?'id':'notice_id';assert.equal((await db.query(`select count(*)::int n from ${table} where ${key}=$1`,[original.id])).rows[0].n,0,table);
 }
 const other=(await db.query('select * from homework_notices where id=$1',[pending.id])).rows[0];assert.equal(other.status,'published');assert.equal(other.duplicate_of,null);assert.equal(other.duplicate_tombstone_id,original.id);
 const review=(await db.query('select * from homework_duplicate_reviews where notice_id=$1 order by revision desc limit 1',[pending.id])).rows[0];assert.equal(review.candidate_id,null);assert.equal(review.candidate_tombstone_id,original.id);assert.equal(review.score,null);assert.equal(review.reason,null);assert.equal(review.decision,'keep_both');
 assert.ok((await rpc(ids.t,'load')).notices.some(x=>x.id===pending.id));assert.ok((await db.query('select id from profiles where id=$1',[ids.s])).rows.length);assert.ok((await db.query('select id from class_subjects where id=$1',[subject.id])).rows.length);
 const d=await rpc(ids.s,'load');assert.ok(!d.notices.some(x=>x.id===original.id));assert.equal(d.leaderboard.find(x=>x.id===ids.s).hearts,0);await assert.rejects(rpc(ids.m,'remind',{id:original.id}));
});
await test('AC-215 direct tables/helpers/service finalizer cannot bypass RPC permissions',async()=>{
 await db.exec('set role authenticated');
 for(const table of ['homework_tombstones','homework_notices','homework_settings','homework_duplicate_reviews'])for(const q of [`select * from ${table}`,`delete from ${table}`,`insert into ${table} default values`])await assert.rejects(db.exec(q),{code:'42501'});
 await assert.rejects(db.exec("select homework_ai('finish','{}')"),{code:'42501'});await db.exec('reset role');
});
await test('AI error retries same revision; config changes invalidate an in-flight finalizer',async()=>{
 const n=await make(ids.s,{due_at:'2027-03-01T13:00:00Z'});let snap=await ai('snapshot',{id:n.id});
 await rpc(ids.t,'ai_settings',{...settings,semantic_duplicate_enabled:false});
 assert.equal((await ai('finish',{id:n.id,revision:n.revision,fingerprint:snap.fingerprint,score:0})).stale,true);
 snap=await ai('snapshot',{id:n.id});await ai('finish',{id:n.id,revision:n.revision,fingerprint:snap.fingerprint,error:'TEMP'});
 for(const actor of [ids.s,ids.m,ids.t,ids.a])await assert.rejects(rpc(actor,'review',{id:n.id,decision:'publish_after_error'}));
 await rpc(ids.s,'retry',{id:n.id});assert.equal((await ai('snapshot',{id:n.id})).notice.revision,n.revision);assert.equal((await finish(n)).status,'published');await rpc(ids.t,'ai_settings',settings);
});

await test('Deleted backlog resolves immediately; restored unresolved cases re-enter queue without a publication bypass',async()=>{
 await rpc(ids.a,'alert_settings',{alert_level:'backlog'});
 const items=[];for(let i=0;i<5;i++){const n=await make(ids.other,{due_at:'2027-04-01T12:00:00Z'});items.push(n);await db.query("update homework_notices set pending_since=now()-interval '25 hours' where id=$1",[n.id]);}
 assert.ok((await rpc(ids.a,'inbox')).some(x=>x.kind==='backlog'));
 for(const n of items)await rpc(ids.other,'delete',{id:n.id,reason:'Withdraw'});
 assert.ok(!(await rpc(ids.a,'inbox')).some(x=>x.kind==='backlog'));
 for(const n of items)assert.ok(!(await rpc(ids.t,'load')).queue.some(x=>x.id===n.id));
 await rpc(ids.t,'restore',{id:items[0].id});assert.ok((await rpc(ids.t,'load')).queue.some(x=>x.id===items[0].id));
 for(const decision of ['keep_existing','keep_both','replace_existing'])await assert.rejects(rpc(ids.t,'review',{id:items[0].id,decision,reason:'No checked comparison'}));
});
await test('Hard delete accepts all four prior states and never touches registration/audit/master fixtures',async()=>{
 await db.exec("create table registrations(id int primary key,content text); insert into registrations values(1,'Keep self-study'); create table audit_logs(id int primary key,payload text); insert into audit_logs values(1,'Keep other audit');");
 for(const prior of ['published','pending_duplicate_review','duplicate_rejected','replaced']){
  const n=await make();await db.query('update homework_notices set status=$2 where id=$1',[n.id,prior]);await rpc(ids.s,'delete',{id:n.id,reason:'Test prior states'});await hard(n.id);
  assert.equal((await db.query('select final_status from homework_tombstones where notice_id=$1',[n.id])).rows[0].final_status,prior);
 }
 assert.equal((await db.query('select * from registrations')).rows[0].content,'Keep self-study');assert.equal((await db.query('select * from audit_logs')).rows[0].payload,'Keep other audit');assert.equal((await db.query('select count(*)::int n from profiles')).rows[0].n,5);
});
await test('A downstream FK failure rolls back inserted tombstone and every earlier purge',async()=>{
 const n=await make();await finish(n);await rpc(ids.other,'heart',{id:n.id,liked:true});await rpc(ids.s,'delete',{id:n.id,reason:'Test rollback'});
 await db.exec('create table external_reference_test(notice_id uuid references homework_notices(id))');await db.query('insert into external_reference_test values($1)',[n.id]);
 await assert.rejects(hard(n.id),{code:'23503'});
 assert.equal((await db.query('select count(*)::int n from homework_tombstones where notice_id=$1',[n.id])).rows[0].n,0);
 assert.equal((await db.query('select count(*)::int n from homework_notice_reactions where notice_id=$1',[n.id])).rows[0].n,1);
 await db.exec('drop table external_reference_test');await hard(n.id);
});
await test('Purged duplicate target makes unresolved comparison retryable, never publishable from client',async()=>{
 const target=await make(ids.s,{due_at:'2027-05-01T12:00:00Z'});await finish(target);
 const dependent=await make(ids.other,{due_at:'2027-05-01T12:00:00Z'});await finish(dependent,80,target.id);
 await rpc(ids.s,'delete',{id:target.id,reason:'Remove reference'});await hard(target.id);
 const queued=(await rpc(ids.t,'load')).queue.find(x=>x.id===dependent.id);assert.equal(queued.can_retry,true);assert.equal(queued.candidate,null);
 for(const decision of ['keep_existing','keep_both','replace_existing'])await assert.rejects(rpc(ids.t,'review',{id:dependent.id,decision,reason:'Cannot bypass'}));
 await rpc(ids.t,'retry',{id:dependent.id});assert.equal((await finish(dependent)).status,'published');
});
await test('Sequential hard deletes retain minimal duplicate decision trace for the surviving referenced notice',async()=>{
 const target=await make(ids.s,{due_at:'2027-06-01T12:00:00Z'});await finish(target);
 const dependent=await make(ids.other,{due_at:'2027-06-01T12:00:00Z'});await finish(dependent,80,target.id);
 await rpc(ids.t,'review',{id:dependent.id,decision:'keep_both',reason:'Different exercises'});
 await rpc(ids.other,'delete',{id:dependent.id,reason:'Remove duplicate first'});await hard(dependent.id);
 await rpc(ids.s,'delete',{id:target.id,reason:'Remove original later'});await hard(target.id);
 const t=(await db.query('select * from homework_tombstones where notice_id=$1',[target.id])).rows[0];assert.equal(t.was_duplicate,true);assert.equal(t.last_decision,'keep_both');assert.equal(t.decided_by,ids.t);assert.ok(t.decided_at);
});
await db.close();
