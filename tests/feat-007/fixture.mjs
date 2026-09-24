import { readFile } from 'node:fs/promises';
import { setup as feat008 } from '../feat-008/fixture.mjs';
import { ids, classId } from '../feat-005/fixture.mjs';
export { seed, rpc, server, ids, classId } from '../feat-008/fixture.mjs';
export { storage, storageService, media, mediaService, prepare, sealed, imageMeta } from '../feat-008/fixture.mjs';

const sql = name => readFile(new URL('../../database/upgrade/' + name, import.meta.url), 'utf8');

export const ARCHIVE_FORMAT_VERSION = '1.0';
export const yearB = '00000000-0000-0000-0000-0000000000b0';
export const classB2 = '00000000-0000-0000-0000-0000000000b1';

/**
 * The shared harness models school_years with only (id,start_date,end_date).
 * Migration 12 needs the columns the real schema has, so they are added here
 * rather than in the migration — inventing them would hide a mismatch with
 * production instead of exposing it.
 */
export async function setup({ archive = true, secondYear = true } = {}) {
  const db = await feat008();
  await db.exec(`alter table public.school_years add column if not exists name text;
    alter table public.school_years add column if not exists is_active boolean not null default false;
    update public.school_years set name='2026-2027', is_active=true where id='${ids.y}';`);
  if (secondYear) {
    // A neighbouring year that every purge test asserts is left alone (AC-710/AC-711).
    await db.exec(`insert into public.school_years(id,start_date,end_date,name,is_active)
      values('${yearB}','2025-07-01','2026-06-30','2025-2026',false);
      insert into public.classes(id,school_year_id,active,code,name,grade) values('${classB2}','${yearB}',true,'6A1','6A1',6);`);
  }
  if (archive) await db.exec(await sql('12-FEAT-007-ARCHIVE-PURGE.sql'));
  return db;
}

/**
 * Real rows in the *other* year, written directly rather than through the API,
 * because the point is row-level purge scoping and the API cannot easily be
 * pointed at a second class. Without these the scoping assertions pass for the
 * wrong reason: an empty neighbouring year survives any delete at all.
 */
export async function populateOtherYear(db) {
  // FEAT-004 enforces that a class subject points at a catalog entry of the
  // class's own grade, even for privileged callers, so the catalog row comes
  // first. That shared catalog row is also what AC-711 asserts survives.
  await db.query(`insert into public.grade_subject_catalog(id,grade,name) values($1,6,'Toán 6') on conflict do nothing`, [otherIds.catalog]);
  await db.query(`insert into public.class_subjects(id,class_id,name,catalog_subject_id) values($1,$2,'Toán 6',$3)`,
    [otherIds.subject, classB2, otherIds.catalog]);
  await db.query(`insert into public.english_groups(id,class_id,school_year_id,name) values($1,$2,$3,'EG 6A1')`, [otherIds.group, classB2, yearB]);
  await db.query(`insert into public.english_group_members(id,english_group_id,student_id,school_year_id) values($1,$2,$3,$4)`,
    [otherIds.member, otherIds.group, ids.s, yearB]);
  await db.query(`insert into public.homework_notices(id,class_id,school_year_id,subject_id,author_id,title,content,due_at,status,request_id)
    values($1,$2,$3,$4,$5,'Bài của năm trước','Nội dung năm trước','2026-05-01T12:00:00Z','published',gen_random_uuid())`,
    [otherIds.notice, classB2, yearB, otherIds.subject, ids.s]);
  await db.query(`insert into public.homework_notice_reactions(notice_id,user_id) values($1,$2)`, [otherIds.notice, ids.other]);
  await db.query(`insert into public.homework_contribution_events(class_id,notice_id,actor_id,event_type)
    values($1,$2,$3,'submit')`, [classB2, otherIds.notice, ids.s]);
  await db.query(`insert into public.homework_settings(class_id) values($1)`, [classB2]);
  await db.query(`insert into public.homework_attachments(id,owner_id,class_id,school_year_id,request_id,upload_id,object_key,staging_key,size_bytes,width,height,checksum,status)
    values($1,$2,$3,$4,gen_random_uuid(),gen_random_uuid(),'homework/b/1/image.webp','pending/b/1/upload.webp',1000,10,10,$5,'active')`,
    [otherIds.attachment, ids.s, classB2, yearB, 'e'.repeat(64)]);
  return otherIds;
}

