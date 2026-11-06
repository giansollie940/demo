import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createFixture, migrationSql, rollbackSql, insertNotice, asService, fails, ids } from './fixture.mjs';

const DUE_TOKEN = 'HOMEWORK_DUE_IN_PAST';

/** Rejected *because the due date is in the past* — not for any other reason. */
async function rejectsPastDue(promise, label) {
  const error = await fails(promise);
  assert.ok(error, `${label}: phải bị từ chối, nhưng đã thành công`);
  assert.equal(error.hint, DUE_TOKEN,
    `${label}: bị từ chối nhưng không phải vì hạn đã qua — ${error.message}`);
  return error;
}

const count = async db => (await db.query('select count(*)::int n from public.homework_notices')).rows[0].n;

/**
 * A notice that already has a past due date, written *before* the rule exists —
 * exactly the shape of the one production row that has it today (a deleted
 * notice whose due_at is earlier than its created_at). The rule must not make
 * such rows unmaintainable.
 */
async function fixtureWithLegacyPastDue() {
  const db = await createFixture({ migrate: false });
  const legacy = await insertNotice(db, { dueOffset: '-3 days', status: 'published' });
  await db.exec(await migrationSql());
  return { db, legacy };
}

// ---------------------------------------------------------------------------
// Harness fidelity
// ---------------------------------------------------------------------------

test('harness: thân hàm sao từ production khớp md5 production', async () => {
  const db = await createFixture({ migrate: false });
  const prod = {
    apply_correction: '3e1b569a61be546f839f17d259f6d3dd',
    archive_frozen: '0eb454c4040140eaf1aa3e35be1207f6',
    archive_guard: '766faa5f53f76ef2130874279c5cb341',
    archive_guard_years: '2dbefbcac28ddc75c73ad8ca038621b2',
    deletion_attribution: '526a8fdfe99ad7f2ea949b7880cbc33a',
    validate_revision: '6416e306c0839044fe47a2c327240cab',
  };
  const { rows } = await db.query(
    `select p.proname, md5(replace(p.prosrc, E'\\r', '')) m
       from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='homework_private' and p.proname = any($1)`, [Object.keys(prod)]);
  assert.equal(rows.length, Object.keys(prod).length);
  for (const row of rows) assert.equal(row.m, prod[row.proname], `${row.proname} lệch khỏi production`);
});

// ---------------------------------------------------------------------------
// Posting
// ---------------------------------------------------------------------------

test('đăng bài có hạn đã qua bị chặn — với học sinh, cán sự và giáo viên', async () => {
  const db = await createFixture();
  for (const author of [ids.student, ids.monitor, ids.teacher]) {
    await rejectsPastDue(insertNotice(db, { author, dueOffset: '-1 hour' }), `tác giả ${author}`);
  }
  assert.equal(await count(db), 0, 'một lần từ chối không được để lại dòng nào');
});

test('biên: hạn đúng bằng thời điểm đăng cũng bị chặn', async () => {
  // "Hạn ở quá khứ so với thời điểm đăng" — a due date equal to the posting
  // instant has no time left in it, so it is on the refused side.
  const db = await createFixture();
  await rejectsPastDue(insertNotice(db, { dueOffset: '0 seconds' }), 'hạn = now()');
});

test('hạn ở tương lai vẫn đăng được, kể cả khi còn dưới 1 giờ', async () => {
  // The < 1 hour band is a *warning* on the form, not a refusal at the server.
  const db = await createFixture();
  assert.ok(await insertNotice(db, { dueOffset: '2 days' }));
  assert.ok(await insertNotice(db, { dueOffset: '10 minutes' }));
  assert.ok(await insertNotice(db, { dueOffset: '1 second' }));
  assert.equal(await count(db), 3);
});

test('đường service_role cũng không đi vòng được — và vẫn ghi được khi hạn hợp lệ', async () => {
  const db = await createFixture();
  await rejectsPastDue(asService(db, () => insertNotice(db, { dueOffset: '-1 day' })), 'service_role');

  // The half that broke on the first run: without SECURITY DEFINER the trigger
  // calls into homework_private as service_role and *every* service_role write
  // to the table fails, valid or not.
  const ok = await asService(db, () => insertNotice(db, { dueOffset: '1 day' }));
  assert.ok(ok, 'service_role ghi bài hạn hợp lệ phải được');
  await asService(db, () => db.query(
    `update public.homework_notices set due_at = now() + interval '2 days' where id=$1`, [ok.id]));
  await asService(db, () => db.query(
    `update public.homework_notices set status='published', published_at=now() where id=$1`, [ok.id]));
});

