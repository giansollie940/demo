import {test} from 'node:test';import assert from 'node:assert/strict';
import {setup,seed,rpc,server,ids} from './fixture.mjs';
import {reviewSnapshot} from '../../supabase/functions/homework-review/logic.js';
const revision=n=>Object.fromEntries(['subject_id','english_group_id','title','content','due_at'].map(k=>[k,n[k]]));
const token=(n,c)=>({id:n.id,correction_id:c.id,round:c.round,version:c.version});
test('AC-519: approved material correction still exact-rejects with semantic disabled, preserving history and withholding board notifications',async()=>{
 const db=await setup();try{
  const a=await seed(db);const b=await rpc(db,ids.other,'submit',{...revision(a),title:'Different B',content:'Original B task',request_id:crypto.randomUUID()});
  let snap=await server(db,'snapshot',{id:b.id});await server(db,'finish',{id:b.id,revision:snap.notice.revision,fingerprint:snap.fingerprint,score:0,candidate_id:null});
  await rpc(db,ids.t,'ai_settings',{semantic_duplicate_enabled:false,duplicate_review_threshold:70,duplicate_auto_threshold:90});
  let c=await rpc(db,ids.t,'correction_request',{id:b.id,issue_types:['content'],reason:'Sửa nhiệm vụ'});
  c=await rpc(db,ids.other,'correction_submit',{...token(b,c),revision_data:revision(a)});
  const approved=await rpc(db,ids.t,'correction_decide',{...token(b,c),decision:'approved'});assert.equal(approved.status,'pending_duplicate_review');
  snap=await server(db,'snapshot',{id:b.id});let providerCalls=0;
  const review=await reviewSnapshot(snap,async()=>{providerCalls++;throw Error('semantic should be off');});assert.equal(providerCalls,0);assert.equal(review.score,100);assert.equal(review.candidate_id,a.id);
  const before=(await db.query("select count(*) n from homework_notifications where notice_id=$1 and kind='published'",[b.id])).rows[0].n;
  await server(db,'finish',{id:b.id,revision:snap.notice.revision,fingerprint:snap.fingerprint,...review});
  const data=await rpc(db,ids.other,'load');assert.equal(data.history.find(x=>x.id===b.id).status,'duplicate_rejected');assert.ok(!data.notices.some(x=>x.id===b.id));
  assert.equal((await db.query("select count(*) n from homework_notifications where notice_id=$1 and kind='published'",[b.id])).rows[0].n,before);
 }finally{await db.close();}
});
test('AC-519: AI failure after approved correction remains pending and retryable; stale finalizers cannot publish',async()=>{
 const db=await setup();try{
  const n=await seed(db);let c=await rpc(db,ids.t,'correction_request',{id:n.id,issue_types:['content'],reason:'Sửa bài'});
  c=await rpc(db,ids.s,'correction_submit',{...token(n,c),revision_data:{...revision(n),content:'New substantive task'}});
  await rpc(db,ids.t,'correction_decide',{...token(n,c),decision:'approved'});
  const snap=await server(db,'snapshot',{id:n.id});await server(db,'finish',{id:n.id,revision:snap.notice.revision,fingerprint:snap.fingerprint,error:'AI_UNAVAILABLE'});
  let data=await rpc(db,ids.s,'load');assert.equal(data.history[0].can_retry,true);assert.equal(data.notices.length,0);assert.equal(data.corrections[0].status,'approved');
  await rpc(db,ids.s,'submit',{...data.history[0],content:'Another revision'});
  const stale=await server(db,'finish',{id:n.id,revision:snap.notice.revision,fingerprint:snap.fingerprint,score:0,candidate_id:null});assert.equal(stale.stale,true);
  const current=await server(db,'snapshot',{id:n.id});await server(db,'finish',{id:n.id,revision:current.notice.revision,fingerprint:current.fingerprint,score:0,candidate_id:null});
  data=await rpc(db,ids.s,'load');assert.equal(data.notices[0].content,'Another revision');
 }finally{await db.close();}
});
test('under migration 09: reactions, ranking and Teacher reminder rate limit survive ownership changes',async()=>{
 const db=await setup();try{
  const n=await seed(db);await rpc(db,ids.other,'heart',{id:n.id,liked:true});await rpc(db,ids.other,'heart',{id:n.id,liked:true});assert.equal((await rpc(db,ids.s,'load')).notices[0].hearts,1);
  await rpc(db,ids.t,'remind',{id:n.id});await assert.rejects(rpc(db,ids.t,'remind',{id:n.id}),/giới hạn nhắc/);
  const before=(await rpc(db,ids.s,'load')).leaderboard.find(x=>x.id===ids.s);assert.equal(before.notices,1);assert.equal(before.hearts,1);
  await rpc(db,ids.s,'delete',{id:n.id,reason:'Manual'});let data=await rpc(db,ids.s,'load');assert.equal(data.leaderboard.find(x=>x.id===ids.s).notices,0);
  await rpc(db,ids.t,'restore',{id:n.id});data=await rpc(db,ids.s,'load');assert.equal(data.notices[0].hearts,1);assert.equal(data.notices[0].deleted_actor_type,null);
 }finally{await db.close();}
});
