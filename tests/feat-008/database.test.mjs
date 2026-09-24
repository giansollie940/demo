import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { setup as baseline } from '../feat-005/fixture.mjs';
import { setup, storage, storageService, media, mediaService, prepare, sealed, atPercent, planR2, seed, rpc, ids, classId, imageMeta } from './fixture.mjs';

const CAPACITY_HOLD = '53100';
const rejects = (promise, code, message) => assert.rejects(promise, error => {
  assert.equal(error.code ?? error.cause?.code, code, `${message}: expected SQLSTATE ${code}, got ${error.code ?? error.cause?.code} — ${error.message}`);
  return true;
});

test('AC8-01/AC8-02 Admin sees both providers with percent; nobody else reaches storage health at all', async () => {
  const db = await setup();
  try {
    const notice = await seed(db);
    // R2 needs real stored bytes before a percentage means anything.
    const attachment = await sealed(db, notice);
    await rpc(db, ids.s, 'submit', { ...notice, attachment_id: attachment.id });
    await storage(db, ids.a, 'refresh');
    await atPercent(db, 'database', 42);
    await atPercent(db, 'r2', 42);
    const status = await storage(db, ids.a, 'status');
    for (const provider of ['database', 'r2']) {
      assert.ok(status.providers[provider], `${provider} missing`);
      assert.equal(typeof Number(status.providers[provider].percent), 'number');
      assert.ok(Number(status.providers[provider].percent) > 0);
      assert.ok(status.providers[provider].configured_bytes);
    }
    assert.ok('protection_mode' in status.flags && 'r2_upload_locked' in status.flags);
    // Every action, every non-admin role, including the teacher who can
    // otherwise moderate the whole class.
    for (const user of [ids.s, ids.m, ids.t, ids.other])
      for (const action of ['status', 'refresh', 'set_capacity', 'cleanup_pending'])
        await rejects(storage(db, user, action, { provider: 'r2', configured_bytes: '1' }), '42501', `${user} ${action}`);
    // Anonymous and authenticated callers cannot reach the service surface.
    await db.exec('set role authenticated');
    await assert.rejects(db.exec("select public.homework_storage_service('state','{}')"), { code: '42501' });
    await db.exec('reset role');
  } finally { await db.close(); }
});

test('AC8-03 thresholds land on the documented boundaries, and unknown capacity stays unknown', async () => {
  const db = await setup();
  try {
    // Unconfigured is not 0% and not 100%: no level, no percent, no protection.
    await storage(db, ids.a, 'refresh');
    let status = await storage(db, ids.a, 'status');
    assert.equal(status.providers.database.level, 'unconfigured');
    assert.equal(status.providers.database.percent, null);
    assert.equal(status.flags.protection_mode, false);

    for (const [percent, level] of [[50, 'normal'], [69, 'normal'], [70, 'info'], [84, 'info'], [85, 'warning'], [94, 'warning'], [95, 'critical'], [99, 'critical']]) {
      const state = await atPercent(db, 'database', percent);
      assert.equal(state.level, level, `${percent}% should be ${level}, got ${state.level} at ${state.percent}%`);
    }
    // Clearing capacity returns the provider to unknown rather than to 0%.
    await storage(db, ids.a, 'set_capacity', { provider: 'database', configured_bytes: '' });
    status = await storage(db, ids.a, 'status');
    assert.equal(status.providers.database.level, 'unconfigured');
    assert.equal(status.flags.protection_mode, false);
  } finally { await db.close(); }
});

test('AC8-04 R2 at 95% withholds only new images; text notices keep working end to end', async () => {
  const db = await setup();
  try {
    const notice = await seed(db);
    const existing = await sealed(db, notice);
    const published = await rpc(db, ids.s, 'submit', { ...notice, attachment_id: existing.id });
    await atPercent(db, 'r2', 96);
    assert.equal((await storage(db, ids.a, 'status')).flags.r2_upload_locked, true);
    assert.equal((await storage(db, ids.a, 'status')).flags.protection_mode, false);

    await rejects(prepare(db, published), CAPACITY_HOLD, 'new upload under R2 lock');
    // CR-003: the text path is untouched.
    const text = await rpc(db, ids.s, 'submit', { subject_id: notice.subject_id, title: 'Bài chữ', content: 'Vẫn đăng được', due_at: '2026-10-11T12:00:00Z', request_id: crypto.randomUUID() });
    assert.ok(text.id);
    // Already-stored images stay readable, and the author can still clear one.
    assert.ok((await media(db, ids.other, 'read', { attachment_id: existing.id })).object_key);
    // Admin maintenance is exactly what must keep working when storage is full.
    assert.ok(await storage(db, ids.a, 'cleanup_pending'));
    assert.ok(await storage(db, ids.a, 'refresh'));
  } finally { await db.close(); }
});

