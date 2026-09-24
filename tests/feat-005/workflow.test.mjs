import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup,seed,rpc,server,migrate,ids,classId,classB } from './fixture.mjs';
const revision = n => Object.fromEntries(['subject_id','english_group_id','title','content','due_at'].map(k=>[k,n[k]]));
const token = (n,c) => ({id:n.id,correction_id:c.id,round:c.round,version:c.version});
const request = (db,n) => rpc(db,ids.t,'correction_request',{id:n.id,issue_types:['deadline','content'],reason:'Sửa nội dung và hạn'});
async function maintenance(db) {await db.exec('set role service_role');try{await db.exec('select public.homework_maintenance()');}finally{await db.exec('reset role');}}
async function overdue(db,c) { await db.query("update homework_correction_rounds set requested_at=statement_timestamp()-interval '73 hours',due_at=statement_timestamp()-interval '1 hour' where correction_id=$1 and round=$2",[c.id,c.round]); }
test('reports: role matrix, confidentiality in every reader, Teacher outcomes/statistics without role changes',async()=>{
 const db=await setup();try{const n=await seed(db);
 for(const u of [ids.s,ids.other,ids.t,ids.a]) await assert.rejects(rpc(db,u,'report',{id:n.id,category:'content'}),{code:'42501'});
 await assert.rejects(rpc(db,ids.m,'report',{id:n.id,category:'content',reporter_id:ids.t}));
 await rpc(db,ids.m,'report',{id:n.id,category:'content',note:'REPORTER_PRIVATE_NOTE'});
 await assert.rejects(rpc(db,ids.m,'report',{id:n.id,category:'content'}),{code:'23505'});
 let data=await rpc(db,ids.t,'load');let report=data.reports[0];assert.equal(report.reporter_id,ids.m);assert.equal(report.events[0].actor_id,ids.m);
 for(const u of [ids.s,ids.other,ids.m,ids.a]){const d=await rpc(db,u,'load');assert.equal(d.reports,undefined);assert.ok(!JSON.stringify(d).includes('REPORTER_PRIVATE_NOTE'));assert.ok(!JSON.stringify(d).includes('reporter_id'));}
 assert.ok(!JSON.stringify(await rpc(db,ids.a,'oversight',{},'')).includes('REPORTER_PRIVATE_NOTE'));
 for(const outcome of ['valid','invalid','suspected_abuse']){
  await rpc(db,ids.t,'report_process',{id:n.id,report_id:report.id,outcome,note:'Teacher-only note'});
  await assert.rejects(rpc(db,ids.t,'report_process',{id:n.id,report_id:report.id,outcome}));
  if(outcome!=='suspected_abuse'){await rpc(db,ids.m,'report',{id:n.id,category:'other'});report=(await rpc(db,ids.t,'load')).reports.find(x=>x.status==='open');}
 }
 data=await rpc(db,ids.t,'load');assert.deepEqual(data.report_statistics.map(({total,valid,invalid,suspected_abuse})=>({total,valid,invalid,suspected_abuse})),[{total:3,valid:1,invalid:1,suspected_abuse:1}]);
 await rpc(db,ids.m,'report',{id:n.id,category:'deadline'});assert.equal((await db.query('select role from profiles where id=$1',[ids.m])).rows[0].role,'monitor');
 }finally{await db.close();}
});
test('correction private draft, ordinary edit/delete rejection, resubmission stops timer, approval preserves AI gate',async()=>{
 const db=await setup();try{const n=await seed(db);let c=await request(db,n);
 await assert.rejects(request(db,n));
 for(const action of ['delete','submit'])await assert.rejects(rpc(db,ids.s,action,{...n,reason:'bypass'}));
 for(const u of [ids.m,ids.other,ids.a])await assert.rejects(rpc(db,u,'correction_request',{id:n.id,issue_types:['content'],reason:'no'}),{code:'42501'});
 const draft={...revision(n),content:'PRIVATE_REVISION_NEW_TASK'};
 c=await rpc(db,ids.s,'correction_save',{...token(n,c),revision_data:draft});
 assert.equal((await rpc(db,ids.s,'load')).corrections[0].rounds[0].draft.content,draft.content);
 for(const u of [ids.other,ids.m,ids.a])assert.ok(!JSON.stringify(await rpc(db,u,'load')).includes(draft.content));
 assert.ok(!JSON.stringify(await rpc(db,ids.a,'oversight',{},'')).includes(draft.content));
 assert.equal((await rpc(db,ids.t,'load')).notices[0].content,n.content);
 c=await rpc(db,ids.s,'correction_submit',{...token(n,c),revision_data:draft});
 await overdue(db,c);await maintenance(db);
 assert.equal((await rpc(db,ids.s,'load')).notices[0].correction.status,'awaiting_teacher');
 await assert.rejects(rpc(db,ids.s,'correction_save',{...token(n,c),revision_data:revision(n)}));
 const result=await rpc(db,ids.t,'correction_decide',{...token(n,c),decision:'approved'});
 assert.equal(result.status,'pending_duplicate_review');assert.equal(result.content,draft.content);
 assert.equal((await rpc(db,ids.other,'load')).notices.length,0);
 const snap=await server(db,'snapshot',{id:n.id});assert.equal(snap.notice.content,draft.content);
 await server(db,'finish',{id:n.id,revision:snap.notice.revision,fingerprint:snap.fingerprint,score:0,candidate_id:null});
 assert.equal((await rpc(db,ids.other,'load')).notices[0].content,draft.content);
 assert.ok((await rpc(db,ids.s,'inbox')).some(x=>x.kind==='correction_approved'));
 }finally{await db.close();}
});
test('exact 72 hour window, two rounds, stale decisions rejected, terminal deletion is System with separate Teacher actor',async()=>{
 const db=await setup();try{const n=await seed(db);let c=await request(db,n);
 let row=(await db.query("select extract(epoch from(due_at-requested_at)) seconds from homework_correction_rounds where correction_id=$1",[c.id])).rows[0];assert.equal(Number(row.seconds),72*3600);
 c=await rpc(db,ids.s,'correction_submit',{...token(n,c),revision_data:revision(n)});const old=token(n,c);
 await assert.rejects(rpc(db,ids.t,'correction_decide',{...old,decision:'rejected',reason:' '}));
 c=await rpc(db,ids.t,'correction_decide',{...old,decision:'rejected',reason:'Cần sửa thêm'});assert.equal(c.round,2);
 await assert.rejects(rpc(db,ids.t,'correction_decide',{...old,decision:'rejected',reason:'double-click'}));
 c=await rpc(db,ids.s,'correction_submit',{...token(n,c),revision_data:revision(n)});
 await rpc(db,ids.t,'correction_decide',{...token(n,c),decision:'rejected',reason:'Vẫn sai'});
 row=(await db.query('select * from homework_notices where id=$1',[n.id])).rows[0];assert.equal(row.status,'deleted');assert.equal(row.deleted_actor_type,'system');assert.equal(row.deleted_by,null);
 const events=(await db.query('select * from homework_moderation_events where notice_id=$1',[n.id])).rows;
 assert.equal(events.find(e=>e.event_type==='correction_rejected'&&e.round===2).actor_id,ids.t);
 assert.equal(events.find(e=>e.event_type==='system_soft_delete').actor_id,null);
 assert.equal((await db.query('select count(*) n from homework_correction_rounds')).rows[0].n,2);
 await assert.rejects(request(db,n));await assert.rejects(rpc(db,ids.t,'correction_decide',{...token(n,c),decision:'approved'}));
 await assert.rejects(rpc(db,ids.other,'heart',{id:n.id,liked:true}));
 assert.ok((await rpc(db,ids.s,'inbox')).some(x=>x.kind==='correction_rejected_final'));
 assert.equal((await db.query('select count(*) n from profiles')).rows[0].n,5);
 }finally{await db.close();}
});
test('timeout both rounds, scheduler authorization/idempotency and timeout-before-resubmit race ordering',async()=>{
 for(const round of [1,2]){const db=await setup();try{const n=await seed(db);let c=await request(db,n);
 if(round===2){c=await rpc(db,ids.s,'correction_submit',{...token(n,c),revision_data:revision(n)});c=await rpc(db,ids.t,'correction_decide',{...token(n,c),decision:'rejected',reason:'Lần cuối'});}
 await overdue(db,c);
 const result=await rpc(db,ids.s,'correction_submit',{...token(n,c),revision_data:revision(n)});assert.equal(result.expired,true);
 await maintenance(db);await maintenance(db);
 const rows=(await db.query("select * from homework_moderation_events where event_type='system_soft_delete'")).rows;assert.equal(rows.length,1);assert.equal(rows[0].actor_type,'system');
 assert.equal((await rpc(db,ids.s,'load')).notices.length,0);assert.ok((await rpc(db,ids.s,'inbox')).some(x=>x.kind==='correction_timeout'));
 await db.exec(`set role authenticated;set request.jwt.claim.sub='${ids.t}';`);await assert.rejects(db.exec('select public.homework_maintenance()'),{code:'42501'});await db.exec('reset role');
 }finally{await db.close();}}
});
test('withdraw and emergency removal retain real user, close timer and require reasons and correct role',async()=>{
 for(const action of ['withdraw','emergency_remove']){const db=await setup();try{const n=await seed(db);const c=await request(db,n);const user=action==='withdraw'?ids.s:ids.t;
 const p={...token(n,c),category:'seriously_incorrect_information',reason:'Nội dung cần gỡ'};
 await assert.rejects(rpc(db,user,action,{...p,reason:''}));
 for(const bad of [ids.other,ids.m,ids.a])await assert.rejects(rpc(db,bad,action,p));
 await rpc(db,user,action,p);const row=(await db.query('select * from homework_notices where id=$1',[n.id])).rows[0];assert.equal(row.deleted_actor_type,'user');assert.equal(row.deleted_by,user);
 assert.equal((await rpc(db,ids.t,'load')).corrections[0].status,action==='withdraw'?'withdrawn_by_author':'emergency_removed');
 await overdue(db,c);await maintenance(db);assert.equal((await db.query("select count(*) n from homework_moderation_events where event_type='system_soft_delete'")).rows[0].n,0);
 }finally{await db.close();}}
});
test('System hard-delete: confirmation/reason/Admin gates, tombstone before purge, private data purge and marker',async()=>{
 const db=await setup();try{const n=await seed(db);await rpc(db,ids.m,'report',{id:n.id,category:'content',note:'SECRET_REPORT'});const c=await request(db,n);await overdue(db,c);await maintenance(db);
 const p={id:n.id,confirm_irreversible:true,hard_delete_reason:'Reviewed permanent removal'};
 for(const u of [ids.s,ids.m,ids.t])await assert.rejects(rpc(db,u,'hard_delete',p));
 await assert.rejects(rpc(db,ids.a,'hard_delete',{...p,confirm_irreversible:false}));await assert.rejects(rpc(db,ids.a,'hard_delete',{...p,hard_delete_reason:' '}));
 await db.exec("create function reject_tombstone() returns trigger language plpgsql as $$begin raise exception 'test gate';end$$;create trigger reject_t before insert on homework_tombstones for each row execute function reject_tombstone();");
 await assert.rejects(rpc(db,ids.a,'hard_delete',p),/test gate/);assert.equal((await db.query('select count(*) n from homework_notices')).rows[0].n,1);
 await db.exec('drop trigger reject_t on homework_tombstones');await rpc(db,ids.a,'hard_delete',p);
 const t=(await db.query('select * from homework_tombstones')).rows[0];assert.equal(t.soft_delete_actor_type,'system');assert.equal(t.soft_deleted_by,null);assert.equal(t.hard_deleted_by,ids.a);
 for(const table of ['homework_reports','homework_corrections','homework_correction_rounds','homework_moderation_events','homework_notices','homework_notifications'])assert.equal((await db.query(`select count(*) n from ${table}`)).rows[0].n,0,table);
 assert.equal((await db.query('select count(*) n from homework_contribution_events where notice_id=$1',[n.id])).rows[0].n,0);
 assert.ok((await db.query('select count(*) n from homework_contribution_events where notice_id is null')).rows[0].n>0,'unrelated subject/catalog audit is preserved');
 for(const key of ['title','content','due_at','reporter_id'])assert.equal(t[key],undefined);
 const data=await rpc(db,ids.s,'load');assert.equal(data.history_markers.length,1);assert.ok(!JSON.stringify(data).includes('SECRET_REPORT'));assert.equal((await rpc(db,ids.a,'hard_delete',p)).already_deleted,true);
 }finally{await db.close();}
});
test('migration preserves old user deletion, populated notice rows and immutable tombstones',async()=>{
 const db=await setup(false);try{const n=await seed(db);await rpc(db,ids.s,'delete',{id:n.id,reason:'Manual'});await rpc(db,ids.a,'hard_delete',{id:n.id,confirm_irreversible:true,hard_delete_reason:'Existing tombstone'});
 const before=(await db.query('select to_jsonb(t) r from homework_tombstones t')).rows[0].r;
 const n2=await seed(db);await rpc(db,ids.s,'delete',{id:n2.id,reason:'Still in trash'});
 const rowBefore=(await db.query('select to_jsonb(n) r from homework_notices n')).rows[0].r;await migrate(db);
 assert.deepEqual((await db.query("select to_jsonb(t)-'soft_delete_actor_type' r from homework_tombstones t")).rows[0].r,before);
 assert.deepEqual((await db.query("select to_jsonb(n)-'deleted_actor_type' r from homework_notices n")).rows[0].r,rowBefore);
 assert.equal((await db.query('select deleted_actor_type from homework_notices')).rows[0].deleted_actor_type,'user');
 await rpc(db,ids.a,'hard_delete',{id:n2.id,confirm_irreversible:true,hard_delete_reason:'Manual actor preserved'});
 assert.ok((await db.query('select * from homework_tombstones')).rows.every(x=>x.soft_deleted_by===ids.s&&x.soft_delete_actor_type==='user'));
 await assert.rejects(db.exec("update homework_tombstones set soft_delete_actor_type='system'"),/immutable/);
 }finally{await db.close();}
});
test('class isolation, forged notice/correction IDs, private function/table access and Monitor remind denial',async()=>{
 const db=await setup();try{const n=await seed(db);const c=await request(db,n);
 await db.exec(`insert into classes(id,school_year_id,active,code,name,grade)values('${classB}','${ids.y}',true,'8A','8A',8);`);
 for(const user of [ids.s,ids.m,ids.t])for(const action of ['load','report','correction_request','correction_submit','correction_decide','emergency_remove'])await assert.rejects(rpc(db,user,action,{...token(n,c),reason:'forged',category:'content'},classB));
 await assert.rejects(rpc(db,ids.other,'correction_submit',{...token(n,c),revision_data:revision(n)}),{code:'42501'});
 await assert.rejects(rpc(db,ids.s,'correction_submit',{...token(n,c),correction_id:crypto.randomUUID(),revision_data:revision(n)}));
 await assert.rejects(rpc(db,ids.m,'remind',{id:n.id}),{code:'42501'});
 for(const user of [ids.s,ids.m,ids.t,ids.a]){await db.exec(`set role authenticated;set request.jwt.claim.sub='${user}';`);
  for(const sql of ['select * from homework_reports','select * from homework_correction_rounds','select * from homework_moderation_events','update homework_notices set author_id=null',"select homework_private.api_v4('delete','{}')","select homework_private.api_v3('delete','{}')",'select homework_maintenance()'])await assert.rejects(db.exec(sql),{code:'42501'});
  await db.exec('reset role');}
 await db.exec('update class_teachers set active=false');await assert.rejects(rpc(db,ids.t,'load'),{code:'42501'});
 }finally{await db.close();}
});
