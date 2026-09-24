import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup as feat008Setup } from '../feat-008/fixture.mjs';
import {
  setup, archive, exportEntity, runArchive, purgeAll, retireYear, populateOtherYear, outOfBand, mediaService,
  seed, rpc, media, sealed, prepare, storage, ids, classId, yearB, classB2, ARCHIVE_FORMAT_VERSION,
} from './fixture.mjs';

const rejects = (promise, message, code = null) => assert.rejects(promise, error => {
  if (code) assert.equal(error.code ?? error.cause?.code, code, `${message}: expected SQLSTATE ${code}, got ${error.code}`);
  return true;
}, message);

/**
 * A year with one published notice, one sealed image, one heart — and then
 * retired, because RC2 refuses to archive the year that is still being taught.
 * Tests that care about the active year re-activate it explicitly.
 */
async function populate(db, { retire = true } = {}) {
  const notice = await seed(db);
  const attachment = await sealed(db, notice);
  const published = await rpc(db, ids.s, 'submit', { ...notice, attachment_id: attachment.id });
  await rpc(db, ids.other, 'heart', { id: notice.id, liked: true });
  if (retire) await retireYear(db);
  return { notice, attachment, published };
}

const activate = db => db.query('update public.school_years set is_active=true where id=$1', [ids.y]);

test('AC-701 preflight reports the counts, the media size and anything that would make the archive incomplete', async () => {
  const db = await setup();
  try {
    const { attachment } = await populate(db);
    let pre = await archive(db, ids.a, 'preflight', { school_year_id: ids.y });
    assert.equal(pre.school_year_name, '2026-2027');
    assert.equal(Number(pre.counts.classes), 1);
    assert.equal(Number(pre.counts.notices), 1);
    assert.equal(Number(pre.counts.reactions), 1);
    assert.equal(Number(pre.counts.profiles), 5);
    assert.equal(Number(pre.counts.media), 1);
    assert.equal(Number(pre.media_bytes), 300000);
    assert.ok(Number(pre.counts.contribution_events) > 0, 'audit events belong in the preflight');
    assert.deepEqual(pre.blockers, []);

    // EC-714: an unfinished upload is not year data. It must be resolved before
    // the archive, not silently archived as if it were a published image.
    const notice2 = await rpc(db, ids.s, 'submit', { subject_id: (await archive(db, ids.a, 'preflight', { school_year_id: ids.y })) && undefined, ...{} }).catch(() => null);
    void notice2;
    await prepare(db, { id: null, revision: null });
    pre = await archive(db, ids.a, 'preflight', { school_year_id: ids.y });
    assert.ok(pre.blockers.some(b => b.code === 'pending_media'), JSON.stringify(pre.blockers));
    await rejects(archive(db, ids.a, 'begin', { school_year_id: ids.y, archive_format_version: ARCHIVE_FORMAT_VERSION }),
      'a blocked year must not start a run');
    void attachment;
  } finally { await db.close(); }
});

test('AC-702 no role other than Admin reaches any archive or purge action', async () => {
  const db = await setup();
  try {
    await populate(db);
    for (const user of [ids.s, ids.m, ids.t, ids.other])
      for (const action of ['preflight', 'list', 'begin', 'media_manifest', 'report_media', 'complete', 'confirm_download', 'set_read_only', 'purge_begin', 'purge_step', 'purge_status'])
        await rejects(archive(db, user, action, { school_year_id: ids.y, archive_id: crypto.randomUUID() }), `${user} ${action}`, '42501');
    const run = await runArchive(db, ids.a, ids.y);
    for (const user of [ids.s, ids.m, ids.t, ids.other])
      await rejects(exportEntity(db, user, run.id, 'homework_notices'), `${user} export`, '42501');
    // And the surface is not reachable at all without a session.
    await db.exec('set role authenticated');
    await assert.rejects(db.exec("select public.homework_archive('list','{}')"), { code: '42501' });
    await db.exec('reset role');
  } finally { await db.close(); }
});