test('AC8-05/AC8-06/AC8-07/AC8-10 DB at 95% holds hearts and images while every critical write survives', async () => {
  const db = await setup();
  try {
    const notice = await seed(db);
    const attachment = await sealed(db, notice);
    const published = await rpc(db, ids.s, 'submit', { ...notice, attachment_id: attachment.id });
    await rpc(db, ids.other, 'heart', { id: notice.id, liked: true });

    await atPercent(db, 'database', 97);
    assert.equal((await storage(db, ids.a, 'status')).flags.protection_mode, true);

    // AC8-07 + AC8-10: withheld, and withheld as a capacity hold rather than as
    // a permission error, which is what F8-RB-004 forbids.
    await rejects(rpc(db, ids.m, 'heart', { id: notice.id, liked: true }), CAPACITY_HOLD, 'new heart');
    await rejects(prepare(db, published), CAPACITY_HOLD, 'new image');
    await rejects(rpc(db, ids.s, 'submit', { ...published, attachment_id: attachment.id }), CAPACITY_HOLD, 'submit carrying an image');

    // Removing a heart frees a row; blocking it would only make the database
    // fuller and would trap the user in a state they cannot undo.
    assert.ok(await rpc(db, ids.other, 'heart', { id: notice.id, liked: false }));

    // AC8-06: educational critical writes.
    const text = await rpc(db, ids.s, 'submit', { subject_id: notice.subject_id, title: 'Bài chữ', content: 'Nội dung', due_at: '2026-10-12T12:00:00Z', request_id: crypto.randomUUID() });
    assert.ok(text.id);
    const correction = await rpc(db, ids.t, 'correction_request', { id: notice.id, reason: 'Sửa nội dung', issue_types: ['content'] });
    assert.ok(correction.id);
    assert.ok(await rpc(db, ids.m, 'report', { id: notice.id, category: 'content', note: 'Sai đề' }));
    // Admin hard-delete is how Admin frees space, so it must survive protection.
    await rpc(db, ids.s, 'delete', { id: text.id, reason: 'dọn dung lượng' });
    assert.ok(await rpc(db, ids.a, 'hard_delete', { id: text.id, confirm_irreversible: true, hard_delete_reason: 'dọn dung lượng' }));
  } finally { await db.close(); }
});

test('AC8-08 audit keeps recording under protection mode', async () => {
  const db = await setup();
  try {
    const notice = await seed(db);
    await atPercent(db, 'database', 99);
    const before = Number((await db.query('select count(*) n from public.homework_contribution_events')).rows[0].n);
    await rpc(db, ids.s, 'delete', { id: notice.id, reason: 'kiểm tra audit' });
    const after = Number((await db.query('select count(*) n from public.homework_contribution_events')).rows[0].n);
    assert.ok(after > before, 'contribution audit must not be suppressed by protection mode');
    // Storage actions carry their own audit because contribution events are class-scoped.
    await storage(db, ids.a, 'cleanup_pending');
    const events = (await db.query("select event_type from public.homework_storage_events order by created_at")).rows.map(r => r.event_type);
    assert.ok(events.includes('storage_capacity'), 'capacity change audited');
    assert.ok(events.includes('storage_cleanup'), 'cleanup audited');
  } finally { await db.close(); }
});

