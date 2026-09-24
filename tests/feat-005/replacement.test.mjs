import {test} from 'node:test';import assert from 'node:assert/strict';
import {setup,seed,rpc,server,ids} from './fixture.mjs';
test('Product addendum: replacement blocks both open correction states atomically and becomes available after closure',async()=>{
 for(const submitted of [false,true]){const db=await setup();try{
  const a=await seed(db);let c=await rpc(db,ids.t,'correction_request',{id:a.id,issue_types:['content'],reason:'Please correct A'});
  const revision=Object.fromEntries(['subject_id','english_group_id','title','content','due_at'].map(k=>[k,a[k]]));
  const token=()=>({id:a.id,correction_id:c.id,round:c.round,version:c.version});
  if(submitted)c=await rpc(db,ids.s,'correction_submit',{...token(),revision_data:revision});
  const b=await rpc(db,ids.other,'submit',{...revision,title:'B',content:'B work',request_id:crypto.randomUUID()});
  const snap=await server(db,'snapshot',{id:b.id});await server(db,'finish',{id:b.id,revision:snap.notice.revision,fingerprint:snap.fingerprint,score:80,candidate_id:a.id});
  const before=(await db.query('select to_jsonb(c) data from homework_corrections c')).rows;
  await assert.rejects(rpc(db,ids.t,'review',{id:b.id,decision:'replace_existing'}),/GV cần xử lý correction trước/);
  assert.deepEqual((await db.query('select to_jsonb(c) data from homework_corrections c')).rows,before);
  assert.equal((await db.query('select status from homework_notices where id=$1',[a.id])).rows[0].status,'published');
  assert.equal((await db.query('select status from homework_notices where id=$1',[b.id])).rows[0].status,'pending_duplicate_review');
  if(!submitted)c=await rpc(db,ids.s,'correction_submit',{...token(),revision_data:revision});
  await rpc(db,ids.t,'correction_decide',{...token(),decision:'approved'});
  await rpc(db,ids.t,'review',{id:b.id,decision:'replace_existing'});
  assert.equal((await db.query('select status from homework_notices where id=$1',[a.id])).rows[0].status,'replaced');
  assert.equal((await db.query('select status from homework_corrections where id=$1',[c.id])).rows[0].status,'approved');
 }finally{await db.close();}}
});
