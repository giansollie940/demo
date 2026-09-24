import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup,seed,rpc,ids } from './fixture.mjs';
test('AC-501/509: Teacher and Monitor cannot edit another author through the real RPC', async () => {
  const db=await setup();
  try {
    const n=await seed(db);
    for(const user of [ids.t,ids.m,ids.other,ids.a]) await assert.rejects(rpc(db,user,'submit',{...n,content:'forged edit'}),{code:'42501'});
    assert.equal((await db.query('select content from homework_notices where id=$1',[n.id])).rows[0].content,n.content);
    await rpc(db,ids.s,'submit',{...n,content:n.content+' '});
  } finally { await db.close(); }
});