test('AC8-09 cleanup reuses the FEAT-006 outbox and touches nothing that is still referenced', async () => {
  const db = await setup();
  try {
    const notice = await seed(db);
    const live = await sealed(db, notice);
    const published = await rpc(db, ids.s, 'submit', { ...notice, attachment_id: live.id });
    const stale = await prepare(db, published);
    const fresh = await prepare(db, published, { request_id: crypto.randomUUID() });
    // Age BOTH rows. expires_at only ever meant "this pending upload may be
    // reclaimed"; an active attachment carries the same column from when it was
    // pending. If the sweep ever widened to other statuses, the only thing left
    // protecting a published image would be this filter — so the test must not
    // let a future expires_at hide that.
    // grant_until must be cleared too: the live row still carries the short
    // upload grant from sealing, and that alone would keep the sweep away from
    // it, hiding whether the status filter is doing any work.
    await db.query("update public.homework_attachments set expires_at=now()-interval '1 second',grant_until=null where id in ($1,$2)", [stale.id, live.id]);

    await atPercent(db, 'database', 99);
    const result = await storage(db, ids.a, 'cleanup_pending');
    assert.equal(result.queued, 1, 'only the expired pending upload is a candidate');

    const rows = Object.fromEntries((await db.query('select id,status from public.homework_attachments')).rows.map(r => [r.id, r.status]));
    assert.equal(rows[live.id], 'active', 'referenced media is never a cleanup candidate');
    assert.equal(rows[fresh.id], 'pending', 'pending inside the 24h window is kept for the author');
    assert.equal(rows[stale.id], 'deleting');
    const jobs = await mediaService(db, 'jobs');
    assert.equal(jobs.length, 1);
    assert.equal(jobs[0].id, stale.id, 'purge goes through the FEAT-006 outbox, not a new deletion path');
  } finally { await db.close(); }
});

test('AC8-11 nothing in the storage payload can leak a credential', async () => {
  const db = await setup();
  try {
    await storage(db, ids.a, 'refresh');
    await atPercent(db, 'r2', 80);
    await storageService(db, 'record_usage', { provider: 'r2', provider_bytes: '123456789' });
    const payload = JSON.stringify(await storage(db, ids.a, 'status'));
    assert.doesNotMatch(payload, /secret|access[_-]?key|password|authorization|signature|x-amz|r2\.cloudflarestorage/i);
    // The provider number is used for percent once reported; the app's own
    // aggregate is still kept beside it rather than overwritten.
    const r2 = (await storage(db, ids.a, 'status')).providers.r2;
    assert.equal(Number(r2.provider_bytes), 123456789);
    assert.equal(r2.source, 'provider');
    assert.equal(Number(r2.total_bytes), 123456789);
    assert.equal(typeof Number(r2.metadata_bytes), 'number');
    // A later in-database measurement must not wipe the provider reading.
    await storage(db, ids.a, 'refresh');
    assert.equal(Number((await storage(db, ids.a, 'status')).providers.r2.provider_bytes), 123456789);
  } finally { await db.close(); }
});

test('the FEAT-006 dispatchers are wrapped, not rewritten', async () => {
  const before = await baseline();
  const after = await setup();
  try {
    await before.exec(await readFile(new URL('../../database/upgrade/10-FEAT-006-HOMEWORK-MEDIA.sql', import.meta.url), 'utf8'));
    const body = async (db, name) => (await db.query('select pg_get_functiondef($1::regprocedure) d', [name])).rows[0].d
      .replace(/^CREATE OR REPLACE FUNCTION [^\n]*\n/, '').replace(/^\s*RETURNS jsonb[\s\S]*?AS \$function\$/, '');
    assert.equal(await body(after, 'homework_private.api_v6(text,jsonb)'), await body(before, 'public.homework_api(text,jsonb)'),
      'FEAT-006 homework_api body changed; the RC2 read authorization must not be re-opened');
    assert.equal(await body(after, 'homework_private.media_v6(text,jsonb)'), await body(before, 'public.homework_media(text,jsonb)'),
      'FEAT-006 homework_media body changed');
    // And the guard really is in front of them. Under FEAT007_UPGRADE migration
    // 12 wraps this wrapper in turn, so the assertion follows the chain rather
    // than assuming FEAT-008 is always the outermost layer.
    const guard = await body(after, process.env.FEAT007_UPGRADE ? 'homework_private.api_v8(text,jsonb)' : 'public.homework_api(text,jsonb)');
    assert.match(guard, /storage_guard/);
  } finally { await before.close(); await after.close(); }
});

