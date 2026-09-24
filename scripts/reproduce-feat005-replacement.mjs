import {setup,seed,rpc,server,ids} from '../tests/feat-005/fixture.mjs';
import {writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const db=await setup();
try{
 const a=await seed(db);const c=await rpc(db,ids.t,'correction_request',{id:a.id,issue_types:['content'],reason:'A needs correction'});
 const b=await rpc(db,ids.other,'submit',{subject_id:a.subject_id,title:'Replacement B',content:'Replacement work',due_at:a.due_at,request_id:crypto.randomUUID()});
 const snap=await server(db,'snapshot',{id:b.id});await server(db,'finish',{id:b.id,revision:snap.notice.revision,fingerprint:snap.fingerprint,score:80,candidate_id:a.id});
 await assert.rejects(rpc(db,ids.t,'review',{id:b.id,decision:'replace_existing'}),/GV cần xử lý correction trước/);
 await db.query("update homework_correction_rounds set requested_at=now()-interval '73 hours',due_at=now()-interval '1 hour' where correction_id=$1",[c.id]);
 await db.exec('set role service_role');await db.exec('select homework_maintenance()');await db.exec('reset role');
 const state=(await db.query('select n.status notice_status,c.status correction_status,c.closed_at from homework_notices n join homework_corrections c on c.notice_id=n.id where n.id=$1',[a.id])).rows[0];
 assert.equal(state.notice_status,'deleted');assert.equal(state.correction_status,'timeout');assert.ok(state.closed_at);
 const report={status:'RESOLVED_PASS',scenario:'Replacement is rejected while A has open correction. After the original deadline, maintenance still times out A normally.',observed:state,decision:'DEC-FEAT005-REPLACEMENT-GUARD; approved by Product Owner 2026-09-15',note:'Original failure evidence is retained separately. No correction terminal outcome was invented.'};
 await writeFile(new URL('../docs/feat-005/evidence/replacement-correction-resolution.json',import.meta.url),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await db.close();}
