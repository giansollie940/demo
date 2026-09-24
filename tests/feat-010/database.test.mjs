import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  createFixture, addArchiveDeviceDependencies, migrationSql, ids, weeks, as, asService, asOwner, sessionStart, policy, state,
  register, seedRegistration, reg, fails,
} from './fixture.mjs';
import { setup as archiveSetup, ids as archiveIds, classId as archiveClassId } from '../feat-007/fixture.mjs';

const rejects = async (promise, code, message) => {
  const error = await fails(promise);
  assert.ok(error, `${message}: expected a rejection, got success`);
  const actual = error.code ?? error.cause?.code;
  assert.equal(actual, code, `${message}: expected SQLSTATE ${code}, got ${actual} — ${error.message}`);
  return error;
};

/**
 * The invariant behind every other assertion in this file: the value stored in
 * `effective_uses_electronic_device` is exactly what the policy formula says it
 * should be, for every registration in the database.
 *
 * A stored column can drift from the rule that is supposed to produce it. This
 * is what makes the drift visible instead of leaving it to be discovered by a
 * student whose device silently came back. It runs at the end of every scenario
 * below, so a code path that writes the column without going through
 * `device_use_effective()` fails whichever test reached it.
 */
async function assertNoDrift(db, note = '') {
  const { rows } = await db.query(`
    select r.id, r.effective_uses_electronic_device stored,
           public.device_use_effective(r.uses_electronic_device,r.class_id,r.week_id,r.weekday,r.period_number) computed
    from public.registrations r`);
  for (const row of rows) {
    assert.equal(row.stored, row.computed,
      `đăng ký ${row.id}: cột lưu (${row.stored}) khác công thức (${row.computed}) ${note}`);
  }
  return rows.length;
}

// ---------------------------------------------------------------------------
// §17.1–§17.6 — the interval, and what it does and does not reach
// ---------------------------------------------------------------------------

test('1/3 khoá một buổi chưa bắt đầu, và tuần sau vẫn khoá', async () => {
  const db = await createFixture();
  const soon = await register(db, ids.s, { week: 'next', weekday: 3, period: 3, device: true });
  const later = await register(db, ids.s, { week: 'later', weekday: 3, period: 3, device: true });
  // A different slot on the same day, to prove the lock is per (weekday, period).
  const other = await register(db, ids.s, { week: 'next', weekday: 3, period: 4, device: true });
  assert.equal(soon.effective_uses_electronic_device, true);

  const result = await policy(db, ids.t, 'lock', { weekday: 3, period_number: 3 });
  assert.equal(result.changed, true);
  assert.equal(result.registrations_updated, 2, 'chỉ hai đăng ký đúng slot bị đổi');

  assert.equal(await state(db, 'next', 3, 3), 'locked');
  assert.equal(await state(db, 'later', 3, 3), 'locked', 'AC-010-004: tuần sau tiếp tục khoá');
  assert.equal((await reg(db, soon.id)).effective_uses_electronic_device, false);
  assert.equal((await reg(db, later.id)).effective_uses_electronic_device, false);
  assert.equal((await reg(db, other.id)).effective_uses_electronic_device, true, 'tiết 4 không bị chạm');

  // BR-010-010: the student's own choice is untouched; only the verdict changed.
  assert.equal((await reg(db, soon.id)).uses_electronic_device, true);
  await assertNoDrift(db);
});

test('2 buổi đã bắt đầu trước lúc khoá thì không bị sửa', async () => {
  const db = await createFixture();
  const past = await seedRegistration(db, ids.s, { week: 'past', weekday: 3, period: 3, device: true });
  const future = await register(db, ids.s, { week: 'next', weekday: 3, period: 3, device: true });

  await policy(db, ids.t, 'lock', { weekday: 3, period_number: 3 });

  assert.equal((await reg(db, past.id)).effective_uses_electronic_device, true,
    'AC-010-002 / AC-010-015: tuần trước lúc khoá không đổi');
  assert.equal(await state(db, 'past', 3, 3), 'open');
  assert.equal((await reg(db, future.id)).effective_uses_electronic_device, false);
  await assertNoDrift(db);
});

test('4/5 mở khoá chỉ mở buổi bắt đầu sau đó; tuần trong khoảng cũ vẫn khoá mãi', async () => {
  const db = await createFixture();
  const future = await register(db, ids.s, { week: 'next', weekday: 3, period: 3, device: true });
  await policy(db, ids.t, 'lock', { weekday: 3, period_number: 3 });

  // A session that fell inside the interval: written while locked, so already false.
  const inside = await asService(db, async () => (await db.query(
    `insert into public.registrations(student_id,class_id,week_id,weekday,period_number,content,status,uses_electronic_device,approved_at)
     values($1,$2,$3,3,3,'Trong khoảng khoá','approved',true,now()) returning *`,
    [ids.s2, ids.c, weeks.next])).rows[0]);
  assert.equal(inside.effective_uses_electronic_device, false);

  // Close the interval *after* both those sessions would have started, by
  // backdating the lock so `next` sits inside it and `far` sits after it.
  const nextStart = await sessionStart(db, 'next', 3, 3);
  const laterStart = await sessionStart(db, 'later', 3, 3);
  await db.query(`update public.device_use_lock_intervals
                     set locked_at=$1::timestamptz - interval '1 day', unlocked_at=$2::timestamptz + interval '1 hour'
                   where class_id=$3 and weekday=3 and period_number=3`, [nextStart, nextStart, ids.c]);
  await db.query('select public.device_use_recompute($1,3,3)', [ids.c]);

  assert.equal(await state(db, 'next', 3, 3), 'locked', 'AC-010-006: buổi trong khoảng cũ vẫn khoá');
  assert.equal(await state(db, 'later', 3, 3), 'open', 'AC-010-005: buổi sau lúc mở khoá thì mở');
  assert.ok(new Date(laterStart) > new Date(nextStart));
  assert.equal((await reg(db, future.id)).effective_uses_electronic_device, false);
  assert.equal((await reg(db, inside.id)).effective_uses_electronic_device, false);
  await assertNoDrift(db);
});

test('5/16 BR-010-005: hai biên bằng nhau nghiêng về "không hồi tố"', async () => {
  const db = await createFixture();
  const start = await sessionStart(db, 'next', 2, 2);

  // locked_at == session_start → the session counts as already begun, so the
  // lock does not touch it. This is the half of BR-010-005 that a `>=` would
  // silently invert.
  await asOwner(db, () => db.query(
    `insert into public.device_use_lock_intervals(class_id,weekday,period_number,locked_at) values($1,2,2,$2)`,
    [ids.c, start]));
  assert.equal(await state(db, 'next', 2, 2), 'open', 'session_start = locked_at → không khoá');

  // unlocked_at == session_start → the session is still inside the old interval.
  await db.query(`update public.device_use_lock_intervals
                     set locked_at=$1::timestamptz - interval '1 day', unlocked_at=$1::timestamptz
                   where class_id=$2 and weekday=2 and period_number=2`, [start, ids.c]);
  assert.equal(await state(db, 'next', 2, 2), 'locked', 'session_start = unlocked_at → vẫn thuộc lịch sử khoá');

  // One second later, it is open.
  await db.query(`update public.device_use_lock_intervals
                     set unlocked_at=$1::timestamptz - interval '1 second'
                   where class_id=$2 and weekday=2 and period_number=2`, [start, ids.c]);
  assert.equal(await state(db, 'next', 2, 2), 'open', 'AC-010-016: sau lúc mở khoá thì mở');
});

test('6 EC-010-005: khoá thứ Hai, mở thứ Năm, thì thứ Sáu cùng tuần mở', async () => {
  const db = await createFixture();
  // The interval is written directly so its two endpoints can sit between two
  // real session starts inside one week — the RPC can only use now().
  const monStart = await sessionStart(db, 'next', 1, 1);
  const thuStart = await sessionStart(db, 'next', 4, 1);
  await asOwner(db, () => db.query(
    `insert into public.device_use_lock_intervals(class_id,weekday,period_number,locked_at,unlocked_at)
     values($1,1,1,$2::timestamptz - interval '1 day',null),
           ($1,5,1,$2::timestamptz - interval '1 day',$3::timestamptz)`,
    [ids.c, monStart, thuStart]));
  assert.equal(await state(db, 'next', 1, 1), 'locked', 'thứ Hai vẫn khoá');
  assert.equal(await state(db, 'next', 5, 1), 'open', 'thứ Sáu bắt đầu sau lúc mở → mở');
});

// ---------------------------------------------------------------------------
// §17.7–§17.9 — the weekly ALLOW override
// ---------------------------------------------------------------------------

test('7/8 EC-010-006: mở riêng đúng một buổi, tuần sau trở lại khoá', async () => {
  const db = await createFixture();
  const thisWeek = await register(db, ids.s, { week: 'next', weekday: 3, period: 3, device: true });
  const nextWeek = await register(db, ids.s, { week: 'later', weekday: 3, period: 3, device: true });
  await policy(db, ids.t, 'lock', { weekday: 3, period_number: 3 });
  assert.equal((await reg(db, thisWeek.id)).effective_uses_electronic_device, false);

  const allow = await policy(db, ids.t, 'allow_session',
    { week_id: weeks.next, weekday: 3, period_number: 3 });
  assert.equal(allow.changed, true);

  assert.equal(await state(db, 'next', 3, 3), 'allow_override');
  assert.equal(await state(db, 'later', 3, 3), 'locked', 'AC-010-008: không lan sang tuần sau');
  assert.equal((await reg(db, thisWeek.id)).effective_uses_electronic_device, true,
    'AC-010-007: buổi được mở riêng lấy lại đúng lựa chọn cũ');
  assert.equal((await reg(db, nextWeek.id)).effective_uses_electronic_device, false);

  // The recurring lock is untouched — BR-010-006.
  const open = await db.query(`select count(*)::int n from public.device_use_lock_intervals
                                where class_id=$1 and weekday=3 and period_number=3 and unlocked_at is null`, [ids.c]);
  assert.equal(open.rows[0].n, 1);
  await assertNoDrift(db);
});

test('9 hủy mở riêng trước giờ học trả buổi đó về khoá, và giữ lại lịch sử', async () => {
  const db = await createFixture();
  const row = await register(db, ids.s, { week: 'next', weekday: 3, period: 3, device: true });
  await policy(db, ids.t, 'lock', { weekday: 3, period_number: 3 });
  await policy(db, ids.t, 'allow_session', { week_id: weeks.next, weekday: 3, period_number: 3 });
  assert.equal((await reg(db, row.id)).effective_uses_electronic_device, true);

  const revoked = await policy(db, ids.t, 'revoke_allow', { week_id: weeks.next, weekday: 3, period_number: 3 });
  assert.equal(revoked.changed, true);
  assert.equal(await state(db, 'next', 3, 3), 'locked');
  assert.equal((await reg(db, row.id)).effective_uses_electronic_device, false);

  // §9.2: override history is never hard-deleted.
  const kept = await db.query(`select revoked_at,revoked_by from public.device_use_session_overrides
                                where class_id=$1 and week_id=$2`, [ids.c, weeks.next]);
  assert.equal(kept.rows.length, 1);
  assert.ok(kept.rows[0].revoked_at);
  assert.equal(kept.rows[0].revoked_by, ids.t);
  await assertNoDrift(db);
});

test('DEC-113 hủy mở riêng sau khi buổi đã bắt đầu bị từ chối, và công thức cũng không hồi tố', async () => {
  const db = await createFixture();
  // An override that belongs to a session which has already happened.
  const interval = await asOwner(db, async () => (await db.query(
    `insert into public.device_use_lock_intervals(class_id,weekday,period_number,locked_at)
       values($1,3,3,$2::timestamptz - interval '30 days') returning id`,
    [ids.c, new Date().toISOString()])).rows[0].id);
  const pastStart = await sessionStart(db, 'past', 3, 3);
  await asOwner(db, () => db.query(
    `insert into public.device_use_session_overrides(interval_id,class_id,week_id,weekday,period_number,created_at)
     values($1,$2,$3,3,3,$4::timestamptz - interval '1 day')`, [interval, ids.c, weeks.past, pastStart]));
  assert.equal(await state(db, 'past', 3, 3), 'allow_override');

  await rejects(policy(db, ids.t, 'revoke_allow', { week_id: weeks.past, weekday: 3, period_number: 3 }),
    '42501', 'BR-010-007: không hủy được override của buổi đã bắt đầu');

  // Even if the row were revoked by some other route, the formula ignores a
  // revocation that lands after the session began.
  await asOwner(db, () => db.query(
    `update public.device_use_session_overrides set revoked_at=now() where class_id=$1 and week_id=$2`,
    [ids.c, weeks.past]));
  assert.equal(await state(db, 'past', 3, 3), 'allow_override',
    'DEC-113: hủy muộn không đổi lịch sử của buổi đó');

  // The mirror image, and the one that matters more: an override that appears
  // *after* a session has already run must not reach back and open it. The RPC
  // refuses to create one, but a restore, a manual fix or a future second write
  // path could, so the formula has to refuse too.
  const prevStart = await sessionStart(db, 'prev', 3, 3);
  assert.equal(await state(db, 'prev', 3, 3), 'locked');
  await asOwner(db, () => db.query(
    `insert into public.device_use_session_overrides(interval_id,class_id,week_id,weekday,period_number,created_at)
     values($1,$2,$3,3,3,$4::timestamptz + interval '1 hour')`, [interval, ids.c, weeks.prev, prevStart]));
  assert.equal(await state(db, 'prev', 3, 3), 'locked',
    'override tạo sau khi buổi đã bắt đầu không mở ngược lịch sử');
});

