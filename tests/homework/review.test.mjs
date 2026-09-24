import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createFixture, ids } from './fixture.mjs';
const db = await createFixture();
await db.exec(await readFile(new URL('../../database/upgrade/05-FEAT-001-BAO-BAI.sql',import.meta.url),'utf8'));
if(process.env.FEAT002_UPGRADE)await db.exec(await readFile(new URL('../../database/upgrade/07-FEAT-002-PERMISSIONS-LIFECYCLE.sql',import.meta.url),'utf8'));
async function call(actor,name,action,data={}) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub','${actor}',false); set role ${name==='homework_ai'?'service_role':'authenticated'};`);
  try { return (await db.query(`select public.${name}($1,$2::jsonb) result`,[action,JSON.stringify({class_id:ids.c,...data})])).rows[0].result; }
  finally { await db.exec('reset role'); }
}
const rpc=(actor,action,data)=>call(actor,'homework_api',action,data);
const ai=(action,data)=>call(ids.a,'homework_ai',action,data);
const subject=await rpc(ids.t,'subject_save',{name:'Toán',short_name:'Toán'});
const payload={subject_id:subject.id,title:'Bài 5',content:'Làm câu 1–3',due_at:'2026-09-11T12:00:00Z'};
const original=await rpc(ids.s,'submit',{...payload,request_id:crypto.randomUUID()});
let snap=await ai('snapshot',{id:original.id});
await ai('finish',{id:original.id,revision:original.revision,fingerprint:snap.fingerprint,score:0,reason:'No candidates'});
await test('R-002: AI failure stays pending; no publication decision can bypass missing comparison',async()=>{
 const n=await rpc(ids.other,'submit',{...payload,request_id:crypto.randomUUID()});
 const snapshot=await ai('snapshot',{id:n.id});
 assert.ok(snapshot.candidates.length>0);
 await ai('finish',{id:n.id,revision:n.revision,fingerprint:snapshot.fingerprint,error:'AI_UNAVAILABLE'});
 for(const actor of [ids.t,ids.a])for(const decision of ['publish_after_error','keep_existing','replace_existing','keep_both',null]) {
   await assert.rejects(rpc(actor,'review',{id:n.id,decision,reason:'Cannot bypass'}));
 }
 assert.equal((await db.query('select status from homework_notices where id=$1',[n.id])).rows[0].status,'pending_duplicate_review');
 assert.equal((await db.query('select count(*)::int n from homework_contribution_events where notice_id=$1 and event_type like $2',[n.id,'review_%'])).rows[0].n,0);
});
await test('R-004: monitor receives exactly the allow-listed comparison fields',async()=>{
 const n=await rpc(ids.other,'submit',{...payload,request_id:crypto.randomUUID()});
 const snapshot=await ai('snapshot',{id:n.id});
 await ai('finish',{id:n.id,revision:n.revision,fingerprint:snapshot.fingerprint,score:80,candidate_id:original.id,reason:'PRIVATE_AI_REASON'});
 const expected=['id','subject','english_group','title','content','due_at','author_name','author_role','created_at','status'].sort();
 const result=await rpc(ids.m,'load');const row=result.queue.find(x=>x.id===n.id);
 assert.deepEqual(Object.keys(row).sort(),[...expected,'candidate'].sort());
 assert.deepEqual(Object.keys(row.candidate).sort(),expected);
 assert.ok(!JSON.stringify(result).includes('PRIVATE_AI_REASON'));
 for(const decision of [null,'invalid'])await assert.rejects(rpc(ids.t,'review',{id:n.id,decision}));
});
await db.close();