export const otherIds = {
  catalog: '00000000-0000-0000-0000-0000000000c0',
  subject: '00000000-0000-0000-0000-0000000000c1',
  group: '00000000-0000-0000-0000-0000000000c2',
  member: '00000000-0000-0000-0000-0000000000c3',
  notice: '00000000-0000-0000-0000-0000000000c4',
  attachment: '00000000-0000-0000-0000-0000000000c5',
};

/**
 * A write that the table guards cannot see.
 *
 * RC4 puts triggers on every year-owned table, so the ordinary "SQL editor"
 * simulation is now refused — which is the point. The content fingerprint is
 * still the backstop for a write that evades triggers entirely: a superuser
 * session, a restore, `alter table … disable trigger`, or a table added to the
 * year later without a guard. `session_replication_role='replica'` is the
 * cleanest way to model exactly that in the harness.
 */
export async function outOfBand(db, run) {
  await db.exec("set session_replication_role='replica'");
  try { return await run(); } finally { await db.exec("set session_replication_role='origin'"); }
}

export async function archive(db, user, action, payload = {}) {
  await db.exec(`set role authenticated; set request.jwt.claim.sub='${user}'`);
  try {
    return (await db.query('select public.homework_archive($1,$2::jsonb) r', [action, JSON.stringify(payload)])).rows[0].r;
  } finally { await db.exec('reset role'); }
}

export async function exportEntity(db, user, archiveId, entity, after = null, limit = 500) {
  await db.exec(`set role authenticated; set request.jwt.claim.sub='${user}'`);
  try {
    return (await db.query('select public.homework_archive_export($1,$2,$3,$4) r', [archiveId, entity, after, limit])).rows[0].r;
  } finally { await db.exec('reset role'); }
}

/** Deactivate the year under test so purge is reachable (AC-723 blocks the active one). */
export async function retireYear(db, year = ids.y) {
  await db.query('update public.school_years set is_active=false where id=$1', [year]);
}

/**
 * Walk a run from `begin` to `verified` the honest way: read the media manifest,
 * report each object's real checksum, then complete. `corrupt` lets a test report
 * a wrong hash for one object, and `skip` lets it report nothing for one.
 */
export async function runArchive(db, user, year, { corrupt = null, skip = null } = {}) {
  const run = await archive(db, user, 'begin', { school_year_id: year, archive_format_version: ARCHIVE_FORMAT_VERSION });
  const { items } = await archive(db, user, 'media_manifest', { archive_id: run.id, limit: 500 });
  const truth = new Map((await db.query('select id,checksum from public.homework_attachments')).rows.map(r => [r.id, r.checksum]));
  const report = items
    .filter(item => item.attachment_id !== skip)
    .map(item => ({
      attachment_id: item.attachment_id,
      checksum: item.attachment_id === corrupt ? 'f'.repeat(64) : truth.get(item.attachment_id),
      bytes: item.size_bytes,
    }));
  if (report.length) await archive(db, user, 'report_media', { archive_id: run.id, items: report });
  return archive(db, user, 'complete', {
    archive_id: run.id, checksum: 'a'.repeat(64), archive_size_bytes: '123456',
  });
}

/** verified → download confirmed → purging → run every step. */
export async function purgeAll(db, user, archiveId, checksum) {
  await archive(db, user, 'confirm_download', { archive_id: archiveId, checksum });
  await archive(db, user, 'purge_begin', { archive_id: archiveId, reason: 'kết thúc năm học', confirm_irreversible: true });
  let guard = 0, result;
  do { result = await archive(db, user, 'purge_step', { archive_id: archiveId }); }
  while (!result.done && ++guard < 50);
  return result;
}