test('EC-010-007 mở khoá toàn cục trước buổi học làm override thành thừa, không thành xung đột', async () => {
  const db = await createFixture();
  const row = await register(db, ids.s, { week: 'later', weekday: 3, period: 3, device: true });
  await policy(db, ids.t, 'lock', { weekday: 3, period_number: 3 });
  await policy(db, ids.t, 'allow_session', { week_id: weeks.later, weekday: 3, period_number: 3 });
  await policy(db, ids.t, 'unlock', { weekday: 3, period_number: 3 });

  assert.equal(await state(db, 'later', 3, 3), 'open', 'mở theo trạng thái chung, không phải theo override');
  assert.equal((await reg(db, row.id)).effective_uses_electronic_device, true);
  await assertNoDrift(db);
});

// ---------------------------------------------------------------------------
// §17.10–§17.13 — nobody gets around it
// ---------------------------------------------------------------------------

for (const [label, actor] of [['10 học sinh', ids.s], ['11 lớp trưởng', ids.m]]) {
  test(`${label} gửi thẳng device=true vào REST trong buổi đang khoá vẫn không có thiết bị`, async () => {
    const db = await createFixture();
    await policy(db, ids.t, 'lock', { weekday: 3, period_number: 3 });

    const created = await register(db, actor, { week: 'next', weekday: 3, period: 3, device: true });
    assert.equal(created.uses_electronic_device, true, 'lựa chọn gốc vẫn được lưu');
    assert.equal(created.effective_uses_electronic_device, false, 'AC-010-009');

    // And again on update — the bypass attempt repeated on an existing row.
    const updated = await as(db, actor, async () => (await db.query(
      `update public.registrations set uses_electronic_device=true, effective_uses_electronic_device=true
        where id=$1 returning *`, [created.id])).rows[0]);
    assert.equal(updated.effective_uses_electronic_device, false,
      'client gửi thẳng cột hiệu lực cũng bị ghi đè');
    await assertNoDrift(db);
  });
}

test('12 AC-010-010: đăng ký bổ sung không phải quyền vượt khoá', async () => {
  const db = await createFixture();
  await policy(db, ids.t, 'lock', { weekday: 3, period_number: 3 });
  // Emergency registrations are created server-side (RLS forbids is_emergency
  // on the student insert policy), so this is the real path.
  const row = await asService(db, async () => (await db.query(
    `insert into public.registrations(student_id,class_id,week_id,weekday,period_number,content,status,
       uses_electronic_device,is_emergency,emergency_reason,emergency_requested_at)
     values($1,$2,$3,3,3,'Bổ sung','submitted',true,true,'Quên đăng ký',now()) returning *`,
    [ids.s, ids.c, weeks.next])).rows[0]);
  assert.equal(row.is_emergency, true);
  assert.equal(row.effective_uses_electronic_device, false);
  await assertNoDrift(db);
});

test('13 EC-010-013: AI ghi được phát hiện thiết bị nhưng không bật được quyền', async () => {
  const db = await createFixture();
  const row = await register(db, ids.s, { week: 'next', weekday: 3, period: 3, device: false });
  await policy(db, ids.t, 'lock', { weekday: 3, period_number: 3 });

  const after = await asService(db, async () => (await db.query(
    `update public.registrations
        set uses_electronic_device=true, device_detection_source='ai', device_detection_confidence=0.93,
            ai_review_status='completed', ai_decision='auto_approve'
      where id=$1 returning *`, [row.id])).rows[0]);

  assert.equal(after.device_detection_source, 'ai', 'metadata phát hiện vẫn được lưu');
  assert.equal(Number(after.device_detection_confidence), 0.93);
  assert.equal(after.effective_uses_electronic_device, false, 'AC-010-011 / DEC-108');
  await assertNoDrift(db);
});

// ---------------------------------------------------------------------------
// §17.14–§17.16 — policy is not an edit
// ---------------------------------------------------------------------------

test('14/26 EC-010-011: khoá không đưa một đăng ký đã duyệt trở lại hàng chờ', async () => {
  const db = await createFixture();
  const row = await seedRegistration(db, ids.s, { week: 'next', weekday: 3, period: 3, device: true, status: 'approved' });
  await db.query(`update public.registrations set ai_review_status='completed', ai_decision='auto_approve',
                    ai_review_count=1, approval_source='ai' where id=$1`, [row.id]);
  const before = await reg(db, row.id);
  await db.query('delete from public.teacher_notifications');

  // A second registration in the same slot that legitimately *does* warrant a
  // notification, and whose notification the teacher has already read.
  //
  // This is the case that separates "the policy change created no notification"
  // from "the policy change did not disturb the notifications that exist".
  // `sync_teacher_review_notification` upserts with `is_read=false`, so any
  // recompute that so much as names `status` in its SET list would mark a read
  // notification unread again — invisible in the row, loud on the teacher's
  // screen.
  const pending = await register(db, ids.s2, { week: 'next', weekday: 3, period: 3, device: true });
  await db.query(`update public.teacher_notifications set is_read=true where registration_id=$1`, [pending.id]);
  const noticeBefore = await db.query(
    `select id,notification_type,is_read,created_at from public.teacher_notifications where registration_id=$1`, [pending.id]);
  assert.equal(noticeBefore.rows.length, 1, 'đăng ký chờ duyệt có đúng một thông báo');

  await policy(db, ids.t, 'lock', { weekday: 3, period_number: 3 });
  const after = await reg(db, row.id);

  const noticeAfter = await db.query(
    `select id,notification_type,is_read,created_at from public.teacher_notifications where registration_id=$1`, [pending.id]);
  assert.deepEqual(noticeAfter.rows, noticeBefore.rows,
    'DEC-107: thông báo đã đọc không được dựng dậy vì một thay đổi policy');
  assert.equal((await reg(db, pending.id)).effective_uses_electronic_device, false);

  assert.equal(after.effective_uses_electronic_device, false);
  for (const column of ['status', 'approval_source', 'approved_at', 'ai_review_status', 'ai_decision',
    'ai_review_count', 'auto_review_reason', 'teacher_comment', 'updated_at']) {
    assert.deepEqual(after[column], before[column], `DEC-107: ${column} không được đổi vì policy`);
  }

  const forApproved = await db.query(
    'select count(*)::int n from public.teacher_notifications where registration_id=$1', [row.id]);
  assert.equal(forApproved.rows[0].n, 0, 'AC-010-012: không tạo thông báo cho đăng ký đã duyệt');
  const total = await db.query('select count(*)::int n from public.teacher_notifications');
  assert.equal(total.rows[0].n, 1, 'chỉ còn đúng thông báo hợp lệ có từ trước');
  const feedback = await db.query('select count(*)::int n from public.ai_review_feedback');
  assert.equal(feedback.rows[0].n, 0, 'không ghi ai_review_feedback');
  await assertNoDrift(db);
});

test('15 AC-010-013: khoá rồi mở trước giờ học trả lại đúng lựa chọn cũ, không ai phải nhập lại', async () => {
  const db = await createFixture();
  const row = await register(db, ids.s, { week: 'far', weekday: 3, period: 3, device: true });
  await policy(db, ids.t, 'lock', { weekday: 3, period_number: 3 });
  assert.equal((await reg(db, row.id)).effective_uses_electronic_device, false);
  assert.equal((await reg(db, row.id)).uses_electronic_device, true, 'BR-010-008: dữ liệu gốc còn nguyên');

  await policy(db, ids.t, 'unlock', { weekday: 3, period_number: 3 });
  const after = await reg(db, row.id);
  assert.equal(after.effective_uses_electronic_device, true);
  assert.equal(after.status, 'submitted');
  await assertNoDrift(db);
});

test('16 một buổi lịch sử nằm trong khoảng khoá vẫn false sau khi mở khoá về sau', async () => {
  const db = await createFixture();
  const pastStart = await sessionStart(db, 'prev', 3, 3);
  const row = await seedRegistration(db, ids.s, { week: 'prev', weekday: 3, period: 3, device: true });
  // Locked before that session, unlocked after it.
  await asOwner(db, () => db.query(
    `insert into public.device_use_lock_intervals(class_id,weekday,period_number,locked_at,unlocked_at)
     values($1,3,3,$2::timestamptz - interval '1 day',now())`, [ids.c, pastStart]));
  await db.query('select public.device_use_recompute($1,3,3)', [ids.c]);

  assert.equal((await reg(db, row.id)).effective_uses_electronic_device, false);
  assert.equal(await state(db, 'prev', 3, 3), 'locked');
  assert.equal(await state(db, 'far', 3, 3), 'open');
  await assertNoDrift(db);
});

// ---------------------------------------------------------------------------
// §17.17–§17.18, §17.30 — who may do what
// ---------------------------------------------------------------------------

test('17 AC-010-017: giáo viên không thao tác được lớp ngoài phân công', async () => {
  const db = await createFixture();
  for (const action of ['lock', 'unlock']) {
    await rejects(policy(db, ids.t2, action, { weekday: 3, period_number: 3 }), '42501',
      `${action} của giáo viên lớp khác`);
  }
  await rejects(policy(db, ids.t2, 'allow_session', { week_id: weeks.next, weekday: 3, period_number: 3 }),
    '42501', 'allow_session của giáo viên lớp khác');
  await rejects(policy(db, ids.t2, 'state', { week_id: weeks.next }), '42501',
    'đọc trạng thái lớp khác');
  const none = await db.query('select count(*)::int n from public.device_use_lock_intervals');
  assert.equal(none.rows[0].n, 0, 'không có gì được ghi');
});

test('18 DEC-109: Admin xem được nhưng không thay giáo viên khoá/mở', async () => {
  const db = await createFixture();
  const view = await policy(db, ids.a, 'state', { week_id: weeks.next });
  assert.ok(Array.isArray(view) && view.length > 0, 'Admin đọc được trạng thái');

  for (const [action, payload] of [
    ['lock', { weekday: 3, period_number: 3 }],
    ['unlock', { weekday: 3, period_number: 3 }],
    ['allow_session', { week_id: weeks.next, weekday: 3, period_number: 3 }],
    ['revoke_allow', { week_id: weeks.next, weekday: 3, period_number: 3 }],
  ]) {
    await rejects(policy(db, ids.a, action, payload), '42501', `Admin ${action}`);
  }
  const history = await policy(db, ids.a, 'history', {});
  assert.deepEqual(history.intervals, [], 'không có gì được ghi');
});

test('30 §13: học sinh và lớp trưởng không ghi thẳng được vào bảng policy', async () => {
  const db = await createFixture();
  await policy(db, ids.t, 'lock', { weekday: 3, period_number: 3 });

  for (const actor of [ids.s, ids.m]) {
    // RLS has no write policy at all on these tables, and the table grant is
    // revoked, so a direct REST write is refused twice over.
    await rejects(as(db, actor, () => db.query(
      `insert into public.device_use_lock_intervals(class_id,weekday,period_number,locked_at)
       values($1,4,4,now())`, [ids.c])), '42501', `${actor} insert interval`);
    await rejects(as(db, actor, () => db.query(
      `update public.device_use_lock_intervals set unlocked_at=now() where class_id=$1`, [ids.c])),
      '42501', `${actor} unlock trực tiếp`);
    await rejects(as(db, actor, () => db.query(
      `delete from public.device_use_lock_intervals where class_id=$1`, [ids.c])),
      '42501', `${actor} xoá lịch sử khoá`);

    // Sol RC1 §8: reading the raw tables is manager-only. What a student needs
    // — why the box is off — comes from the filtered `state` action instead.
    const read = await as(db, actor, () => db.query(
      'select count(*)::int n from public.device_use_lock_intervals'));
    assert.equal(read.rows[0].n, 0, `${actor} không đọc được bảng policy thô`);
  }

  const teacherSees = await as(db, ids.t, () => db.query(
    'select count(*)::int n from public.device_use_lock_intervals'));
  assert.equal(teacherSees.rows[0].n, 1, 'giáo viên phụ trách vẫn đọc được');
  const hidden = await as(db, ids.t2, () => db.query(
    'select count(*)::int n from public.device_use_lock_intervals'));
  assert.equal(hidden.rows[0].n, 0, 'giáo viên lớp khác không đọc được policy lớp này');
});

test('giáo viên được phân công không ghi thẳng vào bảng policy — chỉ qua RPC', async () => {
  const db = await createFixture();
  await rejects(as(db, ids.t, () => db.query(
    `insert into public.device_use_lock_intervals(class_id,weekday,period_number,locked_at)
     values($1,3,3,now())`, [ids.c])), '42501',
    'RLS mặc-định-từ-chối áp cho cả chủ sở hữu policy');
});

// ---------------------------------------------------------------------------
// §17.19–§17.20 — the race
// ---------------------------------------------------------------------------

