import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { setup, seed, rpc, ids, classId } from './feat-005/fixture.mjs';

const migration = new URL('../database/upgrade/19-BAG-MIN8-ADMIN-HOMEWORK-ALERTS.sql', import.meta.url);
async function apply(db) {
  if (process.env.FIX_ALERTS_BASELINE) return;
  await db.exec(await readFile(migration, 'utf8'));
}

test('Admin gets no new homework alerts; old rows stay stored but leave the inbox; Teacher still gets published alerts', async () => {
  const db = await setup();
  try {
    await db.exec('create schema auth_bag;');
    await db.query("insert into homework_admin_preferences(admin_id,alert_level) values($1,'all')",[ids.a]);
    const n = await seed(db);
    const before = (await db.query('select count(*)::int n from homework_notifications where recipient_id=$1',[ids.a])).rows[0].n;
    assert.ok(before > 0, 'fixture reproduces legacy Admin delivery');
    await apply(db);
    assert.deepEqual(await rpc(db,ids.a,'inbox'), []);
    assert.equal((await db.query('select count(*)::int n from homework_notifications where recipient_id=$1',[ids.a])).rows[0].n,before);
    await rpc(db,ids.t,'remind',{id:n.id});
    for (const recipient of [ids.s,ids.m]) assert.ok((await rpc(db,recipient,'inbox')).some(x=>x.kind==='reminder'));
    for (const kind of ['published','pending','system']) await db.query('select homework_private.notify_managers($1,$2,$3,$4)',[classId,n.id,kind,'regression']);
    // The central delivery guard also covers reminders and later-added producers.
    for (const recipient of [ids.a,ids.s,ids.m,ids.t]) await db.query("insert into homework_notifications(class_id,recipient_id,notice_id,kind,title,message) values($1,$2,$3,'reminder','Báo bài','guard regression')",[classId,recipient,n.id]);
    assert.equal((await db.query('select count(*)::int n from homework_notifications where recipient_id=$1',[ids.a])).rows[0].n,before);
    for (const recipient of [ids.s,ids.m,ids.t]) assert.equal((await db.query("select count(*)::int n from homework_notifications where recipient_id=$1 and message='guard regression'",[recipient])).rows[0].n,1);
    await db.query("update homework_notifications set recipient_id=$1 where recipient_id=$2 and message='guard regression'",[ids.a,ids.s]);
    assert.equal((await db.query("select count(*)::int n from homework_notifications where recipient_id=$1 and message='guard regression'",[ids.s])).rows[0].n,1);
    assert.equal((await db.query("select has_function_privilege('authenticated','homework_private.skip_admin_notification()','EXECUTE') allowed")).rows[0].allowed,false);
    assert.ok((await rpc(db,ids.t,'inbox')).some(x=>x.kind==='published'));
    for (let i=0;i<4;i++) await seed(db);
    await db.query("update homework_notices set status='pending_duplicate_review',pending_since=now()-interval '25 hours',revision=revision+1");
    assert.equal((await db.query('select count(*)::int n from homework_notices where homework_private.actionable(homework_notices)')).rows[0].n,5);
    await db.query('select homework_private.backlog($1)',[classId]);
    assert.equal((await db.query('select count(*)::int n from homework_notifications where recipient_id=$1',[ids.a])).rows[0].n,before);
    assert.equal((await db.query('select active from homework_backlog_state where class_id=$1',[classId])).rows[0].active,true);
    await db.query("update homework_notices set status='published'");
    await db.query('select homework_private.backlog($1)',[classId]);
    assert.equal((await db.query('select active from homework_backlog_state where class_id=$1',[classId])).rows[0].active,false);
  } finally { await db.close(); }
});

test('SQL accepts 8–20 items, rejects 7 and 21, and rejects unknown catalogue codes',async()=>{
  const db=await setup();
  try{
    await db.exec('create schema auth_bag;');
    const old=await readFile(new URL('../database/upgrade/18-AUTH-BAG-001-SCHOOL-BAG-LOGIN.sql',import.meta.url),'utf8');
    const start=old.indexOf('create or replace function auth_bag.valid_input(');
    await db.exec(old.slice(start,old.indexOf('$$;',start)+3));
    await apply(db);
    for(const [length,expected] of [[7,false],[8,true],[9,true],[10,true],[20,true],[21,false]]){
      const hex='01'+'1005100a0f1114070218'.repeat(3).slice(0,length*2);
      assert.equal((await db.query("select auth_bag.valid_input(decode($1,'hex'),1::smallint,36) ok",[hex])).rows[0].ok,expected,`${length} items`);
    }
    assert.equal((await db.query("select auth_bag.valid_input(decode('011005100a0f1114ff','hex'),1::smallint,36) ok")).rows[0].ok,false);
  }finally{await db.close();}
});