test('thông báo lỗi là câu tiếng Việt người dùng đọc được, ghi đúng giờ Việt Nam', async () => {
  // homework-review forwards `error.message` to the client as-is, so the
  // message *is* the UI text. The stable token lives in `hint`, not here.
  const db = await createFixture();
  const due = '2020-01-15T01:30:00Z'; // 08:30 15/01/2020 at Asia/Ho_Chi_Minh
  const error = await rejectsPastDue(insertNotice(db, { due }), 'thông báo');
  assert.match(error.message, /Hạn/);
  assert.match(error.message, /08:30 15\/01\/2020/, 'phải in hạn theo giờ Việt Nam');
  assert.doesNotMatch(error.message, new RegExp(DUE_TOKEN), 'token kỹ thuật không lọt vào câu cho người dùng');
});

test('gửi lại cùng request_id sau khi hạn đã qua vẫn idempotent', async () => {
  // homework_api inserts with `on conflict (author_id, request_id) do nothing`
  // so that a network retry returns the notice that was already accepted. A
  // BEFORE INSERT trigger fires *before* the conflict is detected; a naive rule
  // would turn "your post went through" into "your due date is in the past"
  // for a post that is already on the board.
  const { db, legacy } = await fixtureWithLegacyPastDue();
  const again = await insertNotice(db, { requestId: legacy.request_id, due: legacy.due_at });
  assert.equal(again, null, 'xung đột request_id: không có dòng mới, không có lỗi');
  assert.equal(await count(db), 1);
});

// ---------------------------------------------------------------------------
// Editing
// ---------------------------------------------------------------------------

test('sửa bài đã quá hạn mà giữ nguyên hạn: được phép', async () => {
  const { db, legacy } = await fixtureWithLegacyPastDue();
  // homework_api re-sends due_at on every edit, unchanged.
  await db.query(
    `update public.homework_notices set title='Bài 5 (sửa chính tả)', due_at=$2, revision=revision+1 where id=$1`,
    [legacy.id, legacy.due_at]);
  const row = (await db.query('select title from public.homework_notices where id=$1', [legacy.id])).rows[0];
  assert.equal(row.title, 'Bài 5 (sửa chính tả)');
});

test('đổi hạn sang một thời điểm đã qua: bị chặn', async () => {
  const db = await createFixture();
  const n = await insertNotice(db, { dueOffset: '2 days', status: 'published' });
  await rejectsPastDue(db.query(
    `update public.homework_notices set due_at = now() - interval '1 hour' where id=$1`, [n.id]),
    'đổi hạn về quá khứ');
  const { rows } = await db.query('select due_at from public.homework_notices where id=$1', [n.id]);
  assert.equal(rows[0].due_at.getTime(), new Date(n.due_at).getTime(), 'hạn cũ phải còn nguyên');
});

test('bài đã quá hạn: đổi sang một hạn khác cũng đã qua vẫn bị chặn, đổi sang tương lai thì được', async () => {
  const { db, legacy } = await fixtureWithLegacyPastDue();
  await rejectsPastDue(db.query(
    `update public.homework_notices set due_at = now() - interval '1 day' where id=$1`, [legacy.id]),
    'quá hạn → hạn quá khứ khác');
  await db.query(`update public.homework_notices set due_at = now() + interval '1 day' where id=$1`, [legacy.id]);
});

test('đổi trạng thái (duyệt, gỡ, thay thế) không đụng tới luật hạn', async () => {
  // Teacher review, deletion and the archive purge touch status, not due_at.
  // A notice whose due passed while it waited in the queue must still be
  // reviewable and removable.
  const { db, legacy } = await fixtureWithLegacyPastDue();
  await db.query(`update public.homework_notices set status='pending_duplicate_review' where id=$1`, [legacy.id]);
  await db.query(`update public.homework_notices set status='published', published_at=now() where id=$1`, [legacy.id]);
  await db.query(
    `update public.homework_notices set status='deleted', deleted_at=now(), deleted_by=$2, delete_reason='gỡ' where id=$1`,
    [legacy.id, ids.teacher]);
  const { rows } = await db.query('select status from public.homework_notices where id=$1', [legacy.id]);
  assert.equal(rows[0].status, 'deleted');
});