test('19/20 AC-010-020: ghi đăng ký và đổi policy xếp hàng trên cùng một khoá slot', async () => {
  const db = await createFixture();
  const key = (await db.query('select public.device_use_slot_key($1,3,3) k', [ids.c])).rows[0].k;

  // A registration write holds the slot's advisory lock in SHARE mode for the
  // rest of its transaction, so two students registering for the same slot do
  // not block each other…
  await db.exec('begin');
  await db.exec(`set local role authenticated; set local request.jwt.claim.sub='${ids.s}'`);
  await db.query(`insert into public.registrations(student_id,week_id,weekday,period_number,content,status,uses_electronic_device)
                  values($1,$2,3,3,'Ôn tập','submitted',true)`, [ids.s, weeks.next]);
  // pg_locks splits a bigint advisory key across classid (high 32 bits) and
  // objid (low 32), so the key is split the same way rather than reassembled —
  // reassembling overflows bigint for half of all hash values.
  const unsigned = BigInt.asUintN(64, BigInt(key));
  const held = await db.query(
    `select mode from pg_locks where locktype='advisory' and objsubid=1
       and classid=$1::bigint and objid=$2::bigint`,
    [(unsigned >> 32n).toString(), (unsigned & 0xffffffffn).toString()]);
  await db.exec('commit');

  // pglite runs one connection, so this asserts the lock is *taken* with the
  // right key and mode. It cannot prove serialisability under real concurrency;
  // that stays a release-verification gate, recorded in the report.
  assert.ok(held.rows.some(r => r.mode === 'ShareLock'),
    `ghi đăng ký phải giữ ShareLock trên slot; thấy ${JSON.stringify(held.rows)}`);

  // …and the policy change takes the same key exclusively, so it must wait for
  // every in-flight registration write on that slot before it recomputes.
  // Read through the fixture, not from disk: a source assertion that reads the
  // file directly is invisible to the mutation runner (see `migrationSql`).
  const source = await migrationSql();
  assert.match(source, /perform pg_advisory_xact_lock\(public\.device_use_slot_key\(v_class,v_wd,v_pn\)\)/,
    'RPC phải giữ khoá độc quyền cùng key');
  assert.match(source, /perform pg_advisory_xact_lock_shared\(\s*public\.device_use_slot_key\(new\.class_id,new\.weekday,new\.period_number\)\)/,
    'trigger phải giữ khoá chia sẻ cùng key');

  // Whatever the order, the committed outcome obeys the lock.
  await policy(db, ids.t, 'lock', { weekday: 3, period_number: 3 });
  const rows = await db.query(`select effective_uses_electronic_device e from public.registrations
                                where class_id=$1 and weekday=3 and period_number=3`, [ids.c]);
  assert.ok(rows.rows.length > 0);
  assert.ok(rows.rows.every(r => r.e === false), 'không có device=true nào lọt qua buổi đang khoá');
  await assertNoDrift(db);
});

// ---------------------------------------------------------------------------
// §17.21–§17.22 — the session clock
// ---------------------------------------------------------------------------

test('21 EC-010-008: biên dùng thời khoá biểu có hiệu lực cho buổi đó, không phải giờ mặc định', async () => {
  const db = await createFixture();
  // A timetable version that moves period 3 on Wednesday from 09:10 to 14:00,
  // effective only from the `later` week onward.
  const laterStart = (await db.query('select start_date from public.weeks where id=$1', [weeks.later])).rows[0].start_date;
  await asService(db, () => db.query(
    `with t as (insert into public.timetable_templates(school_year_id,name) values($1,'Chiều') returning id),
          v as (insert into public.timetable_template_versions(template_id,version_number,config)
                select id,1,'{}'::jsonb from t returning id),
          p as (insert into public.timetable_version_periods(version_id,weekday,period_number,start_time,end_time)
                select id,3,3,'14:00','14:45' from v returning version_id)
     insert into public.class_timetable_assignments(class_id,school_year_id,template_version_id,effective_from,effective_to)
     select $2,$1,(select id from v),$3::date,$3::date + 60`, [ids.y, ids.c, laterStart]));

  const before = await sessionStart(db, 'next', 3, 3);
  const after = await sessionStart(db, 'later', 3, 3);
  assert.equal(new Date(before).getUTCHours(), 2, 'tuần chưa áp dụng: 09:10 +07 = 02:10Z');
  assert.equal(new Date(after).getUTCHours(), 7, 'tuần đã áp dụng: 14:00 +07 = 07:00Z');

  // A lock placed between the two candidate start times must follow the
  // timetable, not a hard-coded hour.
  await asOwner(db, () => db.query(
    `insert into public.device_use_lock_intervals(class_id,weekday,period_number,locked_at,unlocked_at)
     values($1,3,3,$2::timestamptz - interval '1 second',$3::timestamptz - interval '1 second')`,
    [ids.c, before, after]));
  assert.equal(await state(db, 'next', 3, 3), 'locked');
  assert.equal(await state(db, 'later', 3, 3), 'open',
    'buổi 14:00 bắt đầu sau lúc mở khoá nên mở, dù cùng slot');
});

test('22 EC-010-010: không giải được giờ bắt đầu thì báo lỗi rõ, và không sửa dữ liệu', async () => {
  const db = await createFixture();

  // Period 8 is a legal period number (the check allows 1–9) that this school
  // has never scheduled: no `periods` row, no `school_year_periods` row, no
  // timetable entry. The resolver therefore cannot say when such a session
  // starts, and DEC-110 forbids guessing.
  assert.equal(await sessionStart(db, 'next', 3, 8), null, 'resolver trả NULL');

  const error = await rejects(
    policy(db, ids.t, 'allow_session', { week_id: weeks.next, weekday: 3, period_number: 8 }),
    'P0001', 'RPC phải từ chối thay vì đoán');
  assert.match(error.message, /DEVICE_POLICY_SESSION_TIME_UNRESOLVED/);
  assert.equal((await db.query('select count(*)::int n from public.device_use_session_overrides')).rows[0].n, 0,
    'không ghi gì khi từ chối');

  // The `lock` path deliberately does not need the boundary — a lock is "from
  // now on", so it is meaningful even for a slot whose sessions are not on the
  // timetable yet (BR-010-003: policy không tự tạo session). It is the moment a
  // registration touches that slot that the boundary becomes necessary, and
  // there the FK below makes the unresolvable case impossible.
  await rejects(policy(db, ids.t, 'lock', { weekday: 3, period_number: 8 }), '23503',
    'không khoá được một tiết không tồn tại trong bảng periods');
});

test('22b vì sao nhánh fail-safe của trigger không tới được, và điều gì giữ nó như vậy', async () => {
  // `study_session_start` falls back periods → school_year_periods → timetable,
  // and `periods.start_time` is NOT NULL, so a registration can only exist for a
  // period that has a start time. That makes EC-010-010 unreachable on the
  // registration path — a stronger outcome than the spec asked for, but one that
  // rests on two schema facts rather than on anything FEAT-010 wrote.
  //
  // This asserts those two facts. If either goes away, the raise in
  // `device_use_policy_state` stops being defensive and starts being load-
  // bearing, and whoever removed it should find out here.
  const db = await createFixture();
  const fk = await db.query(`select 1 from pg_constraint c join pg_class t on t.oid=c.conrelid
     where t.relname='registrations' and c.conname='registrations_period_number_fkey' and c.contype='f'`);
  assert.equal(fk.rows.length, 1, 'registrations.period_number vẫn tham chiếu periods');

  const notNull = await db.query(`select is_nullable from information_schema.columns
     where table_schema='public' and table_name='periods' and column_name='start_time'`);
  assert.equal(notNull.rows[0].is_nullable, 'NO', 'periods.start_time vẫn NOT NULL');

  // And the raise itself is real code, not a comment: with a policy on a slot
  // whose start time cannot be resolved, the state function throws rather than
  // returning 'open' or 'locked'.
  await db.query('alter table public.device_use_lock_intervals drop constraint device_use_lock_intervals_period_number_fkey');
  await asOwner(db, () => db.query(
    `insert into public.device_use_lock_intervals(class_id,weekday,period_number,locked_at)
     values($1,3,8,now() - interval '1 day')`, [ids.c]));
  await rejects(db.query('select public.device_use_policy_state($1,$2,3,8)', [ids.c, weeks.next]),
    'P0001', 'state raise thay vì đoán');
});

// ---------------------------------------------------------------------------
// §17.23–§17.29 — the migration, and everything it must not break
// ---------------------------------------------------------------------------

test('23 AC-010-022: backfill giữ nguyên lựa chọn thiết bị đang có', async () => {
  const db = await createFixture({ migrate: false });
  const before = [];
  for (const [student, week, device] of [[ids.s, 'past', true], [ids.s2, 'past', false], [ids.s, 'prev', true]]) {
    const row = await asService(db, async () => (await db.query(
      `insert into public.registrations(student_id,class_id,week_id,weekday,period_number,content,status,uses_electronic_device)
       values($1,$2,$3,3,3,'Cũ','approved',$4) returning *`,
      [student, ids.c, weeks[week], device])).rows[0]);
    before.push(row);
  }
  assert.ok(before.every(r => !('effective_uses_electronic_device' in r)), 'cột chưa tồn tại trước migration');

  await db.exec(await readFile(new URL('../../database/upgrade/13-FEAT-010-DEVICE-USE-LOCK.sql', import.meta.url), 'utf8'));

  for (const row of before) {
    const after = await reg(db, row.id);
    assert.equal(after.uses_electronic_device, row.uses_electronic_device, 'cột gốc không đổi');
    assert.equal(after.effective_uses_electronic_device, row.uses_electronic_device,
      'chưa có policy nào nên hiệu lực = yêu cầu');
    assert.deepEqual(after.status, row.status);
    assert.deepEqual(after.updated_at, row.updated_at, 'backfill không chạm updated_at');
  }
  await assertNoDrift(db, '(sau migration)');
});

test('24/25 hồi quy: đăng ký, sửa, và vòng AI vẫn chạy y như cũ khi không có policy', async () => {
  const db = await createFixture();
  const row = await register(db, ids.s, { week: 'next', weekday: 2, period: 2, device: false, status: 'submitted' });
  assert.equal(row.status, 'submitted');
  assert.equal(row.ai_review_status, 'pending', 'apply_smart_approval vẫn xếp hàng AI');
  assert.equal(row.effective_uses_electronic_device, false);

  // A student ticking the box is still a student edit: review is re-triggered.
  const edited = await as(db, ids.s, async () => (await db.query(
    `update public.registrations set uses_electronic_device=true where id=$1 returning *`, [row.id])).rows[0]);
  assert.equal(edited.ai_review_status, 'pending');
  assert.equal(edited.effective_uses_electronic_device, true);

  // AI completes; effective follows the request because nothing is locked.
  const decided = await asService(db, async () => (await db.query(
    `update public.registrations set ai_review_status='completed', ai_decision='auto_approve',
        status='approved', approval_source='ai', approved_at=now(), ai_review_count=1
      where id=$1 returning *`, [row.id])).rows[0]);
  assert.equal(decided.status, 'approved');
  assert.equal(decided.approval_source, 'ai');
  assert.equal(decided.effective_uses_electronic_device, true);

  const watch = await db.query(`select notification_type from public.teacher_notifications where registration_id=$1`, [row.id]);
  assert.deepEqual(watch.rows, [], 'thông báo ai_watch được dọn khi AI xong');
  await assertNoDrift(db);
});

test('27/28 hồi quy: cột hiệu lực đọc được cùng lúc với phần còn lại của đăng ký', async () => {
  const db = await createFixture();
  await register(db, ids.s, { week: 'next', weekday: 3, period: 3, device: true });
  await register(db, ids.s2, { week: 'next', weekday: 3, period: 3, device: true });
  await policy(db, ids.t, 'lock', { weekday: 3, period_number: 3 });
  await register(db, ids.s, { week: 'next', weekday: 4, period: 3, device: true });

  // Tracking and the dashboard both count devices. Counting the raw column and
  // counting the effective one now give different answers, which is the whole
  // point of AC-010-014 — and the reason every read path has to move.
  const counts = await as(db, ids.t, () => db.query(
    `select count(*) filter (where uses_electronic_device) requested,
            count(*) filter (where effective_uses_electronic_device) effective
       from public.registrations where class_id=$1`, [ids.c]));
  assert.equal(Number(counts.rows[0].requested), 3);
  assert.equal(Number(counts.rows[0].effective), 1, 'chỉ buổi không bị khoá còn tính là có thiết bị');
  await assertNoDrift(db);
});

test('29 hồi quy: vòng đời tuần và thời khoá biểu không bị FEAT-010 chạm vào', async () => {
  const db = await createFixture();
  await policy(db, ids.t, 'lock', { weekday: 3, period_number: 3 });

  // The week can still be closed and reopened, and the timetable still resolves.
  await as(db, ids.t, () => db.query(
    `update public.class_weeks set manual_status='locked' where class_id=$1 and week_id=$2`, [ids.c, weeks.next]));
  const status = await db.query('select public.class_week_effective_status($1,$2) s', [ids.c, weeks.next]);
  assert.equal(status.rows[0].s, 'locked');

  // A locked week stops registration, as it did before FEAT-010 — and the
  // failure is RLS's, not the device policy's.
  const error = await fails(register(db, ids.s, { week: 'next', weekday: 3, period: 3 }));
  assert.ok(error);
  assert.doesNotMatch(error.message, /DEVICE_POLICY/, 'lý do từ chối vẫn là tuần đóng, không phải policy');

  await as(db, ids.t, () => db.query(
    `update public.class_weeks set manual_status='open' where class_id=$1 and week_id=$2`, [ids.c, weeks.next]));
  const reopened = await register(db, ids.s, { week: 'next', weekday: 3, period: 3, device: true });
  assert.equal(reopened.effective_uses_electronic_device, false, 'policy vẫn áp dụng sau khi mở tuần');
});

