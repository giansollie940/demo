import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {setup,ids,storage,prepare} from '../feat-008/fixture.mjs';
const sql=await readFile(new URL('../../database/upgrade/17-STORAGE-CHANGE-SIGNALS.sql',import.meta.url),'utf8');
test('signals are admin-only, read-only, emitted by writes and not by measurement; migration reruns safely', async()=>{
 const db=await setup();
 try {
  await db.exec(sql); await db.exec(sql);
  await db.exec("update public.profiles set full_name=full_name where role='student'");
  assert.ok((await db.query("select * from storage_change_signals where source_table='profiles'")).rows.length);
  const before=await db.query("select * from storage_change_signals order by source_table");
  await storage(db,ids.a,'refresh');
  assert.deepEqual((await db.query("select * from storage_change_signals order by source_table")).rows,before.rows);
  for(const user of [ids.s,ids.m,ids.t,ids.a]){
   await db.exec("set role authenticated; set request.jwt.claim.sub='"+user+"'");
   const rows=(await db.query("select * from storage_change_signals")).rows;
   assert.equal(rows.length,user===ids.a?1:0);
   await assert.rejects(db.exec("update storage_change_signals set changed_at=clock_timestamp()"));
   await assert.rejects(db.exec("delete from storage_change_signals"));
   await assert.rejects(db.exec("select storage_live_private.emit_signal()"));
   await db.exec('reset role');
  }
  await db.exec('set role anon');
  await assert.rejects(db.exec('select * from storage_change_signals'));
  await db.exec('reset role');
  const attachment=await prepare(db,null);
  assert.equal((await db.query("select affects_r2 from storage_change_signals where source_table='homework_attachments'")).rows[0].affects_r2,true);
  await db.exec("delete from homework_attachments where id='"+attachment.id+"'");
  assert.equal((await db.query("select affects_r2 from storage_change_signals where source_table='homework_attachments'")).rows[0].affects_r2,true);
  assert.equal((await db.query("select has_schema_privilege('authenticated','homework_private','USAGE') allowed")).rows[0].allowed,false);
  await db.exec('begin; update public.classes set active=active; rollback;');
  assert.equal((await db.query("select * from storage_change_signals where source_table='classes'")).rows.length,0);
 }finally{await db.close();}
});

test('signal upgrade composes with archive + device policy and preserves archive guard',async()=>{
 const {setup:archiveSetup,ids:archiveIds,classId}=await import('../feat-007/fixture.mjs');
 const {addArchiveDeviceDependencies,migrationSql}=await import('../feat-010/fixture.mjs');
 const db=await archiveSetup();
 try{
  await addArchiveDeviceDependencies(db); await db.exec(await migrationSql()); await db.exec(sql);
  await db.query('insert into public.device_use_lock_intervals(class_id,weekday,period_number,locked_at) values($1,1,1,now())',[classId]);
  assert.equal((await db.query("select affects_r2 from storage_change_signals where source_table='device_use_lock_intervals'")).rows[0].affects_r2,false);
  await db.query("update public.school_years set archive_state='archived_read_only' where id=$1",[archiveIds.y]);
  await assert.rejects(db.query('delete from public.classes where id=$1',[classId]),/Năm học đã đóng gói/);
  assert.equal((await db.query('select count(*)::int n from device_use_lock_intervals where class_id=$1',[classId])).rows[0].n,1);
 }finally{await db.close();}
});