test('with FEAT-008 installed and healthy, FEAT-006 media behaviour is unchanged', async () => {
  const db = await setup();
  try {
    await atPercent(db, 'database', 20);
    await atPercent(db, 'r2', 20);
    const notice = await seed(db);
    const attachment = await sealed(db, notice);
    const result = await rpc(db, ids.s, 'submit', { ...notice, attachment_id: attachment.id });
    assert.equal(result.attachment_id, attachment.id);
    assert.ok((await media(db, ids.other, 'read', { attachment_id: attachment.id })).object_key);
    // Peer isolation fixed in RC2 still holds with the wrapper in place.
    await db.query('update public.homework_notices set english_group_id=(select id from public.english_groups limit 1) where id=$1', [result.id]).catch(() => {});
    assert.ok(await rpc(db, ids.other, 'heart', { id: result.id, liked: true }));
  } finally { await db.close(); }
});

// ── Sol RC1 P1 ───────────────────────────────────────────────────────────────
// RC1 preferred any non-null provider_bytes forever. One old R2 answer therefore
// kept driving the percentage: a later in-database measurement showing 97% could
// not raise the lock, and an old 97% could not be lowered by a cleanup. Both
// directions are wrong and both contradict DEC-084's stated fallback.

test('RC1 P1 — a stale provider reading cannot suppress a lock the app can already justify', async () => {
  const db = await setup();
  try {
    await storage(db, ids.a, 'refresh');
    const state = await planR2(db, { capacity: 1_000_000, providerPercent: 80, providerAgeHours: 30 * 24, metadataPercent: 97 });
    assert.equal(Number(state.providers.r2.percent), 97);
    assert.equal(state.providers.r2.source, 'metadata');
    assert.equal(state.providers.r2.provider_stale, true);
    assert.equal(state.flags.r2_upload_locked, true, 'metadata at 97% must lock uploads even though an old R2 answer said 80%');
  } finally { await db.close(); }
});

test('RC1 P1 — a stale provider reading cannot keep a lock the app can no longer justify', async () => {
  const db = await setup();
  try {
    await storage(db, ids.a, 'refresh');
    const state = await planR2(db, { capacity: 1_000_000, providerPercent: 97, providerAgeHours: 30 * 24, metadataPercent: 50 });
    assert.equal(Number(state.providers.r2.percent), 50);
    assert.equal(state.providers.r2.source, 'metadata');
    assert.equal(state.providers.r2.provider_stale, true);
    assert.equal(state.flags.r2_upload_locked, false, 'an expired 97% reading must not hold uploads shut');
  } finally { await db.close(); }
});

test('RC1 P1 — a fresh provider reading still wins, and metadata still acts as a floor under it', async () => {
  const db = await setup();
  try {
    await storage(db, ids.a, 'refresh');
    // Fresh and higher than the app's own accounting: this is exactly the case
    // the provider call exists for — R2 sees objects the app has no row for.
    let state = await planR2(db, { capacity: 1_000_000, providerPercent: 96, providerAgeHours: 1, metadataPercent: 40 });
    assert.equal(Number(state.providers.r2.percent), 96);
    assert.equal(state.providers.r2.source, 'provider');
    assert.equal(state.providers.r2.provider_stale, false);
    assert.equal(state.flags.r2_upload_locked, true);

    // Fresh but lower than the app's accounting: pending uploads the provider
    // has not seen yet are real bytes about to exist, so the floor wins and the
    // label says so rather than claiming the provider drove the number.
    state = await planR2(db, { capacity: 1_000_000, providerPercent: 40, providerAgeHours: 1, metadataPercent: 96 });
    assert.equal(Number(state.providers.r2.percent), 96);
    assert.equal(state.providers.r2.source, 'metadata');
    assert.equal(state.providers.r2.provider_stale, false, 'a fresh reading that merely lost is not stale');
    assert.equal(state.flags.r2_upload_locked, true);
  } finally { await db.close(); }
});