// ---------------------------------------------------------------------------
// Idempotence, and the FEAT-007 question
// ---------------------------------------------------------------------------

test('EC-010-001/EC-010-002: khoá hai lần không tạo khoảng chồng; mở khi đang mở là no-op', async () => {
  const db = await createFixture();
  const first = await policy(db, ids.t, 'lock', { weekday: 3, period_number: 3 });
  const again = await policy(db, ids.t, 'lock', { weekday: 3, period_number: 3 });
  assert.equal(again.changed, false);
  assert.equal(again.interval_id, first.interval_id);
  assert.equal((await db.query('select count(*)::int n from public.device_use_lock_intervals')).rows[0].n, 1);

  await policy(db, ids.t, 'unlock', { weekday: 3, period_number: 3 });
  const noop = await policy(db, ids.t, 'unlock', { weekday: 3, period_number: 3 });
  assert.equal(noop.changed, false);
  assert.equal((await db.query('select count(*)::int n from public.device_use_lock_intervals')).rows[0].n, 1,
    'không tạo khoảng giả để ghi nhận một thao tác không làm gì');

  // And the unique index means the idempotence does not depend on the RPC alone.
  await rejects(asOwner(db, () => db.query(
    `insert into public.device_use_lock_intervals(class_id,weekday,period_number,locked_at)
     values($1,3,3,now()),($1,3,3,now())`, [ids.c])), '23505',
    'hai khoảng đang mở cho cùng slot bị chặn ở mức dữ liệu');
});

test('§19/DEC-111: purge của FEAT-007 không chạm bảng nào mà policy tham chiếu', async () => {
  // The archive question is decided by reading the purge itself rather than by
  // asserting a belief about it: if a future FEAT-007 step starts deleting
  // classes, weeks or registrations, this fails and the retain decision has to
  // be revisited.
  const purge = await readFile(new URL('../../database/upgrade/12-FEAT-007-ARCHIVE-PURGE.sql', import.meta.url), 'utf8');
  const deleted = new Set([...purge.matchAll(/delete from (?:public\.)?([a-z_]+)/g)].map(m => m[1]));

  for (const referenced of ['classes', 'weeks', 'periods', 'profiles', 'registrations']) {
    assert.ok(!deleted.has(referenced),
      `purge xoá ${referenced}, mà bảng policy của FEAT-010 tham chiếu nó — quyết định "retain" không còn đúng`);
  }
  for (const own of ['device_use_lock_intervals', 'device_use_session_overrides']) {
    assert.ok(!deleted.has(own), `${own} bị purge nhưng bản lưu trữ không mang nó theo`);
  }
});

test('FEAT-010 và FEAT-001…008 không dùng chung một đối tượng nào', async () => {
  // The two halves of this app touch two disjoint sets of tables, and that is
  // why FEAT-010 can be added without re-running the homework corpus on top of
  // migration 13 — there is no shared object for it to disturb. That claim is
  // only worth making if something checks it, because a single `homework_…`
  // reference added later would make it false and nothing else would notice.
  const code = text => text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').filter(line => !line.trim().startsWith('--')).join('\n');

  const device = code(await readFile(new URL('../../database/upgrade/13-FEAT-010-DEVICE-USE-LOCK.sql', import.meta.url), 'utf8'));
  const shared = [...device.matchAll(/\b(homework_[a-z_]+|english_group[a-z_]*|grade_subject_catalog)\b/g)].map(m => m[1]);
  assert.deepEqual([...new Set(shared)], [], 'migration 13 chạm vào đối tượng của FEAT-001…008');

  for (const file of ['05-FEAT-001-BAO-BAI.sql', '07-FEAT-002-PERMISSIONS-LIFECYCLE.sql',
    '08-FEAT-004-MULTI-CLASS-CATALOG.sql', '09-FEAT-005-OWNERSHIP-CORRECTION.sql',
    '10-FEAT-006-HOMEWORK-MEDIA.sql', '11-FEAT-008-STORAGE-HEALTH.sql', '12-FEAT-007-ARCHIVE-PURGE.sql']) {
    const body = code(await readFile(new URL('../../database/upgrade/' + file, import.meta.url), 'utf8'));
    for (const name of ['registrations', 'device_use_', 'apply_smart_approval', 'study_session_start']) {
      assert.ok(!body.includes(name), `${file} chạm vào ${name} — hai hệ thống không còn rời nhau`);
    }
  }
});

test('trigger của FEAT-010 chạy sau trigger điền class_id, và điền đúng ngay từ INSERT', async () => {
  // The name prefix is what puts it there, and a rename would move it silently.
  // On INSERT the client sends no class_id at all — `trg_00_set_registration_class`
  // derives it from the student's profile — so a policy trigger that ran first
  // would evaluate against NULL and quietly return 'open' for every new row.
  const db = await createFixture();
  const order = await db.query(`select tgname from pg_trigger t join pg_class c on c.oid=t.tgrelid
     where c.relname='registrations' and not t.tgisinternal and t.tgtype::int & 2 = 2 order by tgname`);
  const names = order.rows.map(row => row.tgname);
  assert.ok(names.indexOf('trg_06_apply_device_use_policy') > names.indexOf('trg_00_set_registration_class'),
    `thứ tự sai: ${names.join(' → ')}`);

  await policy(db, ids.t, 'lock', { weekday: 3, period_number: 3 });
  const created = await register(db, ids.s, { week: 'next', weekday: 3, period: 3, device: true });
  assert.equal(created.class_id, ids.c, 'class_id được điền trước khi policy chạy');
  assert.equal(created.effective_uses_electronic_device, false,
    'policy nhìn thấy class_id nên khoá được áp ngay từ lần INSERT đầu tiên');
});

// ===========================================================================
// Sol RC1 — reproductions, written before anything was changed.
// ===========================================================================

test('RC1-P1 override tạo khi slot chưa khoá phải bị từ chối', async () => {
  const db = await createFixture();
  // The slot is open. There is no lock for this override to be an exception to.
  assert.equal(await state(db, 'next', 3, 3), 'open');
  await rejects(policy(db, ids.t, 'allow_session', { week_id: weeks.next, weekday: 3, period_number: 3 }),
    '42501', 'BR-010-006: override chỉ tồn tại bên trong một khoảng khoá');
  assert.equal((await db.query('select count(*)::int n from public.device_use_session_overrides')).rows[0].n, 0);

  // The harder half: the slot *has* an interval, just not one that covers this
  // session. Refusing only when there is no interval at all would let the RPC
  // attach an override to a stale cycle and report success for a session that
  // is plainly open.
  await policy(db, ids.t, 'lock', { weekday: 3, period_number: 3 });
  await policy(db, ids.t, 'unlock', { weekday: 3, period_number: 3 });
  assert.equal((await db.query(
    'select count(*)::int n from public.device_use_lock_intervals where class_id=$1', [ids.c])).rows[0].n, 1,
    'khoảng đã đóng vẫn còn trong lịch sử');
  assert.equal(await state(db, 'next', 3, 3), 'open', 'buổi này không nằm trong khoảng nào');

  await rejects(policy(db, ids.t, 'allow_session', { week_id: weeks.next, weekday: 3, period_number: 3 }),
    '42501', 'có khoảng khoá trong lịch sử, nhưng không khoá buổi này');
  assert.equal((await db.query('select count(*)::int n from public.device_use_session_overrides')).rows[0].n, 0);
});

test('RC1-P1 override của chu kỳ khoá cũ không sống lại ở chu kỳ khoá mới', async () => {
  const db = await createFixture();
  const row = await register(db, ids.s, { week: 'far', weekday: 3, period: 3, device: true });
  // Lock A → ALLOW → Unlock A → Lock B.
  await policy(db, ids.t, 'lock', { weekday: 3, period_number: 3 });
  await policy(db, ids.t, 'allow_session', { week_id: weeks.far, weekday: 3, period_number: 3 });
  await policy(db, ids.t, 'unlock', { weekday: 3, period_number: 3 });
  await policy(db, ids.t, 'lock', { weekday: 3, period_number: 3 });

  assert.equal(await state(db, 'far', 3, 3), 'locked',
    'khoá mới phải áp dụng; override thuộc chu kỳ đã đóng không mở lại buổi này');
  assert.equal((await reg(db, row.id)).effective_uses_electronic_device, false);
  await assertNoDrift(db);
});

test('RC1-P2 state phải dùng lịch hiệu lực của tuần, không phải lịch nền', async () => {
  const db = await createFixture();
  // Week-only session: base schedule has no Thursday period 5 for this class…
  await db.query(`delete from public.study_schedule where class_id=$1 and weekday=4 and period_number=5`, [ids.c]);
  // …but week `next` adds it, exactly as WeeksPage would.
  await asService(db, () => db.query(
    `insert into public.week_schedule_overrides(class_id,week_id,weekday,period_number,is_study_period)
     select $1::uuid,$2::uuid,s.weekday,s.period_number,true from public.study_schedule s where s.class_id=$1
     union all select $1::uuid,$2::uuid,4,5,true`, [ids.c, weeks.next]));
  await policy(db, ids.t, 'lock', { weekday: 4, period_number: 5 });

  const view = await policy(db, ids.t, 'state', { week_id: weeks.next });
  const slot = view.find(row => row.weekday === 4 && row.period_number === 5);
  assert.ok(slot, 'buổi chỉ có ở tuần này phải xuất hiện trong state');
  assert.equal(slot.state, 'locked',
    'nếu không, frontend coi slot thiếu là "open" và học sinh thấy ô chọn mở trong khi backend đã khoá');
});

test('RC1-P2 buổi bị lịch tuần gỡ bỏ thì không còn trong state', async () => {
  const db = await createFixture();
  // Week `next` keeps every base slot except Wednesday period 3.
  await asService(db, () => db.query(
    `insert into public.week_schedule_overrides(class_id,week_id,weekday,period_number,is_study_period)
     select $1,$2,s.weekday,s.period_number,true from public.study_schedule s
      where s.class_id=$1 and not (s.weekday=3 and s.period_number=3)`, [ids.c, weeks.next]));

  const view = await policy(db, ids.t, 'state', { week_id: weeks.next });
  assert.ok(!view.some(row => row.weekday === 3 && row.period_number === 3),
    'buổi đã bị gỡ khỏi tuần không được hiện trên trang chính sách');
  // And an ordinary week with no overrides still uses the base schedule.
  const plain = await policy(db, ids.t, 'state', { week_id: weeks.later });
  assert.ok(plain.some(row => row.weekday === 3 && row.period_number === 3));
});

test('RC1-P3 hàm trợ giúp SECURITY DEFINER không được lộ ra cho client', async () => {
  const db = await createFixture();
  // `device_use_policy_state` carries no authorization of its own — the wrapper
  // has it. So a client that can execute the helper directly has a second API
  // that skips the class check entirely.
  for (const call of [
    `select public.device_use_policy_state($1,$2,3,3)`,
    `select public.device_use_effective(true,$1,$2,3,3)`,
  ]) {
    await rejects(as(db, ids.s, () => db.query(call, [ids.c, weeks.next])), '42501',
      `học sinh gọi thẳng: ${call}`);
    await rejects(as(db, ids.t2, () => db.query(call, [ids.c, weeks.next])), '42501',
      `giáo viên lớp khác gọi thẳng: ${call}`);
  }
});

test('RC1-§8 history chỉ dành cho người quản lý lớp; state của học sinh không mang thông tin tác nhân', async () => {
  const db = await createFixture();
  await policy(db, ids.t, 'lock', { weekday: 3, period_number: 3 });

  await rejects(policy(db, ids.s, 'history', {}), '42501', 'học sinh gọi history');
  await rejects(policy(db, ids.m, 'history', {}), '42501', 'lớp trưởng gọi history');
  const managerView = await policy(db, ids.t, 'history', {});
  assert.equal(managerView.intervals.length, 1, 'giáo viên phụ trách vẫn xem được');

  // Raw tables carry locked_by / unlocked_by / created_by / revoked_by. A
  // student has no use for who pressed the button.
  for (const actor of [ids.s, ids.m]) {
    const rows = await as(db, actor, () => db.query('select count(*)::int n from public.device_use_lock_intervals'));
    assert.equal(rows.rows[0].n, 0, 'học sinh không đọc được bảng lịch sử policy');
  }

  const studentView = await policy(db, ids.s, 'state', { week_id: weeks.next });
  const slot = studentView.find(row => row.weekday === 3 && row.period_number === 3);
  assert.ok(slot, 'học sinh vẫn thấy trạng thái buổi của mình');
  assert.equal(slot.state, 'locked');
  assert.deepEqual(Object.keys(slot).sort(), ['period_number', 'session_start', 'state', 'weekday'],
    'state của học sinh chỉ mang đúng thứ cần để hiển thị');
});

