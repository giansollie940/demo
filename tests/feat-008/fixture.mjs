import { readFile } from 'node:fs/promises';
import { setup as baseline, seed, rpc, server, ids, classId } from '../feat-005/fixture.mjs';
export { seed, rpc, server, ids, classId };

const sql = name => readFile(new URL('../../database/upgrade/' + name, import.meta.url), 'utf8');

export async function setup({ storage = true } = {}) {
  const db = await baseline();
  await db.exec(await sql('10-FEAT-006-HOMEWORK-MEDIA.sql'));
  if (storage) await db.exec(await sql('11-FEAT-008-STORAGE-HEALTH.sql'));
  // FEAT007_UPGRADE re-runs this whole suite with migration 12 installed: the
  // archive read-only guard must be invisible until a year is actually archived.
  if (storage && process.env.FEAT007_UPGRADE) {
    await db.exec(`alter table public.school_years add column if not exists name text;
      alter table public.school_years add column if not exists is_active boolean not null default false;
      update public.school_years set name=coalesce(name,'nam-hoc'), is_active=true;`);
    await db.exec(await sql('12-FEAT-007-ARCHIVE-PURGE.sql'));
  }
  return db;
}

export async function storage(db, user, action, payload = {}) {
  await db.exec(`set role authenticated; set request.jwt.claim.sub='${user}'`);
  try {
    return (await db.query('select public.homework_storage($1,$2::jsonb) r', [action, JSON.stringify(payload)])).rows[0].r;
  } finally { await db.exec('reset role'); }
}

export async function storageService(db, action, payload = {}) {
  await db.exec('set role service_role');
  try {
    return (await db.query('select public.homework_storage_service($1,$2::jsonb) r', [action, JSON.stringify(payload)])).rows[0].r;
  } finally { await db.exec('reset role'); }
}

export async function media(db, user, action, payload = {}) {
  await db.exec(`set role authenticated; set request.jwt.claim.sub='${user}'`);
  try {
    return (await db.query('select public.homework_media($1,$2::jsonb) r', [action, JSON.stringify({ class_id: classId, ...payload })])).rows[0].r;
  } finally { await db.exec('reset role'); }
}

export async function mediaService(db, action, payload = {}) {
  await db.exec('set role service_role');
  try {
    return (await db.query('select public.homework_media_service($1,$2::jsonb) r', [action, JSON.stringify(payload)])).rows[0].r;
  } finally { await db.exec('reset role'); }
}

export const imageMeta = { size_bytes: 300000, width: 1600, height: 900, checksum: 'a'.repeat(64) };

export async function prepare(db, notice, extra = {}) {
  return media(db, ids.s, 'prepare', { notice_id: notice?.id, revision: notice?.revision, request_id: crypto.randomUUID(), ...imageMeta, ...extra });
}

export async function sealed(db, notice, extra = {}) {
  const attachment = await prepare(db, notice, extra);
  await media(db, ids.s, 'ticket', { attachment_id: attachment.id });
  await mediaService(db, 'seal', { attachment_id: attachment.id, owner_id: ids.s });
  return attachment;
}

/**
 * Drive a provider to an exact percentage without needing a real database of
 * that size: capacity is configuration, so the test sets capacity relative to
 * the measured usage rather than trying to manufacture bytes.
 */
export async function atPercent(db, provider, percent) {
  await storage(db, ids.a, 'refresh');
  const used = Number((await db.query('select coalesce(provider_bytes,metadata_bytes) b from public.homework_storage_usage where provider=$1', [provider])).rows[0].b);
  const capacity = Math.max(1, Math.floor(used * 100 / percent));
  await storage(db, ids.a, 'set_capacity', { provider, configured_bytes: String(capacity) });
  return (await storage(db, ids.a, 'status')).providers[provider];
}

/**
 * Plant an R2 provider reading of a chosen age, plus the app-side metadata
 * figure, both expressed as a percentage of configured capacity. Used to drive
 * the stale-provider cases: a provider answer is authoritative only while it is
 * recent, and the application's own accounting must still be able to raise the
 * lock when the provider has gone quiet.
 */
export async function planR2(db, { capacity, providerPercent = null, providerAgeHours = 0, metadataPercent = 0 }) {
  await storage(db, ids.a, 'set_capacity', { provider: 'r2', configured_bytes: String(capacity) });
  await db.query(
    `update public.homework_storage_usage
       set metadata_bytes=$1, measured_at=now(),
           provider_bytes=$2,
           provider_measured_at=case when $2::bigint is null then null else now()-($3||' hours')::interval end
     where provider='r2'`,
    [Math.floor(capacity * metadataPercent / 100),
      providerPercent === null ? null : Math.floor(capacity * providerPercent / 100),
      String(providerAgeHours)],
  );
  return (await storage(db, ids.a, 'status'));
}