// ---------------------------------------------------------------------------
// Correction rounds (teacher asks the author to fix a published notice)
// ---------------------------------------------------------------------------

const revision = (due, extra = {}) => ({
  subject_id: ids.subj, english_group_id: null, title: 'Bài 5', content: 'Làm bài 1–4 trang 32', due_at: due, ...extra,
});

test('bản sửa theo yêu cầu GV: hạn mới đã qua bị chặn ngay khi tác giả gửi, không đợi GV duyệt', async () => {
  const db = await createFixture();
  const n = await insertNotice(db, { dueOffset: '2 days', status: 'published' });
  const past = new Date(Date.now() - 3600_000).toISOString();
  await rejectsPastDue(db.query('select homework_private.validate_revision(n, $2::jsonb) from public.homework_notices n where id=$1',
    [n.id, JSON.stringify(revision(past))]), 'validate_revision');
});

test('bản sửa theo yêu cầu GV: giữ nguyên hạn cũ đã qua thì vẫn gửi được', async () => {
  const { db, legacy } = await fixtureWithLegacyPastDue();
  const r = await db.query('select homework_private.validate_revision(n, $2::jsonb) v from public.homework_notices n where id=$1',
    [legacy.id, JSON.stringify(revision(new Date(legacy.due_at).toISOString(), { title: 'Bài 5 – sửa' }))]);
  assert.equal(r.rows[0].v.title, 'Bài 5 – sửa');
});

test('GV duyệt bản sửa có hạn đã qua: bị chặn ở bảng dù đi qua apply_correction', async () => {
  // validate_revision runs again at approval; this asserts the table rule holds
  // even for a payload that reaches apply_correction directly.
  const db = await createFixture();
  const n = await insertNotice(db, { dueOffset: '2 days', status: 'published' });
  const past = new Date(Date.now() - 3600_000).toISOString();
  await rejectsPastDue(db.query('select homework_private.apply_correction(n, $2::jsonb, $3) from public.homework_notices n where id=$1',
    [n.id, JSON.stringify(revision(past)), ids.teacher]), 'apply_correction');
});

// ---------------------------------------------------------------------------
// Shape of the change
// ---------------------------------------------------------------------------

test('luật nằm ở đúng một hàm, và cả trigger lẫn validate_revision đều gọi nó', async () => {
  const db = await createFixture();
  const { rows } = await db.query(
    `select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='homework_private' and p.prosrc like '%assert_due_not_past(%'
        and p.proname <> 'assert_due_not_past' order by 1`);
  assert.deepEqual(rows.map(r => r.proname), ['due_not_past_guard', 'validate_revision']);

  const trg = await db.query(
    `select tgname from pg_trigger where tgrelid='public.homework_notices'::regclass and not tgisinternal order by tgname`);
  assert.ok(trg.rows.some(r => r.tgname === 'homework_due_not_past'));
});

test('hàm mới không mở ra cho client', async () => {
  const db = await createFixture();
  const { rows } = await db.query(
    `select p.proname, coalesce(r.rolname,'PUBLIC') grantee
       from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
       left join pg_roles r on r.oid=a.grantee
      where n.nspname='homework_private' and p.proname in ('assert_due_not_past','due_not_past_guard')
        and a.privilege_type='EXECUTE' and (a.grantee=0 or r.rolname in ('anon','authenticated','service_role'))`);
  assert.deepEqual(rows, []);
});