test('RC1-§10 state phân biệt trạng thái lịch sử của buổi với trạng thái hiện tại của slot', async () => {
  const db = await createFixture();
  const prevStart = await sessionStart(db, 'prev', 3, 3);
  // A lock that covered last week and has since been released.
  await asOwner(db, () => db.query(
    `insert into public.device_use_lock_intervals(class_id,weekday,period_number,locked_at,unlocked_at)
     values($1,3,3,$2::timestamptz - interval '1 day', now())`, [ids.c, prevStart]));

  const view = await policy(db, ids.t, 'state', { week_id: weeks.prev });
  const slot = view.find(row => row.weekday === 3 && row.period_number === 3);
  assert.equal(slot.state, 'locked', 'buổi tuần trước vẫn thuộc lịch sử khoá');
  assert.equal(slot.current_recurring_state, 'open',
    'nhưng slot hiện tại đang mở — nút phải là "Khóa từ bây giờ", không phải "Mở từ bây giờ"');
});

test('RC1-P2 định nghĩa "tuần này có buổi nào" khớp với định nghĩa đang dùng của hệ thống', async () => {
  // `class_week_effective_status()` already decides which sessions a week has,
  // and RegistrationPage follows the same precedence. `device_use_week_slots()`
  // must not become a second answer to that question, so this pins the two
  // together by running the existing function's own subquery and comparing.
  const db = await createFixture();
  const existing = `
    select o.weekday,o.period_number from public.week_schedule_overrides o
     where o.class_id=$1 and o.week_id=$2 and o.is_study_period=true
    union all
    select s.weekday,s.period_number from public.study_schedule s
     where s.class_id=$1 and s.is_study_period=true
       and not exists(select 1 from public.week_schedule_overrides ox
                       where ox.class_id=$1 and ox.week_id=$2)`;

  const compare = async (label) => {
    const mine = await db.query(
      'select weekday,period_number from public.device_use_week_slots($1,$2) order by 1,2', [ids.c, weeks.next]);
    const theirs = await db.query(
      `select distinct weekday,period_number from (${existing}) t order by 1,2`, [ids.c, weeks.next]);
    assert.deepEqual(mine.rows, theirs.rows, label);
  };

  await compare('tuần không có lịch riêng');
  await asService(db, () => db.query(
    `insert into public.week_schedule_overrides(class_id,week_id,weekday,period_number,is_study_period)
     values($1::uuid,$2::uuid,4,5,true),($1::uuid,$2::uuid,1,1,false)`, [ids.c, weeks.next]));
  await compare('tuần có lịch riêng, gồm cả một ô bị tắt');
});

test('RC1-§8 học sinh không xem được lớp khác, và người chưa đăng nhập không gọi được hàm nào', async () => {
  const db = await createFixture();
  await rejects(as(db, ids.s, () => db.query(
    'select public.device_use_policy($1,$2::jsonb)',
    ['state', JSON.stringify({ class_id: ids.c2, week_id: weeks.next })])), '42501',
    'học sinh xem trạng thái lớp khác');

  // anon is what an unauthenticated PostgREST request runs as.
  await db.exec("set role anon; set request.jwt.claim.sub=''");
  try {
    for (const [sql, params] of [
      ['select public.device_use_policy($1,$2::jsonb)', ['state', JSON.stringify({ class_id: ids.c })]],
      ['select public.device_use_policy_state($1,$2,3,3)', [ids.c, weeks.next]],
      ['select public.device_use_effective(true,$1,$2,3,3)', [ids.c, weeks.next]],
      ['select public.device_use_week_slots($1,$2)', [ids.c, weeks.next]],
      ['select public.device_use_recompute($1,3,3)', [ids.c]],
    ]) {
      const error = await fails(db.query(sql, params));
      assert.ok(error, `anon gọi được: ${sql}`);
      assert.equal(error.code ?? error.cause?.code, '42501', `anon: ${sql} — ${error.message}`);
    }
  } finally { await db.exec('reset role'); }
});

test('RC1-P3 đúng một hàm của FEAT-010 gọi được từ client, và đó là wrapper', async () => {
  // Stronger than mutating one grant: this reads the catalog and fails for any
  // FEAT-010 function that becomes client-callable, including one added later
  // and including a lingering default PUBLIC grant (grantee 0, which does not
  // join to pg_roles and so is invisible to the obvious version of this query).
  const db = await createFixture();
  // Sol RC3 R-002: `device\_use%` missed `apply_device_use_policy`, so the net is
  // now the migration's whole function set, named rather than pattern-matched.
  const FEAT010_FUNCTIONS = [
    'apply_device_use_policy', 'device_use_bump_signal', 'device_use_effective',
    'device_use_locking_interval', 'device_use_policy', 'device_use_policy_state',
    'device_use_recompute', 'device_use_slot_key', 'device_use_week_slots',
    // Sol RC5 R-004/R-005: chốt chặn năm học, và trigger bảng bắt buộc nó.
    'device_use_assert_year_writable', 'device_use_guard_year_freeze',
    // RC9 R-009/R-010: cascade-safe guard used by both policy tables after migration 14.
    'device_use_year_freeze_guard_rc9',
    // Sol RC6 R-006: quyền sở hữu của override.
    'device_use_guard_override_week',
    // Sol RC7 R-008: "ngoại lệ nào đang có hiệu lực", viết đúng một lần.
    'device_use_live_override',
  ];
  const created = await db.query(
    `select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname = any($1) order by 1`, [FEAT010_FUNCTIONS]);
  assert.deepEqual(created.rows.map(r => r.proname), [...FEAT010_FUNCTIONS].sort(),
    'danh sách trong test phải khớp đúng những hàm migration tạo ra');

  const { rows } = await db.query(`
    select p.proname, coalesce(r.rolname,'PUBLIC') grantee
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
      left join pg_roles r on r.oid=a.grantee
     where n.nspname='public' and a.privilege_type='EXECUTE'
       and p.proname = any($1)
       and (a.grantee = 0 or r.rolname in ('anon','authenticated'))
     order by 1,2`, [FEAT010_FUNCTIONS]);
  assert.deepEqual(rows, [{ proname: 'device_use_policy', grantee: 'authenticated' }]);
});

// ===========================================================================
// Sol RC2 — the remaining blocker, reproduced before anything was changed.
// ===========================================================================

test('RC2-§8 học sinh phải quan sát được "policy vừa đổi" qua thứ em ấy được phép đọc', async () => {
  // RC2 khoá hai bảng policy về manager-only (đúng), rồi lại dựa vào chính hai
  // bảng đó để phát tín hiệu realtime (sai). Postgres Changes áp RLS khi phát:
  // không đọc được dòng thì không nhận được sự kiện. Nên với học sinh — đúng
  // nhóm người mà §9 định phục vụ — không có gì tới cả.
  //
  // Test này không dựng được một kết nối realtime, và nó không giả vờ làm thế.
  // Nó kiểm tra điều kiện *cần*: tồn tại một dòng mà học sinh của lớp đọc được,
  // đổi mỗi khi policy đổi, và không mang dữ liệu tác nhân.
  const db = await createFixture();

  // `select *`, not a column list: a client reads the whole row, so a column
  // added later must show up here. Naming three columns would have made the
  // shape assertion below true by construction — it did, and a mutation that
  // added `changed_by` walked straight through it.
  const visible = async (actor) => (await as(db, actor, () => db.query(
    'select * from public.device_use_policy_signals where class_id=$1', [ids.c])
  )).rows[0] ?? null;

  const before = await visible(ids.s);
  await policy(db, ids.t, 'lock', { weekday: 3, period_number: 3 });
  const afterLock = await visible(ids.s);
  assert.ok(afterLock, 'học sinh của lớp phải đọc được tín hiệu');
  assert.ok(!before || Number(afterLock.version) > Number(before.version), 'Lock phải làm tín hiệu đổi');

  await policy(db, ids.t, 'allow_session', { week_id: weeks.next, weekday: 3, period_number: 3 });
  const afterAllow = await visible(ids.s);
  assert.ok(Number(afterAllow.version) > Number(afterLock.version), 'mở riêng cũng phải phát tín hiệu');

  await policy(db, ids.t, 'revoke_allow', { week_id: weeks.next, weekday: 3, period_number: 3 });
  const afterRevoke = await visible(ids.s);
  assert.ok(Number(afterRevoke.version) > Number(afterAllow.version), 'hủy mở riêng cũng phải phát tín hiệu');

  await policy(db, ids.t, 'unlock', { weekday: 3, period_number: 3 });
  const afterUnlock = await visible(ids.s);
  assert.ok(Number(afterUnlock.version) > Number(afterRevoke.version), 'Unlock cũng phải phát tín hiệu');

  // Và nó không được là một đường vòng để lộ đúng thứ §8 vừa đóng lại.
  assert.deepEqual(Object.keys(afterUnlock).sort(), ['changed_at', 'class_id', 'version'],
    'tín hiệu chỉ mang lớp nào + đổi lúc nào, không mang ai bấm nút');

  // Và bảng không được có đường nào trỏ về một con người, dù tên cột là gì.
  const links = await db.query(`
    select a.attname from pg_constraint c
      join pg_class t on t.oid=c.conrelid
      join pg_class f on f.oid=c.confrelid
      join unnest(c.conkey) k(attnum) on true
      join pg_attribute a on a.attrelid=t.oid and a.attnum=k.attnum
     where t.relname='device_use_policy_signals' and c.contype='f' and f.relname='profiles'`);
  assert.deepEqual(links.rows, [], 'tín hiệu không được tham chiếu profiles');

  // Lớp trưởng cũng vậy; giáo viên lớp khác thì không.
  assert.ok(await visible(ids.m), 'lớp trưởng đọc được');
  assert.equal(await visible(ids.t2), null, 'giáo viên lớp khác không đọc được');
});

test('RC2-§8 tín hiệu chỉ ghi được qua RPC, không ghi thẳng được', async () => {
  const db = await createFixture();
  await policy(db, ids.t, 'lock', { weekday: 3, period_number: 3 });
  for (const actor of [ids.s, ids.m, ids.t]) {
    await rejects(as(db, actor, () => db.query(
      'update public.device_use_policy_signals set version=version+1 where class_id=$1', [ids.c])),
      '42501', `${actor} tự bơm tín hiệu`);
  }
});

test('RC3-R-002 ba bảng của FEAT-010 cũng không được lộ cho anon', async () => {
  // Cùng một lỗ hổng như R-002 nhưng ở bảng: `pg_default_acl` của production cấp
  // `anon=arwdDxtm` **tường minh** cho mọi bảng mới trong schema public. Chỉ dựa
  // vào RLS là không đủ để yên tâm — một bảng quên bật RLS sẽ mở toang.
  const db = await createFixture();
  const TABLES = ['device_use_lock_intervals', 'device_use_session_overrides', 'device_use_policy_signals'];

  const acl = await db.query(`
    select c.relname, coalesce(r.rolname,'PUBLIC') grantee, a.privilege_type
      from pg_class c join pg_namespace n on n.oid=c.relnamespace
      cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
      left join pg_roles r on r.oid=a.grantee
     where n.nspname='public' and c.relname = any($1)
       and (a.grantee = 0 or r.rolname in ('anon','authenticated'))
     order by 1,2,3`, [TABLES]);

  // Đúng ba dòng: mỗi bảng cho authenticated đúng quyền SELECT, và không có gì
  // cho anon hay PUBLIC.
  assert.deepEqual(acl.rows, TABLES.map(relname =>
    ({ relname, grantee: 'authenticated', privilege_type: 'SELECT' })).sort((a, b) => a.relname.localeCompare(b.relname)));

  const rls = await db.query(`
    select c.relname, c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
     where n.nspname='public' and c.relname = any($1) order by 1`, [TABLES]);
  assert.ok(rls.rows.every(row => row.relrowsecurity), 'cả ba bảng phải bật RLS');
});

// ===========================================================================
// Sol RC4 — R-003, reproduced before anything was changed.
//
// FEAT-007 RB-711 freezes a school year: once it is `archived_read_only` (and,
// while an archive run is being built, `archiving`) ordinary business data must
// not be created or edited outside the archive/purge controls. FEAT-010 writes
// ordinary business data — intervals, overrides, audit rows, and, through
// recompute, `registrations.effective_uses_electronic_device` — and its only
// authorization check was `teacher_has_class()`, which answers a question about
// the class, not about the year.
//
// The existing FEAT-007 test in this file reads migration 12 and asks "does
// purge delete a table FEAT-010 references?". That is the deletion/FK dimension
// of §18, and it is the sixth time in this feature that one dimension of a
// contract has been presented as the contract. The write-freeze dimension was
// never tested, so it was never true.
// ===========================================================================

/** The frozen-year states, and the wording FEAT-007 gives each of them. */
const FROZEN = [
  ['archiving', 'đang đóng gói lưu trữ'],
  ['archived_read_only', 'đã lưu trữ, chỉ đọc'],
];

const setArchiveState = (db, value) =>
  db.query('update public.school_years set archive_state=$1 where id=$2', [value, ids.y]);

/**
 * Everything FEAT-010 owns, plus the two things it reaches into. A denied
 * mutation must leave all of it byte-identical — Sol RC4 §8.9 lists five
 * separate side effects and this catches all five at once, including any sixth
 * one added later.
 */