test('AC-703/AC-704 the export carries the data and an archive_path, and never a URL or a secret', async () => {
  const db = await setup();
  try {
    await populate(db);
    const run = await runArchive(db, ids.a, ids.y);
    const entities = ['classes', 'students', 'subjects', 'class_subjects', 'english_groups', 'english_group_memberships',
      'homework_notices', 'homework_reactions', 'homework_reminders', 'homework_reports', 'homework_corrections',
      'homework_revisions', 'homework_duplicate_reviews', 'homework_tombstones', 'audit', 'moderation', 'media_index'];
    let all = '';
    for (const entity of entities) {
      const page = await exportEntity(db, ids.a, run.id, entity);
      assert.equal(page.entity, entity);
      assert.ok(Array.isArray(page.rows), entity);
      all += JSON.stringify(page.rows);
    }
    const mediaIndex = (await exportEntity(db, ids.a, run.id, 'media_index')).rows;
    assert.equal(mediaIndex.length, 1);
    assert.match(mediaIndex[0].archive_path, /^media\/[0-9a-f-]{36}\.webp$/);
    // BR-711/AC-729. A signed URL is a credential with a short life; persisting
    // one in an archive that outlives it is both useless and unsafe.
    assert.doesNotMatch(all, /X-Amz-|Signature=|https?:\/\//, 'no signed URL or remote link may appear in exported rows');
    assert.doesNotMatch(all, /service_role|SUPABASE_|R2_|secret|api[_-]?key/i, 'no credential-shaped field may appear');
    // The roster is whitelisted rather than dumped, so a column Supabase adds to
    // profiles later cannot walk into the archive unnoticed.
    const student = (await exportEntity(db, ids.a, run.id, 'students')).rows[0];
    assert.deepEqual(Object.keys(student).sort(), ['active', 'class_id', 'deleted_at', 'full_name', 'id', 'role']);
  } finally { await db.close(); }
});

test('AC-705/AC-706/EC-702 one unreported image is enough to fail the archive', async () => {
  const db = await setup();
  try {
    const { attachment } = await populate(db);
    const run = await runArchive(db, ids.a, ids.y, { skip: attachment.id });
    assert.equal(run.status, 'failed');
    assert.match(run.failure_reason, /^media_missing:1$/);
    // The rejection must come from the verification gate itself. Asserting only
    // that *something* refused would pass even if that check were deleted, since
    // the download gate would catch it next — two guards, one of them untested.
    await assert.rejects(
      archive(db, ids.a, 'purge_begin', { archive_id: run.id, reason: 'x', confirm_irreversible: true }),
      error => { assert.match(error.message, /đạt kiểm tra/); assert.equal(error.code, '42501'); return true },
      'a failed archive must be refused for not being verified');
    // And it cannot be talked into a confirmation either.
    await rejects(archive(db, ids.a, 'confirm_download', { archive_id: run.id, checksum: 'a'.repeat(64) }),
      'a failed archive has no fingerprint to confirm');
  } finally { await db.close(); }
});

test('EC-701/EC-707 bytes that do not hash to what the server recorded fail the archive', async () => {
  const db = await setup();
  try {
    const { attachment } = await populate(db);
    const run = await runArchive(db, ids.a, ids.y, { corrupt: attachment.id });
    assert.equal(run.status, 'failed');
    assert.match(run.failure_reason, /^media_checksum_mismatch:1$/);
    assert.equal(run.verified_at, null);
  } finally { await db.close(); }
});

test('the server never hands out the checksum it is going to check against', async () => {
  const db = await setup();
  try {
    await populate(db);
    const run = await archive(db, ids.a, 'begin', { school_year_id: ids.y, archive_format_version: ARCHIVE_FORMAT_VERSION });
    const { items } = await archive(db, ids.a, 'media_manifest', { archive_id: run.id });
    const expected = (await db.query('select checksum from public.homework_attachments limit 1')).rows[0].checksum;
    assert.equal(items.length, 1);
    assert.ok(!JSON.stringify(items).includes(expected),
      'media_manifest leaking expected_checksum would let a client claim integrity it never verified');
    assert.ok(!JSON.stringify(await exportEntity(db, ids.a, run.id, 'media_index')).includes(expected));
  } finally { await db.close(); }
});

test('the year changing mid-run fails the archive rather than shipping a stale one', async () => {
  const db = await setup();
  try {
    const { notice } = await populate(db);
    const run = await archive(db, ids.a, 'begin', { school_year_id: ids.y, archive_format_version: ARCHIVE_FORMAT_VERSION });
    const { items } = await archive(db, ids.a, 'media_manifest', { archive_id: run.id });
    const truth = new Map((await db.query('select id,checksum from public.homework_attachments')).rows.map(r => [r.id, r.checksum]));
    await archive(db, ids.a, 'report_media', { archive_id: run.id, items: items.map(i => ({ attachment_id: i.attachment_id, checksum: truth.get(i.attachment_id), bytes: i.size_bytes })) });
    // The run freezes the year, so the app cannot write to it — this must come
    // from something the freeze does not cover, such as the SQL editor or a
    // service-role job. That is exactly the residual risk the count check exists
    // for, and it is why the count check is kept alongside the fingerprint.
    await rejects(rpc(db, ids.m, 'heart', { id: notice.id, liked: true }), 'the freeze holds during the run', '42501');
    await outOfBand(db, () => db.query('insert into public.homework_notice_reactions(notice_id,user_id) values($1,$2)', [notice.id, ids.m]));
    const done = await archive(db, ids.a, 'complete', { archive_id: run.id, checksum: 'a'.repeat(64), archive_size_bytes: '10' });
    assert.equal(done.status, 'failed');
    assert.equal(done.failure_reason, 'year_changed_during_archive');
  } finally { await db.close(); }
});

test('DEC-069/RB-718 a run without a declared format version is refused', async () => {
  const db = await setup();
  try {
    await populate(db);
    await rejects(archive(db, ids.a, 'begin', { school_year_id: ids.y }), 'archive_format_version is mandatory');
    // A blank one too: NOT NULL would let this through, and a viewer cannot
    // decide whether it can read an archive that declares nothing.
    await rejects(archive(db, ids.a, 'begin', { school_year_id: ids.y, archive_format_version: '  ' }), 'a blank version is no version');
    const run = await runArchive(db, ids.a, ids.y);
    assert.equal(run.archive_format_version, ARCHIVE_FORMAT_VERSION);
  } finally { await db.close(); }
});

test('AC-707/AC-708/EC-703 purge stays shut until the archive is verified and the saved file has been re-opened', async () => {
  const db = await setup();
  try {
    await populate(db);
    await retireYear(db);
    const run = await runArchive(db, ids.a, ids.y);
    assert.equal(run.status, 'verified');

    // AC-708: verified is not enough. A tick box would pass here; re-opening the
    // file is what distinguishes "I downloaded it" from "I meant to".
    await rejects(archive(db, ids.a, 'purge_begin', { archive_id: run.id, reason: 'xong năm', confirm_irreversible: true }),
      'purge before the download is confirmed', '42501');
    // EC-703: an interrupted download produces a file that is not this archive.
    await rejects(archive(db, ids.a, 'confirm_download', { archive_id: run.id, checksum: 'b'.repeat(64) }),
      'a different file must not unlock purge');
    assert.equal((await archive(db, ids.a, 'purge_status', { archive_id: run.id })).download_confirmed_at, null);

    await archive(db, ids.a, 'confirm_download', { archive_id: run.id, checksum: run.checksum });
    // Reason and the irreversibility acknowledgement are still required.
    await rejects(archive(db, ids.a, 'purge_begin', { archive_id: run.id, reason: '   ', confirm_irreversible: true }), 'empty reason');
    await rejects(archive(db, ids.a, 'purge_begin', { archive_id: run.id, reason: 'xong năm' }), 'missing irreversible confirmation');
    assert.equal((await archive(db, ids.a, 'purge_begin', { archive_id: run.id, reason: 'xong năm', confirm_irreversible: true })).status, 'purging');
  } finally { await db.close(); }
});

test('AC-723/EC-712 the active school year cannot be purged', async () => {
  const db = await setup();
  try {
    await populate(db);
    const run = await runArchive(db, ids.a, ids.y);
    await archive(db, ids.a, 'confirm_download', { archive_id: run.id, checksum: run.checksum });
    // Someone switches the active year back after the archive was taken.
    await activate(db);
    await rejects(archive(db, ids.a, 'purge_begin', { archive_id: run.id, reason: 'xong năm', confirm_irreversible: true }),
      'active year purge', '42501');
    await retireYear(db);
    assert.equal((await archive(db, ids.a, 'purge_begin', { archive_id: run.id, reason: 'xong năm', confirm_irreversible: true })).status, 'purging');
  } finally { await db.close(); }
});

test('AC-710/AC-711/EC-706 purge takes the year it was given and nothing else', async () => {
  const db = await setup();
  try {
    await populate(db);
    const other = await populateOtherYear(db);
    await retireYear(db);
    const run = await runArchive(db, ids.a, ids.y);
    const done = await purgeAll(db, ids.a, run.id, run.checksum);
    assert.equal(done.done, true);
    assert.equal(done.status, 'purged');

    const count = async (q, params = []) => Number((await db.query(q, params)).rows[0].n);
    // The chosen year is gone…
    assert.equal(await count('select count(*) n from public.homework_notices where school_year_id=$1', [ids.y]), 0);
    assert.equal(await count('select count(*) n from public.homework_notice_reactions'), 1, 'only the other year\'s reaction should remain');
    assert.equal(await count('select count(*) n from public.homework_contribution_events where class_id=$1', [classId]), 0);
    // …and every row of the neighbouring year is still exactly where it was.
    // Without real rows here this assertion would pass against a purge that
    // deleted every year in the database.
    assert.equal(await count('select count(*) n from public.homework_notices where id=$1', [other.notice]), 1);
    assert.equal(await count('select count(*) n from public.homework_notice_reactions where notice_id=$1', [other.notice]), 1);
    assert.equal(await count('select count(*) n from public.homework_contribution_events where class_id=$1', [classB2]), 1);
    assert.equal(await count('select count(*) n from public.class_subjects where id=$1', [other.subject]), 1);
    assert.equal(await count('select count(*) n from public.english_groups where id=$1', [other.group]), 1);
    assert.equal(await count('select count(*) n from public.english_group_members where id=$1', [other.member]), 1);
    assert.equal(await count('select count(*) n from public.homework_settings where class_id=$1', [classB2]), 1);
    // And the other year's image is neither queued for deletion nor touched.
    assert.equal((await db.query('select status from public.homework_attachments where id=$1', [other.attachment])).rows[0].status, 'active');
    assert.equal(await count('select count(*) n from public.homework_media_outbox where attachment_id=$1', [other.attachment]), 0);
    assert.equal(await count(`select count(*) n from public.classes where school_year_id='${yearB}'`), 1);
    assert.equal(await count(`select count(*) n from public.school_years where id='${yearB}'`), 1);
    assert.ok(await count('select count(*) n from public.grade_subject_catalog') > 0,
      'the shared grade catalog is used by other years and must survive');
    assert.ok(await count('select count(*) n from public.profiles') >= 5,
      'people carry over between years; purge removes their year data, not them');
    assert.ok(await count('select count(*) n from public.classes') >= 1);
  } finally { await db.close(); }
});

test('AC-712/AC-713 the index survives the purge and holds no purged detail', async () => {
  const db = await setup();
  try {
    await populate(db);
    await retireYear(db);
    const run = await runArchive(db, ids.a, ids.y);
    await purgeAll(db, ids.a, run.id, run.checksum);
    const { archives } = await archive(db, ids.a, 'list');
    assert.equal(archives.length, 1);
    const index = archives[0];
    assert.equal(index.status, 'purged');
    assert.equal(index.school_year_name, '2026-2027');
    assert.equal(Number(index.media_count), 1);
    assert.equal(Number(index.media_bytes), 300000);
    assert.ok(index.checksum && index.purged_at && index.purged_by && index.purge_reason);
    // Counts and identity, not content: no title, body or student name may be
    // reachable through the index after the detail is gone.
    const text = JSON.stringify(index);
    assert.doesNotMatch(text, /Bài tập|Trang 10|Student|Monitor/, 'the index must not carry purged content');
  } finally { await db.close(); }
});

test('AC-721 purge records who, when, why, and every step it took', async () => {
  const db = await setup();
  try {
    await populate(db);
    await retireYear(db);
    const run = await runArchive(db, ids.a, ids.y);
    await purgeAll(db, ids.a, run.id, run.checksum);
    const events = (await db.query('select event_type,actor_id,data from public.homework_archive_events order by created_at')).rows;
    const types = events.map(e => e.event_type);
    for (const expected of ['archive_begin', 'archive_verified', 'archive_download_confirmed', 'purge_begin', 'purge_step', 'purge_complete'])
      assert.ok(types.includes(expected), `${expected} missing from ${types.join(',')}`);
    assert.ok(events.every(e => e.actor_id === ids.a), 'every archive event names its actor');
    assert.equal(events.find(e => e.event_type === 'purge_begin').data.reason, 'kết thúc năm học');
  } finally { await db.close(); }
});

test('AC-722/EC-705 an interrupted purge resumes from its checkpoint instead of restarting or lying', async () => {
  const db = await setup();
  try {
    await populate(db);
    await retireYear(db);
    const run = await runArchive(db, ids.a, ids.y);
    await archive(db, ids.a, 'confirm_download', { archive_id: run.id, checksum: run.checksum });
    await archive(db, ids.a, 'purge_begin', { archive_id: run.id, reason: 'xong năm', confirm_irreversible: true });

    const first = await archive(db, ids.a, 'purge_step', { archive_id: run.id });
    const second = await archive(db, ids.a, 'purge_step', { archive_id: run.id });
    assert.equal(first.done, false);
    assert.notEqual(first.step, second.step, 'each call advances to the next step');
    let status = await archive(db, ids.a, 'purge_status', { archive_id: run.id });
    // RB-713: partially run is reported as partially run.
    assert.equal(status.status, 'purging');
    assert.equal(status.purged_at, null);
    assert.equal(status.steps.filter(s => s.state === 'done').length, 2);
    assert.ok(status.steps.some(s => s.state === 'pending'));

    // Simulate a crash mid-step: the row is left 'running'.
    await db.query(`update public.homework_archive_steps set state='running' where archive_id=$1 and step='reminders'`, [run.id]);
    let guard = 0, result;
    do { result = await archive(db, ids.a, 'purge_step', { archive_id: run.id }); } while (!result.done && ++guard < 50);
    assert.equal(result.done, true);
    status = await archive(db, ids.a, 'purge_status', { archive_id: run.id });
    assert.equal(status.status, 'purged');
    assert.ok(status.steps.every(s => s.state === 'done'));
    // And running it again is harmless rather than a second destructive pass.
    await rejects(archive(db, ids.a, 'purge_step', { archive_id: run.id }), 'a finished purge has no further steps');
  } finally { await db.close(); }
});

test('RB-713 media leaves R2 only through the FEAT-006 outbox, and only during purge', async () => {
  const db = await setup();
  try {
    const { attachment } = await populate(db);
    await retireYear(db);
    const run = await runArchive(db, ids.a, ids.y);
    // Archiving queues no deletion. (FEAT-006 already has a 'staging' job here
    // from promoting the upload; that one removes the staging copy, not the
    // published object, so the assertion is about purge jobs specifically.)
    assert.equal(Number((await db.query("select count(*) n from public.homework_media_outbox where kind='purge'")).rows[0].n), 0);
    assert.equal((await db.query('select status from public.homework_attachments where id=$1', [attachment.id])).rows[0].status, 'active');

    await purgeAll(db, ids.a, run.id, run.checksum);
    const row = (await db.query(`select a.status, o.reason, o.safe_after>clock_timestamp() waiting
      from public.homework_attachments a join public.homework_media_outbox o on o.attachment_id=a.id where a.id=$1`, [attachment.id])).rows[0];
    assert.equal(row.status, 'deleting');
    assert.equal(row.reason, 'year_purge');
    assert.equal(row.waiting, true, 'the object is still in the bucket until the worker confirms');
  } finally { await db.close(); }
});

test('DEC-091 a FEAT-002 tombstone survives the purge and its references still resolve', async () => {
  const db = await setup();
  try {
    const { notice } = await populate(db);
    const extra = await rpc(db, ids.s, 'submit', { subject_id: notice.subject_id, title: 'Bài sẽ xoá cứng', content: 'Nội dung', due_at: '2026-10-20T12:00:00Z', request_id: crypto.randomUUID() });
    await rpc(db, ids.s, 'delete', { id: extra.id, reason: 'nhầm' });
    await rpc(db, ids.a, 'hard_delete', { id: extra.id, confirm_irreversible: true, hard_delete_reason: 'trùng bài' });
    assert.equal(Number((await db.query('select count(*) n from public.homework_tombstones')).rows[0].n), 1);

    await retireYear(db);
    const run = await runArchive(db, ids.a, ids.y);
    // EC-713: the tombstone is exported as FEAT-002 wrote it, redaction intact.
    const stones = (await exportEntity(db, ids.a, run.id, 'homework_tombstones')).rows;
    assert.equal(stones.length, 1);
    assert.equal(stones[0].hard_delete_reason, 'trùng bài');
    assert.ok(!('title' in stones[0]) && !('content' in stones[0]), 'the tombstone never held the content and must not gain it');

    await purgeAll(db, ids.a, run.id, run.checksum);
    // FEAT-002 makes the tombstone permanent, so purge keeps it — and therefore
    // keeps the subject row it points at, rather than breaking the reference.
    assert.equal(Number((await db.query('select count(*) n from public.homework_tombstones')).rows[0].n), 1);
    const dangling = Number((await db.query(`select count(*) n from public.homework_tombstones t
      where t.subject_id is not null and not exists(select 1 from public.class_subjects s where s.id=t.subject_id)`)).rows[0].n);
    assert.equal(dangling, 0, 'a surviving tombstone must not be left pointing at a deleted subject');
  } finally { await db.close(); }
});

test('RB-711 an archived year is readable and nothing else', async () => {
  const db = await setup();
  try {
    const { notice, published } = await populate(db);
    const run = await runArchive(db, ids.a, ids.y);
    assert.equal((await archive(db, ids.a, 'set_read_only', { archive_id: run.id })).archive_state, 'archived_read_only');

    // Reading keeps working, for every role.
    assert.ok(await rpc(db, ids.s, 'load', {}));
    assert.ok(await rpc(db, ids.t, 'inbox', {}));
    // Writing does not, and it is refused as a permission, not as a crash.
    await rejects(rpc(db, ids.s, 'submit', { subject_id: notice.subject_id, title: 'Bài mới', content: 'Nội dung', due_at: '2026-11-01T12:00:00Z', request_id: crypto.randomUUID() }), 'submit', '42501');
    await rejects(rpc(db, ids.other, 'heart', { id: published.id, liked: true }), 'heart', '42501');
    await rejects(rpc(db, ids.m, 'report', { id: published.id, category: 'content', note: 'sai' }), 'report', '42501');
    await rejects(rpc(db, ids.t, 'correction_request', { id: published.id, reason: 'sửa', issue_types: ['content'] }), 'correction_request', '42501');
    await rejects(rpc(db, ids.s, 'delete', { id: published.id, reason: 'x' }), 'delete', '42501');
    await rejects(media(db, ids.s, 'prepare', { notice_id: published.id, revision: published.revision, request_id: crypto.randomUUID(), size_bytes: 1000, width: 10, height: 10, checksum: 'b'.repeat(64) }), 'prepare', '42501');
    // Existing images stay viewable: read-only means read.
    assert.ok((await media(db, ids.t, 'read', { attachment_id: (await db.query('select id from public.homework_attachments limit 1')).rows[0].id })).object_key);
    // The other year is unaffected by the flag.
    assert.equal((await db.query(`select archive_state from public.school_years where id='${yearB}'`)).rows[0].archive_state, 'active');
  } finally { await db.close(); }
});

test('RB-711 read-only is reachable only behind a verified archive', async () => {
  const db = await setup();
  try {
    await populate(db);
    const run = await archive(db, ids.a, 'begin', { school_year_id: ids.y, archive_format_version: ARCHIVE_FORMAT_VERSION });
    await rejects(archive(db, ids.a, 'set_read_only', { archive_id: run.id }), 'no verified archive yet');
    // The run freezes the year, but that is the temporary 'archiving' state, not
    // the permanent read-only one RB-711 describes — and abandoning the run lets
    // the year go back to normal instead of trapping it.
    assert.equal((await db.query(`select archive_state from public.school_years where id='${ids.y}'`)).rows[0].archive_state, 'archiving');
    await archive(db, ids.a, 'abandon', { archive_id: run.id });
    assert.equal((await db.query(`select archive_state from public.school_years where id='${ids.y}'`)).rows[0].archive_state, 'active');
    assert.ok(await rpc(db, ids.s, 'load', {}), 'reads keep working either way');
  } finally { await db.close(); }
});

test('EC-704 two runs of the same year stay distinguishable', async () => {
  const db = await setup();
  try {
    await populate(db);
    const first = await runArchive(db, ids.a, ids.y);
    const second = await runArchive(db, ids.a, ids.y);
    assert.notEqual(first.id, second.id);
    assert.equal(first.status, 'verified');
    assert.equal(second.status, 'verified');
    const { archives } = await archive(db, ids.a, 'list');
    assert.equal(archives.length, 2);
    assert.equal(new Set(archives.map(a => a.id)).size, 2);
  } finally { await db.close(); }
});

test('the FEAT-006/008 dispatchers are wrapped, not rewritten', async () => {
  const before = await feat008Setup();
  const after = await setup();
  try {
    const body = async (db, name) => (await db.query('select pg_get_functiondef($1::regprocedure) d', [name])).rows[0].d
      .replace(/^CREATE OR REPLACE FUNCTION [^\n]*\n/, '').replace(/^\s*RETURNS jsonb[\s\S]*?AS \$function\$/, '');
    assert.equal(await body(after, 'homework_private.api_v8(text,jsonb)'), await body(before, 'public.homework_api(text,jsonb)'),
      'migration 11 homework_api body changed; FEAT-008 capacity guards must not be re-opened');
    assert.equal(await body(after, 'homework_private.media_v8(text,jsonb)'), await body(before, 'public.homework_media(text,jsonb)'),
      'migration 11 homework_media body changed');
    assert.equal(await body(after, 'homework_private.api_v6(text,jsonb)'), await body(before, 'homework_private.api_v6(text,jsonb)'),
      'the FEAT-006 body must still be the FEAT-006 body two wrappers down');
    assert.match(await body(after, 'public.homework_api(text,jsonb)'), /archive_readonly/);
  } finally { await before.close(); await after.close(); }
});

test('AC-726 installing FEAT-007 changes nothing until an Admin archives a year', async () => {
  const db = await setup();
  try {
    const { notice, published, attachment } = await populate(db);
    // The whole FEAT-001→008 surface still behaves exactly as before: posting,
    // hearting, reporting, correcting, images and storage health.
    assert.ok(await rpc(db, ids.s, 'submit', { subject_id: notice.subject_id, title: 'Bài khác', content: 'Nội dung', due_at: '2026-10-15T12:00:00Z', request_id: crypto.randomUUID() }));
    assert.ok(await rpc(db, ids.m, 'heart', { id: published.id, liked: true }));
    assert.ok(await rpc(db, ids.m, 'report', { id: published.id, category: 'content', note: 'sai đề' }));
    assert.ok((await media(db, ids.t, 'read', { attachment_id: attachment.id })).object_key);
    assert.ok(await storage(db, ids.a, 'status'));
    assert.equal((await db.query(`select archive_state from public.school_years where id='${ids.y}'`)).rows[0].archive_state, 'active');
  } finally { await db.close(); }
});

// ── Sol RC1 P1 ───────────────────────────────────────────────────────────────
// RC1 compared record counts at `begin` against `complete` and nothing after
// that. An update preserves counts, and anything at all could happen between
// verification and purge, so a stale archive could authorise deleting rows it
// never contained. RC2 freezes the year for the run and records a fingerprint of
// the year's row *content*, re-checked in the same statement that starts a purge.

test('RC1 P1 — an update that changes no row count still blocks the purge', async () => {
  const db = await setup();
  try {
    const { published } = await populate(db);
    const run = await runArchive(db, ids.a, ids.y);
    assert.equal(run.status, 'verified');
    await archive(db, ids.a, 'confirm_download', { archive_id: run.id, checksum: run.checksum });

    const before = Number((await db.query('select count(*) n from public.homework_notices')).rows[0].n);
    // Not through the app — the freeze already blocks that. This is the SQL
    // editor or a service-role job, which is the case counts were blind to.
    await outOfBand(db, () => db.query(`update public.homework_notices set title='Tiêu đề sửa sau khi đóng gói' where id=$1`, [published.id]));
    assert.equal(Number((await db.query('select count(*) n from public.homework_notices')).rows[0].n), before,
      'the row count is deliberately unchanged; that is the whole point of this case');

    await rejects(archive(db, ids.a, 'purge_begin', { archive_id: run.id, reason: 'xong năm', confirm_irreversible: true }),
      'a stale archive must not purge', '42501');
    // Nothing was deleted, and the refusal is on the record.
    assert.equal(Number((await db.query('select count(*) n from public.homework_notices')).rows[0].n), before);
    assert.equal((await archive(db, ids.a, 'purge_status', { archive_id: run.id })).status, 'verified');
    // The recorded fingerprint is still the old one: a refusal changes nothing,
    // so the Admin can re-archive and try again rather than being stuck.
    assert.notEqual((await archive(db, ids.a, 'purge_status', { archive_id: run.id })).dataset_fingerprint, null);
  } finally { await db.close(); }
});

test('RC1 P1 — data added after verification blocks the purge, and re-archiving clears it', async () => {
  const db = await setup();
  try {
    const { notice } = await populate(db);
    const first = await runArchive(db, ids.a, ids.y);
    await archive(db, ids.a, 'confirm_download', { archive_id: first.id, checksum: first.checksum });
    await outOfBand(db, () => db.query('insert into public.homework_notice_reactions(notice_id,user_id) values($1,$2)', [notice.id, ids.m]));
    await rejects(archive(db, ids.a, 'purge_begin', { archive_id: first.id, reason: 'xong năm', confirm_irreversible: true }),
      'newer data must not be purged by an older archive', '42501');

    // The way out is to archive again, not to override the check.
    const second = await runArchive(db, ids.a, ids.y);
    assert.equal(second.status, 'verified');
    assert.notEqual(second.dataset_fingerprint, first.dataset_fingerprint);
    const done = await purgeAll(db, ids.a, second.id, second.checksum);
    assert.equal(done.status, 'purged');
  } finally { await db.close(); }
});

test('RC1 P1 — the older of two archives cannot purge data only the newer one holds', async () => {
  const db = await setup();
  try {
    const { notice } = await populate(db);
    const older = await runArchive(db, ids.a, ids.y);
    await archive(db, ids.a, 'confirm_download', { archive_id: older.id, checksum: older.checksum });
    await outOfBand(db, () => db.query('insert into public.homework_notice_reactions(notice_id,user_id) values($1,$2)', [notice.id, ids.m]));
    const newer = await runArchive(db, ids.a, ids.y);
    await archive(db, ids.a, 'confirm_download', { archive_id: newer.id, checksum: newer.checksum });

    // Both are verified and both were downloaded; only one of them is current.
    assert.equal(older.status, 'verified');
    assert.equal(newer.status, 'verified');
    await rejects(archive(db, ids.a, 'purge_begin', { archive_id: older.id, reason: 'xong năm', confirm_irreversible: true }),
      'the older archive is missing the newer reaction', '42501');
    assert.equal((await archive(db, ids.a, 'purge_begin', { archive_id: newer.id, reason: 'xong năm', confirm_irreversible: true })).status, 'purging');
  } finally { await db.close(); }
});

test('RC1 P1 — the year is frozen for the whole run and stays frozen until it is purged', async () => {
  const db = await setup();
  try {
    const { notice, published } = await populate(db);
    const state = async () => (await db.query('select archive_state from public.school_years where id=$1', [ids.y])).rows[0].archive_state;
    assert.equal(await state(), 'active');

    const run = await archive(db, ids.a, 'begin', { school_year_id: ids.y, archive_format_version: ARCHIVE_FORMAT_VERSION });
    assert.equal(await state(), 'archiving', 'the freeze starts with the run, not after it');
    await rejects(rpc(db, ids.other, 'heart', { id: published.id, liked: true }), 'writes are withheld during the run', '42501');
    assert.ok(await rpc(db, ids.s, 'load', {}), 'reads are not');

    const { items } = await archive(db, ids.a, 'media_manifest', { archive_id: run.id });
    const truth = new Map((await db.query('select id,checksum from public.homework_attachments')).rows.map(r => [r.id, r.checksum]));
    await archive(db, ids.a, 'report_media', { archive_id: run.id, items: items.map(i => ({ attachment_id: i.attachment_id, checksum: truth.get(i.attachment_id), bytes: i.size_bytes })) });
    const done = await archive(db, ids.a, 'complete', { archive_id: run.id, checksum: 'a'.repeat(64), archive_size_bytes: '1' });
    assert.equal(done.status, 'verified');
    assert.ok(/^[a-f0-9]{64}$/.test(done.dataset_fingerprint));
    // Still frozen after verification: this is the window RC1 left open.
    assert.equal(await state(), 'archiving');
    await rejects(rpc(db, ids.other, 'heart', { id: published.id, liked: true }), 'writes stay withheld after verification', '42501');
    void notice;
  } finally { await db.close(); }
});

test('RC1 P1 — a failed run releases the freeze instead of stranding the year', async () => {
  const db = await setup();
  try {
    const { attachment } = await populate(db);
    const state = async () => (await db.query('select archive_state from public.school_years where id=$1', [ids.y])).rows[0].archive_state;
    const failed = await runArchive(db, ids.a, ids.y, { skip: attachment.id });
    assert.equal(failed.status, 'failed');
    assert.equal(await state(), 'active', 'a year must not be left unwritable because an archive failed');
    assert.ok(await rpc(db, ids.s, 'submit', { subject_id: (await db.query('select id from public.class_subjects limit 1')).rows[0].id, title: 'Bài mới', content: 'Nội dung', due_at: '2026-11-01T12:00:00Z', request_id: crypto.randomUUID() }));
  } finally { await db.close(); }
});

test('RC1 P1 — releasing the freeze by hand closes the purge gate', async () => {
  const db = await setup();
  try {
    await populate(db);
    const run = await runArchive(db, ids.a, ids.y);
    await archive(db, ids.a, 'confirm_download', { archive_id: run.id, checksum: run.checksum });
    // Someone unfreezes the year in the SQL editor. The data has been writable
    // since that moment, so this archive can no longer speak for it — even
    // though nothing has actually been written yet.
    await db.query(`update public.school_years set archive_state='active' where id=$1`, [ids.y]);
    await rejects(archive(db, ids.a, 'purge_begin', { archive_id: run.id, reason: 'xong năm', confirm_irreversible: true }),
      'an unfrozen year must not be purged from an old archive', '42501');
  } finally { await db.close(); }
});

test('RB-711 set_read_only is still the explicit step, and it is idempotent', async () => {
  const db = await setup();
  try {
    await populate(db);
    const run = await runArchive(db, ids.a, ids.y);
    const state = async () => (await db.query('select archive_state from public.school_years where id=$1', [ids.y])).rows[0].archive_state;
    assert.equal(await state(), 'archiving');
    assert.equal((await archive(db, ids.a, 'set_read_only', { archive_id: run.id })).archive_state, 'archived_read_only');
    assert.equal(await state(), 'archived_read_only');
    await archive(db, ids.a, 'set_read_only', { archive_id: run.id });
    assert.equal(await state(), 'archived_read_only');
    // And purge still works from the permanent state, not only from the freeze.
    const done = await purgeAll(db, ids.a, run.id, run.checksum);
    assert.equal(done.status, 'purged');
  } finally { await db.close(); }
});

test('RC1 P1 — the year that is still being taught cannot be archived at all', async () => {
  const db = await setup();
  try {
    // populate() normally retires the year; here it stays active on purpose.
    await populate(db, { retire: false });
    await assert.rejects(
      archive(db, ids.a, 'begin', { school_year_id: ids.y, archive_format_version: ARCHIVE_FORMAT_VERSION }),
      error => { assert.match(error.message, /đang hoạt động/); assert.equal(error.code, '42501'); return true },
      'archiving the live year would have to freeze it mid-term');
    // Nothing was frozen and nothing was recorded.
    assert.equal((await db.query('select archive_state from public.school_years where id=$1', [ids.y])).rows[0].archive_state, 'active');
    assert.equal((await archive(db, ids.a, 'list')).archives.length, 0);
    await retireYear(db);
    assert.equal((await runArchive(db, ids.a, ids.y)).status, 'verified');
  } finally { await db.close(); }
});

test('RC1 P1 — a failed second run does not lift the freeze a verified archive is holding', async () => {
  const db = await setup();
  try {
    const { attachment, published } = await populate(db);
    const good = await runArchive(db, ids.a, ids.y);
    assert.equal(good.status, 'verified');
    const bad = await runArchive(db, ids.a, ids.y, { skip: attachment.id });
    assert.equal(bad.status, 'failed');
    // The verified archive still needs the year to stay exactly as it archived it.
    assert.equal((await db.query('select archive_state from public.school_years where id=$1', [ids.y])).rows[0].archive_state, 'archiving');
    await rejects(rpc(db, ids.other, 'heart', { id: published.id, liked: true }), 'the freeze must hold', '42501');
    // And the good archive can still purge, because nothing changed.
    assert.equal((await purgeAll(db, ids.a, good.id, good.checksum)).status, 'purged');
  } finally { await db.close(); }
});

// ── Sol RC2 P1 ───────────────────────────────────────────────────────────────
// RC2 hashed the dataset at `complete`, after the browser had already exported
// the rows. A count-preserving update in between was therefore absorbed into the
// recorded value instead of being caught: the archive verified against a dataset
// the ZIP never contained, and the purge then deleted it. RC3 takes the hash at
// `begin` — before the browser reads anything — and `complete` refuses unless it
// is unchanged.

test('RC2 P1 — an update during the build fails the archive, even with counts unchanged', async () => {
  const db = await setup();
  try {
    const { published } = await populate(db);
    const run = await archive(db, ids.a, 'begin', { school_year_id: ids.y, archive_format_version: ARCHIVE_FORMAT_VERSION });
    assert.match(run.begin_fingerprint, /^[a-f0-9]{64}$/, 'the dataset is hashed before the browser reads anything');

    // The browser exports the rows. This is what lands in the ZIP.
    const inZip = (await exportEntity(db, ids.a, run.id, 'homework_notices')).rows.find(row => row.id === published.id);
    assert.equal(inZip.title, 'Bài tập');

    // Then the SQL editor or a service-role job edits that same row. The freeze
    // does not reach them, and the row count does not move.
    const before = Number((await db.query('select count(*) n from public.homework_notices')).rows[0].n);
    await outOfBand(db, () => db.query(`update public.homework_notices set title='B — chỉ có trên cloud' where id=$1`, [published.id]));
    assert.equal(Number((await db.query('select count(*) n from public.homework_notices')).rows[0].n), before);

    const { items } = await archive(db, ids.a, 'media_manifest', { archive_id: run.id });
    const truth = new Map((await db.query('select id,checksum from public.homework_attachments')).rows.map(r => [r.id, r.checksum]));
    await archive(db, ids.a, 'report_media', { archive_id: run.id, items: items.map(i => ({ attachment_id: i.attachment_id, checksum: truth.get(i.attachment_id), bytes: i.size_bytes })) });
    const done = await archive(db, ids.a, 'complete', { archive_id: run.id, checksum: 'a'.repeat(64), archive_size_bytes: '1' });

    assert.equal(done.status, 'failed');
    assert.equal(done.failure_reason, 'dataset_changed_during_archive');
    assert.equal(done.dataset_fingerprint, null);
    // And the gate never opens: no fingerprint to confirm, no purge.
    await rejects(archive(db, ids.a, 'confirm_download', { archive_id: run.id, checksum: 'a'.repeat(64) }), 'a failed archive cannot be confirmed');
    await rejects(archive(db, ids.a, 'purge_begin', { archive_id: run.id, reason: 'xong năm', confirm_irreversible: true }), 'nor purged', '42501');
    assert.equal(Number((await db.query('select count(*) n from public.homework_notices')).rows[0].n), before, 'nothing was deleted');
  } finally { await db.close(); }
});

test('RC2 P1 — the same holds for an entity other than notices', async () => {
  const db = await setup();
  try {
    await populate(db);
    const run = await archive(db, ids.a, 'begin', { school_year_id: ids.y, archive_format_version: ARCHIVE_FORMAT_VERSION });
    // A student renamed mid-build: different table, same hazard. The fingerprint
    // has to cover the whole dataset, not just the headline entity.
    // (class_subjects would not work here — FEAT-004's catalog trigger rewrites
    // name/short_name/icon from the catalog on every update, so a direct rename
    // there does not stick. That is the trigger doing its job, not the
    // fingerprint missing a change.)
    await outOfBand(db, () => db.query(`update public.profiles set full_name='Tên đổi giữa chừng' where id=$1`, [ids.s]));
    const { items } = await archive(db, ids.a, 'media_manifest', { archive_id: run.id });
    const truth = new Map((await db.query('select id,checksum from public.homework_attachments')).rows.map(r => [r.id, r.checksum]));
    await archive(db, ids.a, 'report_media', { archive_id: run.id, items: items.map(i => ({ attachment_id: i.attachment_id, checksum: truth.get(i.attachment_id), bytes: i.size_bytes })) });
    const done = await archive(db, ids.a, 'complete', { archive_id: run.id, checksum: 'a'.repeat(64), archive_size_bytes: '1' });
    assert.equal(done.status, 'failed');
    assert.equal(done.failure_reason, 'dataset_changed_during_archive');
  } finally { await db.close(); }
});

test('RC2 P1 — an undisturbed run verifies, and stores the fingerprint it started from', async () => {
  const db = await setup();
  try {
    await populate(db);
    const run = await archive(db, ids.a, 'begin', { school_year_id: ids.y, archive_format_version: ARCHIVE_FORMAT_VERSION });
    const { items } = await archive(db, ids.a, 'media_manifest', { archive_id: run.id });
    const truth = new Map((await db.query('select id,checksum from public.homework_attachments')).rows.map(r => [r.id, r.checksum]));
    await archive(db, ids.a, 'report_media', { archive_id: run.id, items: items.map(i => ({ attachment_id: i.attachment_id, checksum: truth.get(i.attachment_id), bytes: i.size_bytes })) });
    const done = await archive(db, ids.a, 'complete', { archive_id: run.id, checksum: 'a'.repeat(64), archive_size_bytes: '1' });
    assert.equal(done.status, 'verified');
    // The value purge is later measured against is the one taken at `begin`,
    // which is the dataset the ZIP was built from.
    assert.equal(done.dataset_fingerprint, run.begin_fingerprint);
    assert.equal((await purgeAll(db, ids.a, done.id, done.checksum)).status, 'purged');
  } finally { await db.close(); }
});

test('RC2 P1 — a run failed by the fingerprint check releases the freeze, unless another archive holds it', async () => {
  const db = await setup();
  try {
    const { published } = await populate(db);
    const state = async () => (await db.query('select archive_state from public.school_years where id=$1', [ids.y])).rows[0].archive_state;

    // Case 1: the only run fails mid-build — the year must not be left frozen.
    const lone = await archive(db, ids.a, 'begin', { school_year_id: ids.y, archive_format_version: ARCHIVE_FORMAT_VERSION });
    assert.equal(await state(), 'archiving');
    await outOfBand(db, () => db.query(`update public.homework_notices set title='đổi giữa chừng' where id=$1`, [published.id]));
    const { items } = await archive(db, ids.a, 'media_manifest', { archive_id: lone.id });
    const truth = new Map((await db.query('select id,checksum from public.homework_attachments')).rows.map(r => [r.id, r.checksum]));
    await archive(db, ids.a, 'report_media', { archive_id: lone.id, items: items.map(i => ({ attachment_id: i.attachment_id, checksum: truth.get(i.attachment_id), bytes: i.size_bytes })) });
    assert.equal((await archive(db, ids.a, 'complete', { archive_id: lone.id, checksum: 'a'.repeat(64), archive_size_bytes: '1' })).failure_reason, 'dataset_changed_during_archive');
    assert.equal(await state(), 'active', 'a failed run must not strand the year');

    // Case 2: a verified archive is already holding the freeze. A second run that
    // fails the same way must leave that freeze exactly where it is.
    const good = await runArchive(db, ids.a, ids.y);
    assert.equal(good.status, 'verified');
    assert.equal(await state(), 'archiving');
    const second = await archive(db, ids.a, 'begin', { school_year_id: ids.y, archive_format_version: ARCHIVE_FORMAT_VERSION });
    await outOfBand(db, () => db.query(`update public.homework_notices set title='đổi lần nữa' where id=$1`, [published.id]));
    const page = await archive(db, ids.a, 'media_manifest', { archive_id: second.id });
    await archive(db, ids.a, 'report_media', { archive_id: second.id, items: page.items.map(i => ({ attachment_id: i.attachment_id, checksum: truth.get(i.attachment_id), bytes: i.size_bytes })) });
    assert.equal((await archive(db, ids.a, 'complete', { archive_id: second.id, checksum: 'a'.repeat(64), archive_size_bytes: '1' })).status, 'failed');
    assert.equal(await state(), 'archiving', 'the verified archive still needs the year held still');
    // …and that verified archive is now stale itself, so it cannot purge either.
    await archive(db, ids.a, 'confirm_download', { archive_id: good.id, checksum: good.checksum });
    await rejects(archive(db, ids.a, 'purge_begin', { archive_id: good.id, reason: 'xong năm', confirm_irreversible: true }),
      'the mid-build edit also invalidated the earlier archive', '42501');
  } finally { await db.close(); }
});

// ── Sol RC3 P1 ───────────────────────────────────────────────────────────────
// Purge is fourteen separate calls, each committing on its own. RC3 checked the
// fingerprint at `purge_begin` and then trusted the interval to the end, but the
// read-only guard lived only in the two public dispatchers — so a direct SQL or
// service-role write landing between two steps inserted a row that a later step
// deleted, and that row was never in the verified archive. RC4 moves the guard
// onto the tables themselves, with a bypass only `purge_step` can present.

/** Verified, downloaded, purging, and two steps already committed. */
async function midPurge(db) {
  const seeded = await populate(db);
  const run = await runArchive(db, ids.a, ids.y);
  await archive(db, ids.a, 'confirm_download', { archive_id: run.id, checksum: run.checksum });
  await archive(db, ids.a, 'purge_begin', { archive_id: run.id, reason: 'xong năm', confirm_irreversible: true });
  await archive(db, ids.a, 'purge_step', { archive_id: run.id });
  await archive(db, ids.a, 'purge_step', { archive_id: run.id });
  return { ...seeded, run };
}

test('RC3 P1 — a direct INSERT after purge_begin is refused, not silently purged', async () => {
  const db = await setup();
  try {
    const { run } = await midPurge(db);
    const subject = (await db.query('select id from public.class_subjects limit 1')).rows[0].id;
    await assert.rejects(
      db.query(`insert into public.homework_notices(id,class_id,school_year_id,subject_id,author_id,title,content,due_at,status,request_id)
        values(gen_random_uuid(),$1,$2,$3,$4,'C — chèn sau purge_begin','Chưa từng có trong ZIP','2026-06-01T12:00:00Z','published',gen_random_uuid())`,
        [classId, ids.y, subject, ids.s]),
      error => { assert.match(error.message, /đã đóng gói/); assert.equal(error.code, '42501'); return true },
      'a row that is not in the archive must never be allowed into the purge set');
    // The purge still finishes, and nothing unexpected went with it.
    let result; do { result = await archive(db, ids.a, 'purge_step', { archive_id: run.id }); } while (!result.done);
    assert.equal(result.status, 'purged');
  } finally { await db.close(); }
});

test('RC3 P1 — a count-preserving UPDATE after purge_begin is refused too', async () => {
  const db = await setup();
  try {
    const { published } = await midPurge(db);
    await rejects(db.query(`update public.homework_notices set title='đổi giữa lúc xoá' where id=$1`, [published.id]),
      'an update mid-purge', '42501');
    // And the guard covers a table further down the step list, not only notices.
    await rejects(db.query(`update public.class_subjects set sort_order=99 where class_id=$1`, [classId]),
      'a table purge has not reached yet', '42501');
  } finally { await db.close(); }
});

test('RC3 P1 — the guard is on the table, so the service role is refused as well', async () => {
  const db = await setup();
  try {
    const { published } = await midPurge(db);
    // The harness starts with no table grants for service_role at all, so this
    // test used to pass on "permission denied for table" — the guard was never
    // reached. Supabase grants service_role full table access by default, so
    // that is what has to be modelled here for the assertion to mean anything.
    await db.exec('grant all on all tables in schema public to service_role');
    await db.exec('set role service_role');
    try {
      // The dispatcher guard never sees this path at all: no homework_api, no
      // JWT, full rights. Only a table-level guard can refuse it — and it must
      // be *this* guard, which is why the message is asserted and not just the
      // SQLSTATE that a missing grant would also produce.
      await assert.rejects(
        db.query('insert into public.homework_notice_reactions(notice_id,user_id) values($1,$2)', [published.id, ids.t]),
        error => { assert.match(error.message, /đã đóng gói/); assert.equal(error.code, '42501'); return true },
        'service_role write mid-purge');
    } finally { await db.exec('reset role'); }
  } finally { await db.close(); }
});

test('RC3 P1 — what the purge token is and is not: it routes the purge, it is not a security boundary', async () => {
  const db = await setup();
  try {
    const { published, run } = await midPurge(db);
    await db.exec('grant all on all tables in schema public to service_role');
    await db.exec('set role service_role');
    try {
      // Cannot take the triggers off. Only the table owner can, and Supabase's
      // service_role is not the owner.
      await rejects(db.exec('alter table public.homework_notices disable trigger homework_archive_guard'),
        'service_role must not be able to remove the freeze');
      await rejects(db.exec("set session_replication_role='replica'"),
        'nor turn triggers off wholesale');

      // But it *can* set the GUC, and the archive id is not a secret. A caller
      // that deliberately presents the id of the archive currently purging gets
      // through. That is the honest boundary: the token tells the guard "this
      // write is the purge", it does not prove it. It stops ordinary and
      // accidental drift — a job that writes during a purge window — not a
      // caller that has read the source and means to get past it.
      await db.exec('begin');
      await db.query(`select set_config('homework.archive_purge',$1,true)`, [run.id]);
      await db.query(`update public.homework_notices set title='đi qua được' where id=$1`, [published.id]);
      await db.exec('rollback');
    } finally { await db.exec('reset role').catch(() => {}); }
  } finally { await db.close(); }
});

test('RC3 P1 — the freeze does not block the purge itself, and a resumed purge still works', async () => {
  const db = await setup();
  try {
    const { run } = await midPurge(db);
    // Interrupt: a step left 'running', exactly as a closed tab would leave it.
    await db.query(`update public.homework_archive_steps set state='running' where archive_id=$1 and step='reports'`, [run.id]);
    let result, guard = 0;
    do { result = await archive(db, ids.a, 'purge_step', { archive_id: run.id }); } while (!result.done && ++guard < 50);
    assert.equal(result.status, 'purged');
    assert.equal(Number((await db.query('select count(*) n from public.homework_notices where school_year_id=$1', [ids.y])).rows[0].n), 0);
    // The bypass is transaction-scoped: `set_config(...,true)` dies with the
    // transaction that set it, so the next statement does not inherit it.
    assert.equal(
      (await db.query(`select coalesce(current_setting('homework.archive_purge',true),'') t`)).rows[0].t, '',
      'the bypass must not outlive the step that set it');
  } finally { await db.close(); }
});

test('RC3 P1 — the bypass cannot be forged: it must name a purging archive of this year', async () => {
  const db = await setup();
  try {
    const other = await populateOtherYear(db);
    const { published } = await populate(db);
    // Freeze year B by hand as well, so both years are guarded and the only
    // thing separating them is which archive the token names.
    await db.query(`update public.school_years set archive_state='archiving' where id=$1`, [yearB]);

    // (a) A token naming an archive that exists but is not purging.
    const building = await archive(db, ids.a, 'begin', { school_year_id: ids.y, archive_format_version: ARCHIVE_FORMAT_VERSION });
    await db.exec('begin');
    try {
      await db.query(`select set_config('homework.archive_purge',$1,true)`, [building.id]);
      await rejects(db.query(`update public.homework_notices set title='giả mạo' where id=$1`, [published.id]),
        'a token naming a non-purging archive must not open the freeze', '42501');
    } finally { await db.exec('rollback'); }

    // (b) A token naming a genuinely purging archive — of the *other* year.
    await db.query(`update public.homework_archives set status='purging' where id=$1`, [building.id]);
    await db.exec('begin');
    try {
      await db.query(`select set_config('homework.archive_purge',$1,true)`, [building.id]);
      await rejects(db.query(`update public.homework_notices set title='giả mạo' where id=$1`, [other.notice]),
        "one year's purge must not unlock another year", '42501');
    } finally { await db.exec('rollback'); }

    // (c) A token that names nothing at all.
    await db.exec('begin');
    try {
      await db.query(`select set_config('homework.archive_purge',$1,true)`, [crypto.randomUUID()]);
      await rejects(db.query(`update public.homework_notices set title='giả mạo' where id=$1`, [published.id]),
        'an unknown archive id must not open the freeze', '42501');
    } finally { await db.exec('rollback'); }
  } finally { await db.close(); }
});

test('RC3 P1 — a purged year cannot drift back to writable', async () => {
  const db = await setup();
  try {
    await populate(db);
    const run = await runArchive(db, ids.a, ids.y);
    await purgeAll(db, ids.a, run.id, run.checksum);
    const state = async () => (await db.query('select archive_state from public.school_years where id=$1', [ids.y])).rows[0].archive_state;
    // Finishing a purge promotes the year from the temporary run freeze to the
    // permanent one, rather than leaving it in 'archiving' for ever.
    assert.equal(await state(), 'archived_read_only');

    // A new run is not even reachable — the purged year now has attachments in
    // 'deleting', which preflight blocks on — so the only way the year could be
    // handed back is the release helper itself. Called directly, it must refuse.
    await rejects(archive(db, ids.a, 'begin', { school_year_id: ids.y, archive_format_version: ARCHIVE_FORMAT_VERSION }),
      'a purged year is not archivable again');
    await db.query('select homework_private.archive_release($1)', [ids.y]);
    assert.equal(await state(), 'archived_read_only', 'a purged year must never become writable again');
    const subject = (await db.query('select id from public.class_subjects limit 1')).rows[0];
    if (subject) await rejects(db.query(`update public.class_subjects set sort_order=1 where id=$1`, [subject.id]), 'still frozen', '42501');
  } finally { await db.close(); }
});

test('RC3 P1 — the freeze leaves other years, and reading the archived year, alone', async () => {
  const db = await setup();
  try {
    const other = await populateOtherYear(db);
    const { published } = await populate(db);
    await archive(db, ids.a, 'begin', { school_year_id: ids.y, archive_format_version: ARCHIVE_FORMAT_VERSION });
    // The neighbouring year is untouched by the freeze.
    await db.query(`update public.homework_notices set title='Năm khác vẫn sửa được' where id=$1`, [other.notice]);
    assert.equal((await db.query('select title from public.homework_notices where id=$1', [other.notice])).rows[0].title, 'Năm khác vẫn sửa được');
    // And the archived year is still readable through the app, which is the
    // whole point of RB-711 — the guard must not turn read-only into unusable.
    assert.ok(await rpc(db, ids.s, 'load', {}));
    assert.ok(await rpc(db, ids.t, 'inbox', {}));
    assert.ok((await media(db, ids.t, 'read', { attachment_id: (await db.query('select id from public.homework_attachments where school_year_id=$1', [ids.y])).rows[0].id })).object_key);
    void published;
  } finally { await db.close(); }
});

test('RC3 P1 — the freeze still lets the FEAT-006 worker finish removing purged media', async () => {
  const db = await setup();
  try {
    const { attachment } = await populate(db);
    const run = await runArchive(db, ids.a, ids.y);
    await purgeAll(db, ids.a, run.id, run.checksum);
    assert.equal((await db.query('select status from public.homework_attachments where id=$1', [attachment.id])).rows[0].status, 'deleting');

    // The worker runs once safe_after has passed: it deletes the R2 object and
    // acks, and the ack removes the row. The year is frozen by then, so if the
    // guard refused this the attachment rows would linger for ever and storage
    // health would keep counting bytes that no longer exist in the bucket.
    await db.query(`update public.homework_media_outbox set safe_after=clock_timestamp()-interval '1 minute',next_attempt_at=clock_timestamp()-interval '1 minute'`);
    const jobs = await mediaService(db, 'jobs', {});
    const job = jobs.find(entry => entry.id === attachment.id);
    assert.ok(job, 'the purged attachment must be offered to the worker');
    await mediaService(db, 'ack', { attachment_id: job.id, token: job.token, success: true });
    assert.equal(Number((await db.query('select count(*) n from public.homework_attachments where id=$1', [attachment.id])).rows[0].n), 0,
      'the worker must still be able to close out a purged image');
  } finally { await db.close(); }
});

// ── Sol RC4 P1 ───────────────────────────────────────────────────────────────
// The purge deleted homework_settings and homework_backlog_state, neither of
// which the archive carries, fingerprints or freezes. A class's tuned
// thresholds were therefore destroyed with no copy anywhere. RC5 stops purging
// them (DEC-101): they are class-scoped, classes survive the purge, and they
// are small.

test('RC4 P1 — class configuration survives the purge, because the archive does not carry it', async () => {
  const db = await setup();
  try {
    const { notice } = await populate(db, { retire: false });
    // Non-default on every column, so a row the dispatcher lazily recreates at
    // its defaults cannot make this test pass for the wrong reason.
    await db.query(`insert into public.homework_settings(class_id,seed_threshold,pending_threshold,reject_threshold)
      values($1,7,55,88) on conflict(class_id) do update set seed_threshold=7,pending_threshold=55,reject_threshold=88`, [classId]);
    await db.query(`insert into public.homework_backlog_state(class_id,active,last_alert_at)
      values($1,true,'2026-03-01T08:00:00Z') on conflict(class_id) do update set active=true,last_alert_at='2026-03-01T08:00:00Z'`, [classId]);
    await retireYear(db);

    const run = await runArchive(db, ids.a, ids.y);
    await purgeAll(db, ids.a, run.id, run.checksum);

    const settings = (await db.query('select seed_threshold,pending_threshold,reject_threshold from public.homework_settings where class_id=$1', [classId])).rows[0];
    assert.deepEqual(settings, { seed_threshold: 7, pending_threshold: 55, reject_threshold: 88 },
      'tuned thresholds must not be destroyed by a purge that never archived them');
    const backlog = (await db.query('select active,last_alert_at from public.homework_backlog_state where class_id=$1', [classId])).rows[0];
    assert.equal(backlog?.active, true);
    assert.ok(backlog.last_alert_at, 'backlog state must survive too — it is class-scoped, not year-scoped');
    // And the purge really did run: the year's data is gone.
    assert.equal(Number((await db.query('select count(*) n from public.homework_notices where school_year_id=$1', [ids.y])).rows[0].n), 0);
    void notice;
  } finally { await db.close(); }
});

// ── Sol RC4 P2 ───────────────────────────────────────────────────────────────
// The guard resolved the year from NEW only, so an UPDATE could re-parent a
// frozen row into an active year and walk it out of the purge set. For an image
// that is worse than a leftover row: the year-end sweep never queues it, so its
// bytes stay in R2 for ever.

/** Year A frozen and purging; year B active, with a class of the same grade. */
async function frozenAndActive(db) {
  const seeded = await populate(db, { retire: false });
  const other = await populateOtherYear(db);
  const grade = (await db.query('select grade from public.classes where id=$1', [classId])).rows[0].grade;
  const sameGrade = '00000000-0000-0000-0000-0000000000d0';
  await db.query(`insert into public.classes(id,school_year_id,active,code,name,grade) values($1,$2,true,'SAME','Lớp cùng khối',$3)`,
    [sameGrade, yearB, grade]);
  await retireYear(db);
  const run = await runArchive(db, ids.a, ids.y);
  await archive(db, ids.a, 'confirm_download', { archive_id: run.id, checksum: run.checksum });
  await archive(db, ids.a, 'purge_begin', { archive_id: run.id, reason: 'xong năm', confirm_irreversible: true });
  return { ...seeded, other, run, sameGrade };
}

test('RC4 P2 — a frozen row cannot be re-parented into an active year', async () => {
  const db = await setup();
  try {
    const { attachment, other, sameGrade } = await frozenAndActive(db);

    // Keyed by school_year_id. This is the one that costs real money: moved out
    // of the year, the image is never offered to the year-end media sweep.
    await rejects(db.query('update public.homework_attachments set school_year_id=$1,class_id=$2 where id=$3', [yearB, classB2, attachment.id]),
      'an image must not be able to leave the year it was archived in', '42501');

    // Keyed by class_id, with no school_year_id of its own.
    const event = (await db.query('select id from public.homework_contribution_events where class_id=$1 limit 1', [classId])).rows[0];
    await rejects(db.query('update public.homework_contribution_events set class_id=$1 where id=$2', [sameGrade, event.id]),
      'a class-keyed row must not be able to leave the year either', '42501');

    // Keyed by notice_id: moved from a frozen notice to a live one.
    await rejects(db.query('update public.homework_notice_reactions set notice_id=$1 where notice_id=$2', [other.notice, (await db.query('select id from public.homework_notices where school_year_id=$1 limit 1', [ids.y])).rows[0].id]),
      'a child row must not be able to follow a notice out of the year', '42501');

    // class_subjects, Sol's own example. FEAT-004's class_subject_catalog_guard
    // already refuses this for its own reasons, so this assertion does not on
    // its own prove the archive guard works — the three above do. It is here
    // because Sol named it, and because a later relaxation of FEAT-004 must not
    // silently open the hole.
    const subject = (await db.query('select id from public.class_subjects where class_id=$1 limit 1', [classId])).rows[0];
    await rejects(db.query('update public.class_subjects set class_id=$1 where id=$2', [sameGrade, subject.id]),
      'a subject must not be able to leave the year');
  } finally { await db.close(); }
});

test('RC4 P2 — a frozen year cannot adopt a row from an active one either', async () => {
  const db = await setup();
  try {
    const { other } = await frozenAndActive(db);
    await rejects(db.query('update public.homework_notices set school_year_id=$1,class_id=$2 where id=$3', [ids.y, classId, other.notice]),
      'a row that is not in the archive must not be able to walk into the purge set', '42501');
  } finally { await db.close(); }
});

test('RC4 P2 — the class itself cannot carry a frozen year out, or be deleted', async () => {
  const db = await setup();
  try {
    await frozenAndActive(db);
    await rejects(db.query('update public.classes set school_year_id=$1 where id=$2', [yearB, classId]),
      'moving the class would take its subjects out of the purge with it', '42501');
    await rejects(db.query('delete from public.classes where id=$1', [classId]),
      'deleting the class would destroy rows the archive represents', '42501');
    // But the class is not frozen wholesale: renaming and deactivating a class
    // of a packed-away year is ordinary Admin work and must keep working.
    await db.query(`update public.classes set name='6A1 (đã lưu trữ)' where id=$1`, [classId]);
    assert.equal((await db.query('select name from public.classes where id=$1', [classId])).rows[0].name, '6A1 (đã lưu trữ)');
    // And a class of the active year moves and deletes as before.
    await db.query('update public.classes set school_year_id=$1 where id=$2', [yearB, classB2]);
  } finally { await db.close(); }
});

test('RC4 P2 — the active year is still fully mutable, and the purge still finishes', async () => {
  const db = await setup();
  try {
    const { other, run } = await frozenAndActive(db);
    // An ordinary update in the neighbouring year, on the same tables.
    await db.query(`update public.homework_notices set title='Năm khác vẫn sửa được' where id=$1`, [other.notice]);
    await db.query('update public.homework_attachments set size_bytes=2000 where id=$1', [other.attachment]);
    assert.equal((await db.query('select title from public.homework_notices where id=$1', [other.notice])).rows[0].title, 'Năm khác vẫn sửa được');

    // And the purge — which updates attachments through media_enqueue — runs to
    // completion under the two-sided check.
    let result; do { result = await archive(db, ids.a, 'purge_step', { archive_id: run.id }); } while (!result.done);
    assert.equal(result.status, 'purged');
    assert.equal(Number((await db.query('select count(*) n from public.homework_notices where school_year_id=$1', [ids.y])).rows[0].n), 0);
    assert.equal(Number((await db.query('select count(*) n from public.homework_notices where school_year_id=$1', [yearB])).rows[0].n), 1);
  } finally { await db.close(); }
});

// ── Sol RC5 P1 ───────────────────────────────────────────────────────────────
// The resolver picked one owner by priority. `homework_reports` and
// `homework_corrections` carry both class_id and notice_id, and the archive,
// the fingerprint and the purge all scope them by notice_id — so an active
// class plus a frozen notice walked past the freeze and was deleted a few purge
// steps later. And `jsonb ? 'key'` is true for a NULL value, so the nullable
// `homework_correction_rounds.attachment_id` resolved to NULL and hid the
// correction underneath it.

/** Year A frozen and purging, with a correction and an image already archived. */
async function mixedOwnership(db) {
  const notice = await seed(db);
  const attachment = await sealed(db, notice);
  const published = await rpc(db, ids.s, 'submit', { ...notice, attachment_id: attachment.id });
  const other = await populateOtherYear(db);
  const correction = '00000000-0000-0000-0000-0000000000f3';
  await db.query(`insert into public.homework_corrections(id,class_id,notice_id,round,status,closed_at)
    values($1,$2,$3,1,'approved',now())`, [correction, classId, notice.id]);
  await retireYear(db);
  const run = await runArchive(db, ids.a, ids.y);
  await archive(db, ids.a, 'confirm_download', { archive_id: run.id, checksum: run.checksum });
  await archive(db, ids.a, 'purge_begin', { archive_id: run.id, reason: 'xong năm', confirm_irreversible: true });
  return { notice, attachment, published, other, correction, run };
}

test('RC5 P1 — a frozen notice under an active class is still a frozen row', async () => {
  const db = await setup();
  try {
    const { notice, other } = await mixedOwnership(db);

    // Sol's example 1. The guard used to see only class_id, which is active.
    await rejects(db.query(`insert into public.homework_reports(id,class_id,notice_id,reporter_id,category)
      values(gen_random_uuid(),$1,$2,$3,'content')`, [classB2, notice.id, ids.s]),
      'a report on a frozen notice must not be creatable, whatever its class says', '42501');

    // Sol's example 2, same shape.
    await rejects(db.query(`insert into public.homework_corrections(id,class_id,notice_id,round,status)
      values(gen_random_uuid(),$1,$2,2,'awaiting_author')`, [classB2, notice.id]),
      'nor a correction', '42501');

    // Re-parenting an active row onto a frozen notice: both sides resolve, and
    // the NEW side is what refuses here.
    const active = (await db.query(`insert into public.homework_reports(id,class_id,notice_id,reporter_id,category)
      values(gen_random_uuid(),$1,$2,$3,'content') returning id`, [classB2, other.notice, ids.m])).rows[0].id;
    await rejects(db.query('update public.homework_reports set notice_id=$1 where id=$2', [notice.id, active]),
      'an active report must not be movable onto a frozen notice', '42501');
    assert.equal((await db.query('select notice_id from public.homework_reports where id=$1', [active])).rows[0].notice_id, other.notice);
  } finally { await db.close(); }
});

test('RC5 P1 — a NULL key no longer hides the owner underneath it', async () => {
  const db = await setup();
  try {
    const { correction } = await mixedOwnership(db);
    // `attachment_id` is nullable and sits above `correction_id` in RC5's
    // priority list. `to_jsonb` still carries the key, so RC5 resolved NULL and
    // attributed the row to no year at all.
    await rejects(db.query(`insert into public.homework_correction_rounds(correction_id,round,requested_by,requested_at,due_at,issue_types,reason,attachment_id)
      values($1,2,$2,now(),now()+interval '72 hours','{content}','vì sao',null)`, [correction, ids.t]),
      'a correction round of a frozen correction must be refused even with no image', '42501');
  } finally { await db.close(); }
});

test('RC5 P1 — the link tables follow the notice, not only the image', async () => {
  const db = await setup();
  try {
    const { notice, other } = await mixedOwnership(db);
    await rejects(db.query('insert into public.homework_media_history(notice_id,attachment_id,revision) values($1,$2,99)',
      [notice.id, other.attachment]),
      'media history for a frozen notice must be refused', '42501');
    await rejects(db.query('insert into public.homework_notice_media(notice_id,attachment_id) values($1,$2)',
      [other.notice, (await db.query('select id from public.homework_attachments where school_year_id=$1 limit 1', [ids.y])).rows[0].id]),
      'and so must an active notice pointed at a frozen image', '42501');
  } finally { await db.close(); }
});

test('RC5 P1 — every purge step scopes by a column the resolver actually resolves', async () => {
  const db = await setup();
  try {
    // The map below is the purge scope, copied from the `purge_step` branches.
    // If a step is added or re-scoped without teaching the resolver about the
    // column it uses, that row can enter the purge set unguarded — which is
    // exactly the defect this test exists to stop coming back.
    const purgeScope = {
      homework_notice_reactions: 'notice_id', homework_notice_reminders: 'notice_id',
      homework_duplicate_reviews: 'notice_id', homework_reports: 'notice_id',
      homework_corrections: 'notice_id', homework_moderation_events: 'class_id',
      homework_notifications: 'class_id', homework_contribution_events: 'class_id',
      homework_notices: 'school_year_id', english_group_members: 'school_year_id',
      english_groups: 'school_year_id', class_subjects: 'class_id',
      homework_attachments: 'school_year_id',
      // cascade with their parent
      homework_notice_media: 'notice_id', homework_media_history: 'notice_id',
      homework_correction_rounds: 'correction_id',
    };
    const guarded = (await db.query(`select c.relname from pg_trigger t join pg_class c on c.oid=t.tgrelid
      where t.tgname='homework_archive_guard' order by 1`)).rows.map(r => r.relname);
    assert.deepEqual(guarded.slice().sort(), Object.keys(purgeScope).sort(),
      'every guarded table must appear in the purge-scope map, and vice versa');

    // The resolver is asked, one column at a time, whether it can attribute a
    // row that carries only that column.
    for (const [table, column] of Object.entries(purgeScope)) {
      const resolved = (await db.query(
        `select homework_private.archive_guard_years(jsonb_build_object($1::text,$2::uuid)) y`,
        [column, column === 'school_year_id' ? ids.y : null])).rows[0].y;
      if (column === 'school_year_id') assert.deepEqual(resolved, [ids.y], `${table}.${column}`);
      else assert.deepEqual(resolved, [], `${table}.${column}: a NULL value must resolve to nothing, not throw`);
    }
    // And with real ids, each column resolves to the right year.
    const { notice, correction } = await mixedOwnership(db);
    const attachmentId = (await db.query('select id from public.homework_attachments where school_year_id=$1 limit 1', [ids.y])).rows[0].id;
    for (const [column, value] of [['notice_id', notice.id], ['class_id', classId], ['correction_id', correction], ['attachment_id', attachmentId]]) {
      const resolved = (await db.query(`select homework_private.archive_guard_years(jsonb_build_object($1::text,$2::uuid)) y`, [column, value])).rows[0].y;
      assert.deepEqual(resolved, [ids.y], `${column} must resolve to the archived year`);
    }
  } finally { await db.close(); }
});

test('RC5 P1 — the active year and the purge are both unaffected', async () => {
  const db = await setup();
  try {
    const { other, run } = await mixedOwnership(db);
    // The same mixed-ownership writes are ordinary work in a live year.
    await db.query(`insert into public.homework_reports(id,class_id,notice_id,reporter_id,category)
      values(gen_random_uuid(),$1,$2,$3,'content')`, [classB2, other.notice, ids.s]);
    const correction = (await db.query(`insert into public.homework_corrections(id,class_id,notice_id,round,status)
      values(gen_random_uuid(),$1,$2,1,'awaiting_author') returning id`, [classB2, other.notice])).rows[0].id;
    await db.query(`insert into public.homework_correction_rounds(correction_id,round,requested_by,requested_at,due_at,issue_types,reason)
      values($1,1,$2,now(),now()+interval '72 hours','{content}','vì sao')`, [correction, ids.t]);

    // And the purge — which deletes through every one of those relationships,
    // including two cascades — still runs to completion.
    let result; do { result = await archive(db, ids.a, 'purge_step', { archive_id: run.id }); } while (!result.done);
    assert.equal(result.status, 'purged');
    assert.equal(Number((await db.query('select count(*) n from public.homework_corrections where class_id=$1', [classId])).rows[0].n), 0);
    assert.equal(Number((await db.query('select count(*) n from public.homework_corrections where id=$1', [correction])).rows[0].n), 1);
  } finally { await db.close(); }
});

test('RC5 P1 — the service role is refused on a mixed-ownership row too', async () => {
  const db = await setup();
  try {
    const { notice } = await mixedOwnership(db);
    await db.exec('grant all on all tables in schema public to service_role');
    await db.exec('set role service_role');
    try {
      await assert.rejects(
        db.query(`insert into public.homework_reports(id,class_id,notice_id,reporter_id,category)
          values(gen_random_uuid(),$1,$2,$3,'content')`, [classB2, notice.id, ids.s]),
        error => { assert.match(error.message, /đã đóng gói/); assert.equal(error.code, '42501'); return true },
        'service_role must not be able to place a row in the frozen purge set either');
    } finally { await db.exec('reset role'); }
  } finally { await db.close(); }
});