test('validate_revision khác bản production đúng một dòng, và đó là dòng gọi luật hạn', async () => {
  // The migration rewrites a production function from a dump. If the dump had
  // drifted, or a later edit slipped in, this would be the only place to see it.
  const db = await createFixture();
  const { rows } = await db.query(
    `select replace(p.prosrc, E'\\r', '') src from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='homework_private' and p.proname='validate_revision'`);
  const lines = rows[0].src.split('\n');
  const added = lines.filter(l => l.includes('-- [due-not-past]'));
  assert.equal(added.length, 1);
  assert.match(added[0], /assert_due_not_past\(\(p->>'due_at'\)::timestamptz, n\.due_at\)/);
  const without = lines.filter(l => !l.includes('-- [due-not-past]')).join('\n');
  const md5 = (await db.query('select md5($1) m', [without])).rows[0].m;
  assert.equal(md5, '6416e306c0839044fe47a2c327240cab', 'phần còn lại phải đúng nguyên văn production');
});

test('rollback trả hệ thống về đúng trạng thái production', async () => {
  const db = await createFixture();
  await db.exec(await rollbackSql());
  const md5 = (await db.query(
    `select md5(replace(p.prosrc, E'\\r','')) m from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='homework_private' and p.proname='validate_revision'`)).rows[0].m;
  assert.equal(md5, '6416e306c0839044fe47a2c327240cab');
  const left = await db.query(
    `select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='homework_private' and proname in ('assert_due_not_past','due_not_past_guard')`);
  assert.deepEqual(left.rows, []);
  // …and behaviour is production's again: a past due date is accepted.
  assert.ok(await insertNotice(db, { dueOffset: '-1 hour' }));
});

test('harness: thân hàm khớp bản chụp production của repo (installer/sql/10-baseline.sql)', async () => {
  // Ties the harness to the schema snapshot this repository installs, not only to md5 values
  // measured once: if production (and so the snapshot) changes one of these functions, this fails.
  const snapshot = (await readFile(new URL('../../installer/sql/10-baseline.sql', import.meta.url), 'utf8')).replace(/\r/g, '');
  const db = await createFixture({ migrate: false });
  for (const name of ['validate_revision', 'apply_correction', 'archive_guard', 'archive_guard_years', 'archive_frozen', 'deletion_attribution']) {
    const m = snapshot.match(new RegExp(`CREATE OR REPLACE FUNCTION homework_private\\.${name}\\([\\s\\S]*?AS \\$function\\$([\\s\\S]*?)\\$function\\$;`));
    assert.ok(m, `${name} có trong bản chụp`);
    const { rows } = await db.query(
      `select md5(replace(p.prosrc, E'\\r', '')) h, md5($2) s from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='homework_private' and p.proname=$1`, [name, m[1]]);
    assert.equal(rows[0].h, rows[0].s, `${name}: harness lệch khỏi bản chụp production`);
  }
});

test('migration chạy lại lần hai không đổi gì, và giữ kiểu xuống dòng CRLF của thân hàm', async () => {
  const db = await createFixture({ crlf: true });
  const src = async () => (await db.query(
    `select p.prosrc s from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='homework_private' and p.proname='validate_revision'`)).rows[0].s;
  const once = await src();
  assert.ok(once.includes("assert_due_not_past((p->>'due_at')::timestamptz, n.due_at); -- [due-not-past]"), 'đã chèn dòng luật hạn');
  assert.equal(once.split('\n').length, once.split('\r\n').length, 'mọi dòng vẫn kết thúc bằng CRLF');
  await db.exec(await migrationSql());
  assert.equal(await src(), once, 'chạy lại không chèn thêm');
  const past = new Date(Date.now() - 3600_000).toISOString();
  const n = await insertNotice(db, { dueOffset: '2 days', status: 'published' });
  await rejectsPastDue(db.query('select homework_private.validate_revision(n, $2::jsonb) from public.homework_notices n where id=$1',
    [n.id, JSON.stringify(revision(past))]), 'validate_revision (CRLF)');
  await db.exec(await rollbackSql());
  assert.ok(!(await src()).includes('assert_due_not_past'), 'rollback gỡ đúng dòng đã chèn');
});

test('migration dừng hẳn nếu validate_revision không còn dòng neo', async () => {
  const db = await createFixture({ migrate: false });
  await db.exec(`create or replace function homework_private.validate_revision(n public.homework_notices, p jsonb) returns jsonb
    language plpgsql as $$ begin return p; end $$`);
  const error = await fails(db.exec(await migrationSql()));
  assert.ok(error, 'phải báo lỗi');
  assert.match(error.message, /anchor found 0 times/);
});