async function policyFootprint(db) {
  const q = async text => (await db.query(text)).rows;
  return {
    intervals: await q(`select class_id,weekday,period_number,locked_at,unlocked_at,locked_by,unlocked_by
                          from public.device_use_lock_intervals order by weekday,period_number,locked_at`),
    overrides: await q(`select class_id,week_id,weekday,period_number,mode,created_by,revoked_at,revoked_by
                          from public.device_use_session_overrides order by week_id,weekday,period_number`),
    signals:   await q(`select class_id,version from public.device_use_policy_signals order by class_id`),
    audit:     await q(`select action,entity_type,entity_id from public.audit_logs
                         where action like 'device\\_use%' order by created_at,action`),
    registrations: await q(`select id,uses_electronic_device,effective_uses_electronic_device
                              from public.registrations order by id`),
  };
}

/**
 * A class with real policy history — a standing lock and a live override — built
 * while the year is still `active`, then frozen. Freezing afterwards is the
 * point: the rows exist, so `unlock` and `revoke_allow` have something real to
 * act on and would succeed but for the guard.
 */
async function frozenYear(value) {
  const db = await createFixture();
  const locked = await register(db, ids.s, { week: 'next', weekday: 3, period: 3, device: true });
  const other = await register(db, ids.s, { week: 'later', weekday: 4, period: 4, device: true });
  await policy(db, ids.t, 'lock', { weekday: 3, period_number: 3 });
  await policy(db, ids.t, 'allow_session', { week_id: weeks.next, weekday: 3, period_number: 3 });
  // A second interval with no override hanging off it. The DELETE test needs
  // one: deleting an interval that *does* have an override cascades into the
  // overrides table, whose own guard then raises — so a guard missing on the
  // intervals table would be hidden by the cascade. Mutation M44 is exactly
  // that, and it escaped until this row existed.
  await policy(db, ids.t, 'lock', { weekday: 5, period_number: 5 });
  await setArchiveState(db, value);
  return { db, locked, other };
}

/** The four mutations, each aimed at something that would otherwise work. */
const WRITES = [
  ['lock', { weekday: 4, period_number: 4 }, 'khoá một slot chưa khoá'],
  ['unlock', { weekday: 3, period_number: 3 }, 'mở một slot đang khoá'],
  ['allow_session', { week_id: weeks.later, weekday: 3, period_number: 3 }, 'mở riêng một buổi tương lai đang khoá'],
  ['revoke_allow', { week_id: weeks.next, weekday: 3, period_number: 3 }, 'hủy một ngoại lệ đang có hiệu lực'],
];

for (const [value, label] of FROZEN) {
  test(`RC4-R-003 năm học ${value} (${label}): cả bốn thao tác ghi bị từ chối`, async () => {
    const { db } = await frozenYear(value);
    const before = await policyFootprint(db);

    for (const [action, payload, what] of WRITES) {
      const error = await rejects(policy(db, ids.t, action, payload), '42501',
        `${action} — ${what} — trong năm học ${value}`);
      // Not just "some 42501": a broken `teacher_has_class` would also raise
      // 42501 and this test would then pass for the wrong reason.
      assert.match(error.message, /DEVICE_POLICY_YEAR_NOT_ACTIVE/,
        `${action} bị từ chối, nhưng không phải vì năm học bị đóng băng — ${error.message}`);
    }

    // Hai nhánh không-ghi-gì, và chúng cần chốt chặn của riêng wrapper: `lock`
    // một slot đang khoá và `unlock` một slot đang mở trả về sớm mà không chạm
    // bảng nào (EC-010-001/002), nên trigger ở mục 5b không bao giờ chạy. Nếu
    // chỉ dựa vào trigger thì hai lệnh này *thành công* trong năm đã đóng băng
    // và "bị từ chối" biến thành "im lặng báo không có gì đổi".
    for (const [action, payload, what] of [
      ['lock', { weekday: 3, period_number: 3 }, 'khoá một slot đã khoá sẵn (no-op)'],
      ['unlock', { weekday: 4, period_number: 4 }, 'mở một slot vốn đang mở (no-op)'],
    ]) {
      const error = await rejects(policy(db, ids.t, action, payload), '42501',
        `${action} — ${what} — trong năm học ${value}`);
      assert.match(error.message, /DEVICE_POLICY_YEAR_NOT_ACTIVE/,
        `${action} (no-op) bị từ chối vì lý do khác — ${error.message}`);
    }

    // Sol RC4 §8.9 — no interval, no override, no signal bump, no audit row,
    // no recomputed registration.
    assert.deepEqual(await policyFootprint(db), before,
      `một thao tác bị từ chối vẫn để lại dấu vết trong năm học ${value}`);
    await assertNoDrift(db, `(năm học ${value})`);
  });
}

test('RC4-R-003 năm học active thì giáo viên vẫn khoá được — chốt chặn không chặn nhầm', async () => {
  // The positive control. A guard that denies everything also passes every test
  // above, so the thing that must keep working is asserted in the same breath.
  const db = await createFixture();
  const row = await register(db, ids.s, { week: 'next', weekday: 3, period: 3, device: true });
  const year = await db.query('select archive_state from public.school_years where id=$1', [ids.y]);
  assert.equal(year.rows[0].archive_state, 'active');

  const result = await policy(db, ids.t, 'lock', { weekday: 3, period_number: 3 });
  assert.equal(result.changed, true);
  assert.equal((await reg(db, row.id)).effective_uses_electronic_device, false);

  // And the freeze is not a one-way door: FEAT-007 can release a year back to
  // `active`, and when it does, Lock/Unlock work again.
  await setArchiveState(db, 'archived_read_only');
  await rejects(policy(db, ids.t, 'unlock', { weekday: 3, period_number: 3 }), '42501', 'mở khoá khi đã lưu trữ');
  await setArchiveState(db, 'active');
  assert.equal((await policy(db, ids.t, 'unlock', { weekday: 3, period_number: 3 })).changed, true);
  assert.equal((await reg(db, row.id)).effective_uses_electronic_device, true);
  await assertNoDrift(db);
});

test('RC4-R-003 đọc vẫn mở sau khi năm học đã lưu trữ', async () => {
  // A frozen year must still be *readable*. Blocking the writes by making the
  // whole RPC refuse would be the cheap fix and would take the student's
  // explanation of why the box is locked down with it.
  const { db } = await frozenYear('archived_read_only');

  for (const actor of [ids.t, ids.s, ids.m, ids.a]) {
    const rows = await policy(db, actor, 'state', { week_id: weeks.next });
    assert.ok(Array.isArray(rows) && rows.length > 0, `state trống với ${actor}`);
    const slot = rows.find(r => r.weekday === 3 && r.period_number === 3);
    assert.equal(slot.state, 'allow_override', `state sai với ${actor} trong năm học đã lưu trữ`);
  }

  for (const actor of [ids.t, ids.a]) {
    const history = await policy(db, actor, 'history');
    assert.equal(history.intervals.length, 2, `history thiếu khoảng khoá với ${actor}`);
    assert.equal(history.overrides.length, 1, `history thiếu ngoại lệ với ${actor}`);
  }

  // …and the read permissions themselves do not change when the year freezes.
  await rejects(policy(db, ids.s, 'history'), '42501', 'học sinh vẫn không xem được lịch sử');
});

// ===========================================================================
// Sol RC5 — R-004 and R-005, reproduced before anything was changed.
//
// R-003's guard lives in `device_use_policy()`. That is the door the Teacher
// walks through, and it is now locked — but it is not the only door, and it is
// not locked at the same instant FEAT-007 turns the key.
//
// R-004: `service_role` has `grant all` on both policy tables and BYPASSRLS, so
//        a direct INSERT/UPDATE/DELETE never passes the wrapper at all. This
//        file's own `asService()` helper did exactly that in a dozen places.
//        Since Sol RC6 R-007 that grant is gone, so these tests write as the
//        **database owner** instead — the one writer no grant can stop, and
//        therefore the one that proves the trigger is a freeze and not a
//        permission.
// R-005: the wrapper reads `archive_state` without locking the `school_years`
//        row, so FEAT-007's `update school_years set archive_state='archiving'`
//        can commit between the read and the write.
// ===========================================================================

/** A second, still-active school year with a class of its own. */
const ids2 = { y: '00000000-0000-0000-0000-0000000000d0', c: '00000000-0000-0000-0000-0000000000d1' };

async function seedSecondYear(db) {
  await db.query(
    `insert into public.school_years(id,name,start_date,end_date,is_active)
       values($1,'2027-2028',current_date - 10, current_date + 300, false)`, [ids2.y]);
  await db.query(
    `insert into public.classes(id,school_year_id,code,name,grade) values($1,$2,'8A1','8A1',8)`,
    [ids2.c, ids2.y]);
  await db.query(`insert into public.class_teachers(class_id,teacher_id) values($1,$2)`, [ids2.c, ids.t]);
}

/** An interval written straight at the table, bypassing the RPC entirely. */
const ownerInsertInterval = (db, classId, weekday = 4, period = 4) => asOwner(db, () => db.query(
  `insert into public.device_use_lock_intervals(class_id,weekday,period_number,locked_at)
   values($1,$2,$3,now()) returning id`, [classId, weekday, period]));

test('RC5-R-004 không ai ghi thẳng được vào bảng policy khi năm học đã đóng băng — kể cả chủ sở hữu database', async () => {
  for (const [value] of FROZEN) {
    const { db } = await frozenYear(value);
    const interval = (await db.query(
      `select id from public.device_use_lock_intervals
        where class_id=$1 and weekday=3 and period_number=3`, [ids.c])).rows[0].id;
    // The one with nothing depending on it — see `frozenYear`.
    const lone = (await db.query(
      `select id from public.device_use_lock_intervals
        where class_id=$1 and weekday=5 and period_number=5`, [ids.c])).rows[0].id;
    const override = (await db.query(
      'select id, interval_id from public.device_use_session_overrides where class_id=$1', [ids.c])).rows[0];
    const before = await policyFootprint(db);

    // 1–3 of Sol RC5 §7, plus DELETE: RB-711 forbids creating, editing *and*
    // deleting ordinary business data in a frozen year.
    const attempts = [
      ['INSERT khoảng khoá', () => ownerInsertInterval(db, ids.c)],
      ['UPDATE khoảng khoá', () => asOwner(db, () => db.query(
        'update public.device_use_lock_intervals set unlocked_at=now() where id=$1', [interval]))],
      ['DELETE khoảng khoá', () => asOwner(db, () => db.query(
        'delete from public.device_use_lock_intervals where id=$1', [lone]))],
      ['INSERT ngoại lệ', () => asOwner(db, () => db.query(
        `insert into public.device_use_session_overrides(interval_id,class_id,week_id,weekday,period_number,mode)
         values($1,$2,$3,3,3,'allow')`, [override.interval_id, ids.c, weeks.later]))],
      ['UPDATE ngoại lệ', () => asOwner(db, () => db.query(
        'update public.device_use_session_overrides set revoked_at=now() where id=$1', [override.id]))],
      ['DELETE ngoại lệ', () => asOwner(db, () => db.query(
        'delete from public.device_use_session_overrides where id=$1', [override.id]))],
    ];
    for (const [what, run] of attempts) {
      const error = await rejects(run(), '42501', `${what} ghi thẳng trong năm học ${value}`);
      assert.match(error.message, /DEVICE_POLICY_YEAR_NOT_ACTIVE/,
        `${what} bị từ chối vì lý do khác — ${error.message}`);
    }

    assert.deepEqual(await policyFootprint(db), before,
      `một lần ghi thẳng bị từ chối vẫn để lại dấu vết trong năm học ${value}`);
    await assertNoDrift(db, `(ghi thẳng, năm học ${value})`);
  }
});

test('RC5-R-004 đổi chủ sở hữu bị kiểm ở cả lớp cũ lẫn lớp mới', async () => {
  // Sol RC5 §7.4. A guard that only reads NEW lets a row be carried *out* of a
  // frozen year; one that only reads OLD lets a row be carried *into* one.
  const { db } = await frozenYear('archived_read_only');
  await seedSecondYear(db);
  const frozenInterval = (await db.query(
    'select id from public.device_use_lock_intervals where class_id=$1', [ids.c])).rows[0].id;
  const liveInterval = (await ownerInsertInterval(db, ids2.c)).rows[0].id;

  const out = await rejects(asOwner(db, () => db.query(
    'update public.device_use_lock_intervals set class_id=$1 where id=$2', [ids2.c, frozenInterval])),
    '42501', 'chuyển một dòng RA KHỎI năm học đã đóng băng');
  assert.match(out.message, /DEVICE_POLICY_YEAR_NOT_ACTIVE/);

  const into = await rejects(asOwner(db, () => db.query(
    'update public.device_use_lock_intervals set class_id=$1 where id=$2', [ids.c, liveInterval])),
    '42501', 'chuyển một dòng VÀO năm học đã đóng băng');
  assert.match(into.message, /DEVICE_POLICY_YEAR_NOT_ACTIVE/);

  const still = await db.query('select class_id from public.device_use_lock_intervals where id=any($1)',
    [[frozenInterval, liveInterval]]);
  assert.deepEqual(still.rows.map(r => r.class_id).sort(), [ids.c, ids2.c].sort());
});