test('RC1 P1 — the reported source always names the value that actually drove protection', async () => {
  const db = await setup();
  try {
    await storage(db, ids.a, 'refresh');
    const cases = [
      { providerPercent: 96, providerAgeHours: 1, metadataPercent: 40, source: 'provider', percent: 96 },
      { providerPercent: 96, providerAgeHours: 30 * 24, metadataPercent: 40, source: 'metadata', percent: 40 },
      { providerPercent: 40, providerAgeHours: 1, metadataPercent: 96, source: 'metadata', percent: 96 },
      { providerPercent: null, metadataPercent: 96, source: 'metadata', percent: 96 },
    ];
    for (const c of cases) {
      const r2 = (await planR2(db, { capacity: 1_000_000, ...c })).providers.r2;
      assert.equal(r2.source, c.source, JSON.stringify(c));
      assert.equal(Number(r2.percent), c.percent, JSON.stringify(c));
      // The number the label points at is the number the percentage came from.
      const driving = r2.source === 'provider' ? Number(r2.provider_bytes) : Number(r2.metadata_bytes);
      assert.equal(Number(r2.total_bytes), driving, `source label must match the effective value: ${JSON.stringify(c)}`);
    }
  } finally { await db.close(); }
});

// ── Sol RC2 P1 ───────────────────────────────────────────────────────────────
// RC2 cleared provider_bytes as soon as a cleanup was queued, on the theory that
// the bucket was about to shrink. It is not: media_enqueue only writes an outbox
// job with safe_after minutes in the future, the worker deletes later and may
// fail, and the provider figure also covers objects the app has no row for. So
// "queued" is not "deleted", and it must not buy an unlock.
//
// Shared shape for these four: one 300 000-byte pending attachment past its
// window, capacity 1 000 000, and a fresh R2 answer of 960 000 — i.e. 660 000
// bytes of the bucket are objects the application cannot see at all.
async function queuedCleanupWorld(db) {
  const notice = await seed(db);
  const stale = await prepare(db, notice);
  await db.query("update public.homework_attachments set expires_at=now()-interval '1 second',grant_until=null where id=$1", [stale.id]);
  // planR2 edits the usage row, so the row has to exist first.
  await storage(db, ids.a, 'refresh');
  await planR2(db, { capacity: 1_000_000, providerPercent: 96, providerAgeHours: 1, metadataPercent: 40 });
  assert.equal((await storage(db, ids.a, 'status')).flags.r2_upload_locked, true, 'precondition: 96% locks uploads');
  const result = await storage(db, ids.a, 'cleanup_pending');
  assert.equal(result.queued, 1);
  return stale;
}

test('RC2 P1 — a queued cleanup does not unlock uploads before the provider says the bytes are gone', async () => {
  const db = await setup();
  try {
    await queuedCleanupWorld(db);
    const status = await storage(db, ids.a, 'status');
    assert.equal(Number(status.providers.r2.provider_bytes), 960_000, 'the R2 answer must survive a cleanup request');
    assert.equal(Number(status.providers.r2.percent), 96);
    assert.equal(status.providers.r2.source, 'provider');
    assert.equal(status.flags.r2_upload_locked, true, 'a promise to delete is not a deletion');
  } finally { await db.close(); }
});

test('RC2 P1 — the object is still in the bucket while the job waits, and the evidence is kept that whole time', async () => {
  const db = await setup();
  try {
    const stale = await queuedCleanupWorld(db);
    const row = (await db.query(
      `select a.status, a.size_bytes, o.safe_after>clock_timestamp() waiting, u.provider_bytes, u.deleting_bytes
         from public.homework_attachments a
         join public.homework_media_outbox o on o.attachment_id=a.id
         cross join public.homework_storage_usage u
        where a.id=$1 and u.provider='r2'`, [stale.id])).rows[0];
    assert.equal(row.status, 'deleting');
    assert.equal(row.waiting, true, 'safe_after is minutes in the future — the worker has not run');
    assert.equal(Number(row.provider_bytes), 960_000, 'provider evidence retained while the job is pending');
    // And the bytes are still counted by the app too: a row queued for purge is
    // storage in use until the object is actually gone.
    assert.equal(Number(row.deleting_bytes), 300_000);
  } finally { await db.close(); }
});

test('RC2 P1 — only a fresh provider measurement can lift the lock', async () => {
  const db = await setup();
  try {
    await queuedCleanupWorld(db);
    // The worker has now run and R2 itself reports the bucket below the line.
    // That — and only that — is what unlocks uploads.
    const after = await storageService(db, 'record_usage', { provider: 'r2', provider_bytes: '400000' });
    assert.equal(Number(after.providers.r2.percent), 40);
    assert.equal(after.providers.r2.source, 'provider');
    assert.equal(after.flags.r2_upload_locked, false);
  } finally { await db.close(); }
});

