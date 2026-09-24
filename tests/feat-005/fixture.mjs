import { readFile } from 'node:fs/promises';
import { createFixture, ids } from '../homework/fixture.mjs';
export { ids };
export const classId = '4e0b25e4-ec47-4745-8b2b-ba91c1504254';
export const classB = '40000000-0000-0000-0000-000000000002';
export async function setup(upgrade = true) {
  const db = await createFixture();
  await db.exec(`alter table profiles drop constraint profiles_class_id_fkey;
    update classes set id='${classId}'; update profiles set class_id='${classId}'; update class_teachers set class_id='${classId}';
    alter table profiles add foreign key(class_id) references classes(id);
    alter table classes add column code text default '7A9'; alter table classes add column name text default '7A9';`);
  for (const file of ['05-FEAT-001-BAO-BAI.sql','06-FEAT-001-AI-RECOVERY.sql','07-FEAT-002-PERMISSIONS-LIFECYCLE.sql','08-FEAT-004-MULTI-CLASS-CATALOG.sql'])
    await db.exec(await readFile(new URL('../../database/upgrade/'+file, import.meta.url), 'utf8'));
  if (upgrade && !process.env.FEAT005_BASELINE) await migrate(db);
  return db;
}
// FEAT008_UPGRADE / FEAT007_UPGRADE re-run the whole existing corpus on top of
// migration 11 and 12.
// Migration 11 wraps the dispatchers migration 10 creates, so it is only applied
// here when FEAT006_UPGRADE also asked for 10; suites that apply 10 themselves
// (tests/feat-006) pass FEAT008_UPGRADE alone.
export async function migrate(db) { await db.exec(await readFile(new URL('../../database/upgrade/09-FEAT-005-OWNERSHIP-CORRECTION.sql', import.meta.url), 'utf8')); if(process.env.FEAT006_UPGRADE) await db.exec(await readFile(new URL('../../database/upgrade/10-FEAT-006-HOMEWORK-MEDIA.sql', import.meta.url), 'utf8')); if(process.env.FEAT006_UPGRADE&&process.env.FEAT008_UPGRADE) await db.exec(await readFile(new URL('../../database/upgrade/11-FEAT-008-STORAGE-HEALTH.sql', import.meta.url), 'utf8')); if(process.env.FEAT006_UPGRADE&&process.env.FEAT008_UPGRADE&&process.env.FEAT007_UPGRADE){ await db.exec(`alter table public.school_years add column if not exists name text; alter table public.school_years add column if not exists is_active boolean not null default false; update public.school_years set name=coalesce(name,'nam-hoc'), is_active=true;`); await db.exec(await readFile(new URL('../../database/upgrade/12-FEAT-007-ARCHIVE-PURGE.sql', import.meta.url), 'utf8')); } }
export async function rpc(db, user, action, payload = {}, scope = classId) {
  await db.exec(`set role authenticated; set request.jwt.claim.sub='${user}';`);
  try { return (await db.query('select public.homework_api($1,$2::jsonb) r',[action, JSON.stringify({class_id:scope,...payload})])).rows[0].r; }
  finally { await db.exec('reset role'); }
}
export async function server(db, action, payload) {
  await db.exec('set role service_role');
  try { return (await db.query('select public.homework_ai($1,$2::jsonb) r',[action,JSON.stringify(payload)])).rows[0].r; }
  finally { await db.exec('reset role'); }
}
export async function seed(db, author=ids.s) {
  const cat = (await rpc(db,ids.a,'catalog_list',{grade:7},''))[0] || await rpc(db,ids.a,'catalog_save',{grade:7,name:'Toán'},'');
  const subject = await rpc(db,ids.t,'subject_save',{catalog_subject_id:cat.id});
  const n = await rpc(db,author,'submit',{subject_id:subject.id,title:'Bài tập',content:'Trang 10 bài 1',due_at:'2026-10-10T12:00:00Z',request_id:crypto.randomUUID()});
  const snap = await server(db,'snapshot',{id:n.id});
  await server(db,'finish',{id:n.id,revision:snap.notice.revision,fingerprint:snap.fingerprint,score:0,candidate_id:null});
  return {...n,status:'published'};
}