test('RC5-R-004 năm học còn active thì đường ghi thẳng vẫn chạy, và chốt chặn không tắt được', async () => {
  // Sol RC5 §7.5. The guard must not turn a privileged write into a dead end
  // for a year that is still open — a dozen tests in this file seed policy rows
  // exactly that way (as the owner, since Sol RC6 R-007 took `service_role`'s
  // DML away).
  const db = await createFixture();
  await seedSecondYear(db);
  const live = await ownerInsertInterval(db, ids.c);
  assert.ok(live.rows[0].id, 'năm học active: đường ghi thẳng vẫn chạy');
  await asOwner(db, () => db.query(
    'update public.device_use_lock_intervals set unlocked_at=now() where id=$1', [live.rows[0].id]));
  await asOwner(db, () => db.query(
    'delete from public.device_use_lock_intervals where id=$1', [live.rows[0].id]));

  // And the guard is not something the application's server role can switch
  // off: disabling a trigger needs table ownership, which `service_role` does
  // not have — on top of no longer having DML at all (R-007).
  for (const table of ['device_use_lock_intervals', 'device_use_session_overrides']) {
    await rejects(asService(db, () => db.query(
      `alter table public.${table} disable trigger all`)), '42501',
      `service_role tắt được chốt chặn trên ${table}`);
  }
  await assertNoDrift(db);
});

test('RC5-R-005 thao tác policy phải khoá dòng năm học, không chỉ đọc nó', async () => {
  // Sol RC5 §6. The check and the write have to be on the same side of
  // FEAT-007's `update school_years set archive_state='archiving'`, and a plain
  // read does not conflict with that UPDATE's FOR NO KEY UPDATE row lock.
  const db = await createFixture();

  await db.exec('begin');
  await db.exec(`set local role authenticated; set local request.jwt.claim.sub='${ids.t}'`);
  await db.query(`select public.device_use_policy('lock',$1::jsonb)`,
    [JSON.stringify({ class_id: ids.c, weekday: 3, period_number: 3 })]);
  const held = await db.query(
    `select mode from pg_locks where locktype='relation' and relation='public.school_years'::regclass`);
  await db.exec('commit');

  assert.ok(held.rows.some(r => r.mode === 'RowShareLock'),
    `thao tác policy phải giữ khoá dòng trên school_years; pg_locks chỉ thấy ${JSON.stringify(held.rows.map(r => r.mode))}`);

  // pg_locks records `RowShareLock` on the table for FOR SHARE, FOR KEY SHARE
  // and FOR UPDATE alike, so the mode itself is asserted from the source — and
  // the mode is the whole point. FOR KEY SHARE conflicts only with FOR UPDATE;
  // FEAT-007's `update … set archive_state='archiving'` takes FOR NO KEY
  // UPDATE, which FOR KEY SHARE does **not** block. FOR SHARE does.
  const code = (await migrationSql()).split('\n').filter(line => !line.trim().startsWith('--')).join('\n');
  assert.match(code, /for share of y/, 'chốt chặn phải khoá dòng school_years bằng FOR SHARE');
  assert.doesNotMatch(code, /for key share/,
    'FOR KEY SHARE không xung đột với FOR NO KEY UPDATE của archive_begin — nó không chặn được gì');
});

// ===========================================================================
// Sol RC6 — R-006 and R-007, reproduced before anything was changed.
//
// R-006: an override carries **two** owners. `interval_id` says which lock
//        cycle it is an exception to; `class_id`, `weekday` and `period_number`
//        say which slot it belongs to. Nothing made them agree. The freeze
//        guard reads one of them, `device_use_policy_state()` follows the
//        other, so a privileged write can show the guard an active class while
//        pointing policy evaluation at a frozen interval. Same shape as the
//        mixed-owner resolver defect FEAT-007 already had.
// R-007: `service_role` keeps `grant all` on the two policy tables, but a raw
//        INSERT is not a Device Policy change: no recompute, no signal, no
//        audit. A second mutation API with weaker invariants is not a feature.
// ===========================================================================

/** Lock a slot for a class, through the RPC, as that class's teacher. */
async function lockSlot(db, classId, weekday, period) {
  return as(db, ids.t, async () => (await db.query(
    'select public.device_use_policy($1,$2::jsonb) r',
    ['lock', JSON.stringify({ class_id: classId, weekday, period_number: period })])).rows[0].r);
}

test('RC6-R-006 override không thể trỏ tới khoảng khoá của một lớp khác', async () => {
  // The bypass Sol describes: interval of the frozen class, class_id of the
  // active one. The freeze guard reads `class_id` and waves it through.
  const db = await createFixture();
  await seedSecondYear(db);
  const frozenInterval = (await lockSlot(db, ids.c, 3, 3)).interval_id;
  const liveInterval = (await lockSlot(db, ids2.c, 3, 3)).interval_id;
  await setArchiveState(db, 'archiving');

  const mixed = await fails(asOwner(db, () => db.query(
    `insert into public.device_use_session_overrides(interval_id,class_id,week_id,weekday,period_number,mode)
     values($1,$2,$3,3,3,'allow')`, [frozenInterval, ids2.c, weeks.next])));
  assert.ok(mixed, 'override gắn khoảng khoá của lớp đã đóng băng vào class_id của lớp còn mở phải bị từ chối');

  // And the mirror: an override that is legitimate today, re-parented to an
  // interval of another class by changing only `interval_id`. Both the old and
  // the new `class_id` are the same active class, so a guard that reads only
  // `class_id` sees nothing to object to.
  await setArchiveState(db, 'active');
  const ok = await as(db, ids.t, async () => (await db.query(
    'select public.device_use_policy($1,$2::jsonb) r',
    ['allow_session', JSON.stringify({ class_id: ids.c, week_id: weeks.next, weekday: 3, period_number: 3 })])).rows[0].r);
  assert.equal(ok.changed, true);

  const reparented = await fails(asOwner(db, () => db.query(
    'update public.device_use_session_overrides set interval_id=$1 where id=$2', [liveInterval, ok.override_id])));
  assert.ok(reparented, 'đổi riêng interval_id sang khoảng khoá của lớp khác phải bị từ chối');

  const kept = await db.query(
    'select interval_id from public.device_use_session_overrides where id=$1', [ok.override_id]);
  assert.equal(kept.rows[0].interval_id, (await db.query(
    `select id from public.device_use_lock_intervals
      where class_id=$1 and weekday=3 and period_number=3`, [ids.c])).rows[0].id);
});

test('RC6-R-006 override phải cùng buổi với khoảng khoá nó là ngoại lệ', async () => {
  // The slot is the other half of the ownership. An override for Wednesday
  // period 3 hanging off an interval that locks Thursday period 4 is not an
  // exception to anything — and `device_use_policy_state()` would still find it
  // through `interval_id`.
  const db = await createFixture();
  const interval = (await lockSlot(db, ids.c, 3, 3)).interval_id;

  for (const [wd, pn, what] of [[4, 3, 'khác thứ'], [3, 4, 'khác tiết'], [4, 4, 'khác cả hai']]) {
    const error = await fails(asOwner(db, () => db.query(
      `insert into public.device_use_session_overrides(interval_id,class_id,week_id,weekday,period_number,mode)
       values($1,$2,$3,$4,$5,'allow')`, [interval, ids.c, weeks.next, wd, pn])));
    assert.ok(error, `override ${what} với khoảng khoá của nó phải bị từ chối`);
  }
});

test('RC6-R-006 override phải thuộc một tuần của chính năm học đó', async () => {
  // Sol RC6 §6, Option A's second half. The canonical rule already exists and
  // `registrations` has enforced it since V8.8.0: a class and a week belong
  // together only when they share a school year. The two paths are asserted to
  // agree, because two places knowing one rule is only safe while they do.
  const db = await createFixture();
  await seedSecondYear(db);
  const foreignWeek = '00000000-0000-0000-0000-0000000000d2';
  await db.query(
    `insert into public.weeks(id,school_year_id,week_number,start_date,end_date)
       values($1,$2,1,current_date + 7, current_date + 13)`, [foreignWeek, ids2.y]);
  const interval = (await lockSlot(db, ids.c, 3, 3)).interval_id;

  const override = await fails(asOwner(db, () => db.query(
    `insert into public.device_use_session_overrides(interval_id,class_id,week_id,weekday,period_number,mode)
     values($1,$2,$3,3,3,'allow')`, [interval, ids.c, foreignWeek])));
  assert.ok(override, 'override dùng tuần của năm học khác phải bị từ chối');

  // The same mismatched pair, through the path that has always rejected it.
  const registration = await fails(asOwner(db, () => db.query(
    `insert into public.registrations(student_id,class_id,week_id,weekday,period_number,content,status)
     values($1,$2,$3,3,3,'Ôn tập','submitted')`, [ids.s, ids.c, foreignWeek])));
  assert.ok(registration, 'hồi quy: đăng ký dùng tuần của năm học khác vẫn bị từ chối');
  assert.match(registration.message, /REGISTRATION_CLASS_WEEK_MISMATCH/);
});

test('RC6-R-007 service_role không còn ghi thẳng vào bảng policy, kể cả năm học còn active', async () => {
  // Sol RC6 §7. A raw INSERT runs the freeze trigger and nothing else: no
  // `device_use_recompute`, no signal bump, no audit row. It looks like a
  // Device Policy change and is not one, so the grant that allows it is the
  // thing to remove.
  const db = await createFixture();
  const interval = (await lockSlot(db, ids.c, 3, 3)).interval_id;
  const override = await as(db, ids.t, async () => (await db.query(
    'select public.device_use_policy($1,$2::jsonb) r',
    ['allow_session', JSON.stringify({ class_id: ids.c, week_id: weeks.next, weekday: 3, period_number: 3 })])).rows[0].r);

  const denied = [
    ['INSERT khoảng khoá', `insert into public.device_use_lock_intervals(class_id,weekday,period_number,locked_at)
                            values('${ids.c}',4,4,now())`],
    ['UPDATE khoảng khoá', `update public.device_use_lock_intervals set unlocked_at=now() where id='${interval}'`],
    ['DELETE khoảng khoá', `delete from public.device_use_lock_intervals where id='${interval}'`],
    ['INSERT ngoại lệ', `insert into public.device_use_session_overrides(interval_id,class_id,week_id,weekday,period_number,mode)
                         values('${interval}','${ids.c}','${weeks.later}',3,3,'allow')`],
    ['UPDATE ngoại lệ', `update public.device_use_session_overrides set revoked_at=now() where id='${override.override_id}'`],
    ['DELETE ngoại lệ', `delete from public.device_use_session_overrides where id='${override.override_id}'`],
    ['INSERT tín hiệu', `insert into public.device_use_policy_signals(class_id) values('${ids.c2}')`],
    ['UPDATE tín hiệu', `update public.device_use_policy_signals set version=version+99 where class_id='${ids.c}'`],
  ];
  for (const [what, sql] of denied) {
    await rejects(asService(db, () => db.query(sql)), '42501',
      `${what} bằng service_role trong năm học còn active`);
  }

  // Reading stays open: a server component may still need to look.
  const seen = await asService(db, () => db.query(
    'select count(*)::int n from public.device_use_lock_intervals'));
  assert.equal(seen.rows[0].n, 1, 'service_role vẫn đọc được bảng policy');

  // And the RPC — which is security definer, so it does not need the grant —
  // still works for the teacher.
  assert.equal((await policy(db, ids.t, 'unlock', { weekday: 3, period_number: 3 })).changed, true);
  await assertNoDrift(db);
});

// ===========================================================================
// Sol RC7 — R-008, reproduced before anything was changed.
//
// RC1 P1 scoped the live-override unique index by `interval_id`, on purpose: an
// ALLOW belongs to one lock cycle and must not revive under the next one. The
// consequence, also on purpose, is that two *unrevoked* override rows can exist
// for the same class/week/slot — one per cycle — because unlocking a recurring
// interval does not retroactively revoke the ALLOW it carried.
//
// `device_use_policy_state()` handles that: it resolves the governing interval
// first. The manager branch of `device_use_policy('state')` did not — it looked
// the override up by class + week + slot. With two rows that scalar subquery
// raises `more than one row returned by a subquery used as an expression`, and
// the Teacher and Admin pages stop loading state after a lifecycle the feature
// explicitly supports.
//
// Two rules that must be the same rule, written in two places. The fix is not
// to write the second place more carefully.
// ===========================================================================

/** `Lock A → ALLOW → Unlock A → Lock B`, the lifecycle RC2 made valid. */
async function twoLockCycles(db, { allowUnderB = false } = {}) {
  const a = await policy(db, ids.t, 'lock', { weekday: 3, period_number: 3 });
  const first = await policy(db, ids.t, 'allow_session',
    { week_id: weeks.next, weekday: 3, period_number: 3 });
  await policy(db, ids.t, 'unlock', { weekday: 3, period_number: 3 });
  const b = await policy(db, ids.t, 'lock', { weekday: 3, period_number: 3 });
  const second = allowUnderB
    ? await policy(db, ids.t, 'allow_session', { week_id: weeks.next, weekday: 3, period_number: 3 })
    : null;
  return { a, b, first, second };
}

const slot33 = rows => rows.find(r => r.weekday === 3 && r.period_number === 3);