test('RC2 P1 — queuing one tracked attachment cannot clear protection earned by untracked bytes', async () => {
  const db = await setup();
  try {
    await queuedCleanupWorld(db);
    const r2 = (await storage(db, ids.a, 'status')).providers.r2;
    // The app accounts for 300 000 of the 960 000 bytes R2 reports. Even if the
    // queued object vanished this instant, 660 000 bytes the app has no row for
    // would remain, and they are exactly what the provider reading is for.
    assert.equal(Number(r2.metadata_bytes), 300_000);
    assert.ok(Number(r2.provider_bytes) - Number(r2.metadata_bytes) === 660_000);
    assert.equal(Number(r2.total_bytes), 960_000, 'protection still reflects everything in the bucket');
    assert.equal(r2.level, 'critical');
  } finally { await db.close(); }
});

test('RC2 P1 — with no provider reading at all, bytes queued for purge still count as used', async () => {
  const db = await setup();
  try {
    const notice = await seed(db);
    const stale = await prepare(db, notice);
    await db.query("update public.homework_attachments set expires_at=now()-interval '1 second',grant_until=null where id=$1", [stale.id]);
    await storage(db, ids.a, 'refresh');
    // 300 000 bytes against 312 500 of capacity: the app's own accounting is the
    // only evidence there is, and it says 96%.
    await storage(db, ids.a, 'set_capacity', { provider: 'r2', configured_bytes: '312500' });
    let r2 = (await storage(db, ids.a, 'status')).providers.r2;
    assert.equal(Number(r2.percent), 96);
    assert.equal(r2.source, 'metadata');

    assert.equal((await storage(db, ids.a, 'cleanup_pending')).queued, 1);
    const status = await storage(db, ids.a, 'status');
    r2 = status.providers.r2;
    assert.equal(Number(r2.deleting_bytes), 300_000);
    assert.equal(Number(r2.pending_bytes), 0);
    assert.equal(Number(r2.metadata_bytes), 300_000, 'a row queued for purge is still occupying the bucket');
    assert.equal(Number(r2.percent), 96);
    assert.equal(status.flags.r2_upload_locked, true);
  } finally { await db.close(); }
});

// ── Sol RC3 §8 ───────────────────────────────────────────────────────────────
// DEPLOYMENT.md claimed "a stale snapshot never escalates into protection by
// itself". The code does not work that way and should not: an old measurement
// is still the only evidence there is. The doc was wrong; this test pins the
// behaviour so the two cannot drift apart again.

test('RC3 — a measurement older than 24 hours is labelled stale but still protects', async () => {
  const db = await setup();
  try {
    await storage(db, ids.a, 'refresh');
    await storage(db, ids.a, 'set_capacity', { provider: 'r2', configured_bytes: '1000000' });
    await db.query("update public.homework_storage_usage set metadata_bytes=960000,measured_at=clock_timestamp()-interval '40 hours' where provider='r2'");
    const status = await storage(db, ids.a, 'status');
    assert.equal(status.providers.r2.stale, true);
    assert.equal(Number(status.providers.r2.percent), 96);
    assert.equal(status.providers.r2.level, 'critical');
    // The cron dying must not open the floodgates.
    assert.equal(status.flags.r2_upload_locked, true, 'an old measurement is still evidence; silence is not a reason to stop protecting');
  } finally { await db.close(); }
});

test('RC3 — a provider that was never measured withholds nothing', async () => {
  const db = await setup();
  try {
    // Capacity configured, but no measurement has ever run: no percentage, no
    // level, no protection. Staleness reports a gap; it never invents one.
    await storage(db, ids.a, 'set_capacity', { provider: 'r2', configured_bytes: '1000000' });
    const status = await storage(db, ids.a, 'status');
    assert.equal(status.providers.r2.percent, null);
    assert.equal(status.providers.r2.level, 'unknown');
    assert.equal(status.flags.r2_upload_locked, false);
    assert.equal(status.flags.protection_mode, false);
  } finally { await db.close(); }
});
