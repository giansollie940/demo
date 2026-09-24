import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createFixture,ids} from './fixture.mjs';
const db=await createFixture();
await db.exec(await readFile(new URL('../../database/upgrade/05-FEAT-001-BAO-BAI.sql',import.meta.url),'utf8'));
if(process.env.FEAT002_UPGRADE)await db.exec(await readFile(new URL('../../database/upgrade/07-FEAT-002-PERMISSIONS-LIFECYCLE.sql',import.meta.url),'utf8'));
async function call(actor,name,action,data={}){
 await db.exec(`reset role; select set_config('request.jwt.claim.sub','${actor}',false); set role ${name==='homework_ai'?'service_role':'authenticated'};`);
 try{return (await db.query(`select ${name}($1,$2::jsonb) result`,[action,JSON.stringify({class_id:ids.c,...data})])).rows[0].result;}
 finally{await db.exec('reset role');}
}
const rpc=(actor,action,data)=>call(actor,'homework_api',action,data);
const ai=(action,data)=>call(ids.a,'homework_ai',action,data);
const sub=await rpc(ids.t,'subject_save',{name:'Toán'});
async function notice(){return rpc(ids.s,'submit',{subject_id:sub.id,title:'Bài 1',content:'Làm phiếu',due_at:'2026-09-15T12:00:00Z',request_id:crypto.randomUUID()});}
async function context(n){const s=await ai('snapshot',{id:n.id});return {id:n.id,revision:n.revision,fingerprint:s.fingerprint};}
await test('R-005 error attempts do not finalize the revision; successful retry publishes once',async()=>{
 const n=await notice();const ctx=await context(n);
 await ai('finish',{...ctx,error:'AI_UNAVAILABLE'});
 await ai('finish',{...ctx,error:'AI_UNAVAILABLE'});
 const pendingSince=(await db.query('select pending_since from homework_notices where id=$1',[n.id])).rows[0].pending_since;
 const retry=await rpc(ids.s,'retry',{id:n.id,status:'published',score:0,content:'DO NOT CHANGE'});
 assert.equal(retry.revision,n.revision);assert.equal(retry.content,n.content);assert.equal(retry.status,'pending_duplicate_review');
 assert.deepEqual((await db.query('select pending_since from homework_notices where id=$1',[n.id])).rows[0].pending_since,pendingSince);
 assert.equal((await rpc(ids.s,'load')).history.find(x=>x.id===n.id).can_retry,true);
 assert.equal((await rpc(ids.t,'load')).queue.find(x=>x.id===n.id).can_retry,true);
 assert.equal('can_retry' in (await rpc(ids.m,'load')).queue.find(x=>x.id===n.id),false);
 const result=await ai('finish',{...ctx,score:0,reason:'AI recovered'});
 assert.equal(result.status,'published');
 await ai('finish',{...ctx,error:'LATE_ERROR'});
 await ai('finish',{...ctx,score:100,candidate_id:crypto.randomUUID(),reason:'LATE_RESULT'});
 const saved=(await db.query('select * from homework_notices where id=$1',[n.id])).rows[0];
 assert.equal(saved.status,'published');assert.equal(saved.revision,n.revision);
 assert.equal((await db.query("select count(*)::int n from homework_contribution_events where notice_id=$1 and event_type='ai_published'",[n.id])).rows[0].n,1);
 assert.equal((await db.query("select count(*)::int n from homework_contribution_events where notice_id=$1 and event_type='ai_error'",[n.id])).rows[0].n,2);
});
await test('R-005 retry permissions match existing notice management; no bypass and stale result rejected',async()=>{
 const n=await notice();const ctx=await context(n);await ai('finish',{...ctx,error:'AI_UNAVAILABLE'});
 await assert.rejects(rpc(ids.other,'retry',{id:n.id}));await assert.rejects(rpc(ids.m,'retry',{id:n.id}));
 for(const actor of (process.env.FEAT002_UPGRADE?[ids.s,ids.t]:[ids.s,ids.t,ids.a]))assert.equal((await rpc(actor,'retry',{id:n.id})).revision,n.revision);
 await assert.rejects(rpc(ids.t,'review',{id:n.id,decision:'publish_after_error',reason:'bypass'}));
 await rpc(ids.s,'submit',{id:n.id,revision:n.revision,subject_id:sub.id,title:n.title,content:'Changed',due_at:n.due_at});
 assert.equal((await ai('finish',{...ctx,score:0,reason:'stale'})).stale,true);
});
await test('R-005 legacy R2 error rows recover; a completed duplicate result cannot be overwritten',async()=>{
 const original=await notice();await ai('finish',{...await context(original),score:0,reason:'Existing published notice'});
 const n=await notice();const ctx=await context(n);
 // Same data shape produced by R2; retain its error audit on recovery.
 await db.query('insert into homework_duplicate_reviews(notice_id,revision,reason) values($1,$2,$3)',[n.id,n.revision,'Legacy provider error']);
 const result=await ai('finish',{...ctx,score:80,candidate_id:original.id,reason:'Recovered comparison'});
 assert.equal(result.status,'pending_duplicate_review');
 const done=await ai('finish',{...ctx,score:0,reason:'Must not bypass teacher'});
 assert.equal(done.done,true);assert.equal(done.status,'pending_duplicate_review');
 assert.equal((await db.query('select score::int score from homework_duplicate_reviews where notice_id=$1',[n.id])).rows[0].score,80);
 assert.equal((await ai('snapshot',{id:n.id})).done,true);
 await rpc(ids.t,'review',{id:n.id,decision:'keep_both',reason:'Hai phần khác nhau'});
 assert.equal((await db.query('select status from homework_notices where id=$1',[n.id])).rows[0].status,'published');
});
await test('R-005 upgrade from actual R2 SQL preserves data and recovers the original error revision',async()=>{
 const legacy=await createFixture();
 await legacy.exec(await readFile(new URL('./fixtures/r2-homework.sql',import.meta.url),'utf8'));
 await legacy.exec(`select set_config('request.jwt.claim.sub','${ids.s}',false)`);
 const subId=crypto.randomUUID(),noticeId=crypto.randomUUID();
 await legacy.query('insert into class_subjects(id,class_id,name) values($1,$2,$3)',[subId,ids.c,'Upgrade fixture']);
 await legacy.query("insert into homework_notices(id,class_id,school_year_id,subject_id,author_id,title,content,due_at,request_id) values($1,$2,$3,$4,$5,'Original','Preserved','2026-09-15T12:00:00Z',$6)",[noticeId,ids.c,ids.y,subId,ids.s,crypto.randomUUID()]);
 let snapshot=(await legacy.query("select homework_ai('snapshot',$1) result",[JSON.stringify({id:noticeId})])).rows[0].result;
 const ctx={id:noticeId,revision:1,fingerprint:snapshot.fingerprint};
 await legacy.query("select homework_ai('finish',$1)",[JSON.stringify({...ctx,error:'LEGACY_ERROR'})]);
 const before=(await legacy.query('select * from homework_notices where id=$1',[noticeId])).rows[0];
 const upgrade=await readFile(new URL('../../database/upgrade/06-FEAT-001-AI-RECOVERY.sql',import.meta.url),'utf8');
 await legacy.exec(upgrade);await legacy.exec(upgrade);
 assert.deepEqual((await legacy.query('select * from homework_notices where id=$1',[noticeId])).rows[0],before);
 await legacy.exec('set role authenticated');
 assert.equal((await legacy.query("select homework_api('retry',$1) result",[JSON.stringify({class_id:ids.c,id:noticeId})])).rows[0].result.revision,1);
 await assert.rejects(legacy.query("select homework_ai('snapshot',$1)",[JSON.stringify({id:noticeId})]));
 await legacy.exec('reset role; set role service_role');
 assert.equal((await legacy.query("select homework_ai('finish',$1) result",[JSON.stringify({...ctx,score:0,reason:'Recovered'})])).rows[0].result.status,'published');
 await legacy.exec('reset role');
 assert.equal((await legacy.query("select count(*)::int n from homework_contribution_events where notice_id=$1 and event_type='ai_error'",[noticeId])).rows[0].n,1);
 await legacy.close();
});
await db.close();