test('RC7-R-008 sau Lock A → ALLOW → Unlock A → Lock B, state của người quản lý vẫn đọc được', async () => {
  const db = await createFixture();
  const row = await register(db, ids.s, { week: 'next', weekday: 3, period: 3, device: true });
  const { first } = await twoLockCycles(db);

  for (const actor of [ids.t, ids.a]) {
    const slot = slot33(await policy(db, actor, 'state', { week_id: weeks.next }));
    assert.equal(slot.state, 'locked', `${actor}: ngoại lệ của chu kỳ cũ không được sống lại`);
    assert.equal(slot.override_id, null,
      `${actor}: override_id phải là null — ngoại lệ đang unrevoked kia thuộc chu kỳ khoá đã đóng`);
  }

  // The old row is still there: Unlock does not rewrite history (DEC-104/§9.2).
  const kept = await db.query(
    'select revoked_at from public.device_use_session_overrides where id=$1', [first.override_id]);
  assert.equal(kept.rows[0].revoked_at, null);
  assert.equal((await reg(db, row.id)).effective_uses_electronic_device, false);
  await assertNoDrift(db);
});

test('RC7-R-008 và sau khi ALLOW lại dưới Lock B, state trả đúng ngoại lệ của chu kỳ đang chạy', async () => {
  const db = await createFixture();
  const row = await register(db, ids.s, { week: 'next', weekday: 3, period: 3, device: true });
  const { first, second } = await twoLockCycles(db, { allowUnderB: true });
  assert.notEqual(first.override_id, second.override_id);

  for (const actor of [ids.t, ids.a]) {
    const slot = slot33(await policy(db, actor, 'state', { week_id: weeks.next }));
    assert.equal(slot.state, 'allow_override', `${actor}: buổi này đang được mở riêng`);
    assert.equal(slot.override_id, second.override_id,
      `${actor}: override_id phải là ngoại lệ của chu kỳ B, không phải của A`);
  }

  // Both rows survive — the history of two cycles, not one row overwritten.
  const both = await db.query(
    `select id, interval_id, revoked_at from public.device_use_session_overrides
      where class_id=$1 and week_id=$2 order by created_at`, [ids.c, weeks.next]);
  assert.equal(both.rows.length, 2);
  assert.ok(both.rows.every(r => r.revoked_at === null));
  assert.notEqual(both.rows[0].interval_id, both.rows[1].interval_id);

  assert.equal((await reg(db, row.id)).effective_uses_electronic_device, true);
  await assertNoDrift(db);
});

test('RC7-R-008 state của học sinh không đổi, và vẫn không mang override_id', async () => {
  const db = await createFixture();
  await twoLockCycles(db, { allowUnderB: true });

  for (const actor of [ids.s, ids.m]) {
    const rows = await policy(db, actor, 'state', { week_id: weeks.next });
    const slot = slot33(rows);
    assert.equal(slot.state, 'allow_override');
    assert.deepEqual(Object.keys(slot).sort(), ['period_number', 'session_start', 'state', 'weekday'],
      `${actor}: bản cho học sinh chỉ có bốn khoá, không có override_id`);
  }
});

test('RC7-R-008 mở riêng → hủy → mở riêng lại trong cùng một chu kỳ vẫn trả đúng một ngoại lệ', async () => {
  // The other way two override rows can exist for one session: revoke and
  // re-create inside the *same* interval. The live-override unique index allows
  // it (it only constrains unrevoked rows), so the lookup that replaces the
  // buggy one has to stay single-valued here too.
  const db = await createFixture();
  await policy(db, ids.t, 'lock', { weekday: 3, period_number: 3 });
  const dropped = await policy(db, ids.t, 'allow_session', { week_id: weeks.next, weekday: 3, period_number: 3 });
  await policy(db, ids.t, 'revoke_allow', { week_id: weeks.next, weekday: 3, period_number: 3 });
  const live = await policy(db, ids.t, 'allow_session', { week_id: weeks.next, weekday: 3, period_number: 3 });
  assert.notEqual(dropped.override_id, live.override_id);

  const slot = slot33(await policy(db, ids.t, 'state', { week_id: weeks.next }));
  assert.equal(slot.state, 'allow_override');
  assert.equal(slot.override_id, live.override_id);
  assert.equal((await db.query(
    `select count(*)::int n from public.device_use_session_overrides
      where class_id=$1 and week_id=$2`, [ids.c, weeks.next])).rows[0].n, 2);
  await assertNoDrift(db);
});

// ===========================================================================
// RC9 — R-009 / R-010: parent class lifecycle + two-sided year freeze.
//
// Sol's RC8 review found that RC8's child DELETE trigger re-resolved a parent
// class that was itself being deleted, so the FK cascade could fail after
// FEAT-004 had already declared the class deletable. The first RC9 patch fixed
// that DELETE path but accidentally regressed RC6's UPDATE invariant by
// checking only NEW.class_id. Migration 14 must do both things at once.
// ===========================================================================

const RC9_IDS = {
  empty:  '00000000-0000-0000-0000-0000000000d1',
  hist:   '00000000-0000-0000-0000-0000000000d2',
  activeA:'00000000-0000-0000-0000-0000000000d3',
  activeB:'00000000-0000-0000-0000-0000000000d4',
  frozenY:'00000000-0000-0000-0000-0000000000d5',
  frozenC:'00000000-0000-0000-0000-0000000000d6',
};

async function rc9Class(db, classId, { yearId = ids.y, code = 'RC9' } = {}) {
  await db.query(`insert into public.classes(id,school_year_id,code,name,grade)
                  values($1,$2,$3,$3,7)`, [classId, yearId, code]);
  // These are structural rows the real Admin create-class path owns. They all
  // cascade from classes and therefore must not turn an otherwise-empty class
  // into a delete blocker.
  await db.query('insert into public.class_settings(class_id) values($1)', [classId]);
  if (yearId === ids.y) {
    await db.query(`insert into public.class_weeks(class_id,week_id,status,manual_status)
                    select $1,id,'open'::public.week_status,'open'::public.week_status
                      from public.weeks where school_year_id=$2`, [classId, yearId]);
    await db.query(`insert into public.study_schedule(class_id,weekday,period_number)
                    values($1,3,3)`, [classId]);
  }
}

async function rc9Interval(db, classId, { weekday = 3, period = 3 } = {}) {
  return (await db.query(
    `insert into public.device_use_lock_intervals(class_id,weekday,period_number,locked_at)
     values($1,$2,$3,now()-interval '1 hour') returning id`, [classId, weekday, period])).rows[0].id;
}

test('RC9-R-009 active-year empty class vẫn xóa như trước FEAT-010', async () => {
  const db = await createFixture();
  await rc9Class(db, RC9_IDS.empty, { code: 'R9E' });

  const result = await db.query('delete from public.classes where id=$1 returning id', [RC9_IDS.empty]);
  assert.equal(result.rows[0].id, RC9_IDS.empty);
  assert.equal((await db.query('select count(*)::int n from public.classes where id=$1', [RC9_IDS.empty])).rows[0].n, 0);
});

test('RC9-R-009 active-year class có interval + override + signal vẫn parent-delete cascade sạch', async () => {
  const db = await createFixture();
  await rc9Class(db, RC9_IDS.hist, { code: 'R9H' });
  const interval = await rc9Interval(db, RC9_IDS.hist);
  await db.query(
    `insert into public.device_use_session_overrides(interval_id,class_id,week_id,weekday,period_number,mode)
     values($1,$2,$3,3,3,'allow')`, [interval, RC9_IDS.hist, weeks.next]);
  await db.query('insert into public.device_use_policy_signals(class_id,version) values($1,7)', [RC9_IDS.hist]);

  const before = await db.query(`select
    (select count(*)::int from public.device_use_lock_intervals where class_id=$1) intervals,
    (select count(*)::int from public.device_use_session_overrides where class_id=$1) overrides,
    (select count(*)::int from public.device_use_policy_signals where class_id=$1) signals`, [RC9_IDS.hist]);
  assert.deepEqual(before.rows[0], { intervals: 1, overrides: 1, signals: 1 });

  const deleted = await db.query('delete from public.classes where id=$1 returning id', [RC9_IDS.hist]);
  assert.equal(deleted.rows[0].id, RC9_IDS.hist,
    'parent class DELETE phải thành công; child freeze trigger không được tự biến thành class lifecycle owner');

  const after = await db.query(`select
    (select count(*)::int from public.device_use_lock_intervals where class_id=$1) intervals,
    (select count(*)::int from public.device_use_session_overrides where class_id=$1) overrides,
    (select count(*)::int from public.device_use_policy_signals where class_id=$1) signals`, [RC9_IDS.hist]);
  assert.deepEqual(after.rows[0], { intervals: 0, overrides: 0, signals: 0 },
    'interval/override/signal phải cùng biến mất với class qua FK cascade');
});

test('RC9-R-009 direct child DELETE trong frozen year vẫn bị chặn', async () => {
  const db = await createFixture();
  const interval = await rc9Interval(db, ids.c, { weekday: 5, period: 5 });
  await setArchiveState(db, 'archived_read_only');

  const error = await rejects(db.query('delete from public.device_use_lock_intervals where id=$1', [interval]),
    '42501', 'direct child DELETE trong frozen year');
  assert.match(error.message, /DEVICE_POLICY_YEAR_NOT_ACTIVE/);
  assert.equal((await db.query('select count(*)::int n from public.device_use_lock_intervals where id=$1', [interval])).rows[0].n, 1);
});

test('RC9-R-010 frozen OLD → active NEW UPDATE bị chặn bởi OLD-side guard', async () => {
  const db = await createFixture();
  await db.query(`insert into public.school_years(id,name,start_date,end_date,is_active,archive_state)
                  values($1,'RC9 frozen','2025-01-01','2025-12-31',false,'active')`, [RC9_IDS.frozenY]);
  await rc9Class(db, RC9_IDS.frozenC, { yearId: RC9_IDS.frozenY, code: 'R9F' });
  await rc9Class(db, RC9_IDS.activeA, { code: 'R9A' });
  const interval = await rc9Interval(db, RC9_IDS.frozenC);
  await db.query(`update public.school_years set archive_state='archived_read_only' where id=$1`, [RC9_IDS.frozenY]);

  const error = await rejects(db.query('update public.device_use_lock_intervals set class_id=$1 where id=$2',
    [RC9_IDS.activeA, interval]), '42501', 'frozen OLD → active NEW');
  assert.match(error.message, /DEVICE_POLICY_YEAR_NOT_ACTIVE/);
  assert.equal((await db.query('select class_id from public.device_use_lock_intervals where id=$1', [interval])).rows[0].class_id,
    RC9_IDS.frozenC);
});

test('RC9-R-010 active OLD → frozen NEW UPDATE bị chặn bởi NEW-side guard', async () => {
  const db = await createFixture();
  await db.query(`insert into public.school_years(id,name,start_date,end_date,is_active,archive_state)
                  values($1,'RC9 frozen','2025-01-01','2025-12-31',false,'archived_read_only')`, [RC9_IDS.frozenY]);
  await rc9Class(db, RC9_IDS.frozenC, { yearId: RC9_IDS.frozenY, code: 'R9F' });
  await rc9Class(db, RC9_IDS.activeA, { code: 'R9A' });
  const interval = await rc9Interval(db, RC9_IDS.activeA);

  const error = await rejects(db.query('update public.device_use_lock_intervals set class_id=$1 where id=$2',
    [RC9_IDS.frozenC, interval]), '42501', 'active OLD → frozen NEW');
  assert.match(error.message, /DEVICE_POLICY_YEAR_NOT_ACTIVE/);
  assert.equal((await db.query('select class_id from public.device_use_lock_intervals where id=$1', [interval])).rows[0].class_id,
    RC9_IDS.activeA);
});

test('RC9-R-010 active OLD → active NEW UPDATE vẫn hợp lệ ở maintenance path', async () => {
  const db = await createFixture();
  await rc9Class(db, RC9_IDS.activeA, { code: 'R9A' });
  await rc9Class(db, RC9_IDS.activeB, { code: 'R9B' });
  const interval = await rc9Interval(db, RC9_IDS.activeA);

  const moved = await db.query('update public.device_use_lock_intervals set class_id=$1 where id=$2 returning class_id',
    [RC9_IDS.activeB, interval]);
  assert.equal(moved.rows[0].class_id, RC9_IDS.activeB);
});

test('RC9-R-009 archived-year parent class DELETE vẫn do FEAT-007 chặn trước child cascade', async () => {
  // This is deliberately a combined FEAT-007 + FEAT-010 database, not a text
  // assertion. The error must come from FEAT-007's class trigger while a real
  // FEAT-010 child row exists underneath the class.
  const db = await archiveSetup();
  await addArchiveDeviceDependencies(db);
  await db.exec(await migrationSql());
  const period = (await db.query('select period_number from public.periods order by period_number limit 1')).rows[0].period_number;
  await db.query(`insert into public.device_use_lock_intervals(class_id,weekday,period_number,locked_at)
                  values($1,1,$2,now()-interval '1 hour')`, [archiveClassId, period]);
  await db.query(`update public.school_years set archive_state='archived_read_only' where id=$1`, [archiveIds.y]);

  const error = await rejects(db.query('delete from public.classes where id=$1', [archiveClassId]),
    '42501', 'FEAT-007 phải sở hữu quyết định xóa class frozen');
  assert.match(error.message, /Năm học đã đóng gói nên không xoá được lớp/,
    'phải bị chặn bởi archive_guard_class của FEAT-007, không phải child trigger FEAT-010');
  assert.equal((await db.query('select count(*)::int n from public.classes where id=$1', [archiveClassId])).rows[0].n, 1);
  assert.equal((await db.query('select count(*)::int n from public.device_use_lock_intervals where class_id=$1', [archiveClassId])).rows[0].n, 1);
});

