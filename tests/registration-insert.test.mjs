import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createFixture, ids, weeks, as, asService, reg, policy } from './feat-010/fixture.mjs';
import { resolveReviewOutcome } from '../supabase/functions/ai-review-registration/review-logic.js';

// Real registration schema, constraints, RLS, deadlines, notification/feedback
// triggers and FEAT-010 RC9 device locking. No authorization/deadline stubs.
// Omitting the patch is intentional: it proves the same exploit fails red.
async function fixture(t, { patch = true } = {}) {
  const db = await createFixture();
  t.after(() => db.close());
  // Install the exact registration statement-side-effect DDL from the shipped
  // storage migration, without inventing a storage measurement dependency.
  const storage = await readFile(new URL('../database/upgrade/17-STORAGE-CHANGE-SIGNALS.sql', import.meta.url), 'utf8');
  await db.exec('create schema storage_live_private');
  await db.exec(storage.match(/create table if not exists public\.storage_change_signals[\s\S]*?\n\);/)[0]);
  await db.exec(storage.match(/create or replace function storage_live_private\.emit_signal\(\)[\s\S]*?end \$\$;/)[0]);
  await db.exec('revoke all on function storage_live_private.emit_signal() from public,anon,authenticated; create trigger storage_change_signal after insert or delete or update or truncate on public.registrations for each statement execute function storage_live_private.emit_signal()');
  if (patch && process.env.SEC_REGISTRATION_BASELINE !== '1') await migrate(db);
  return db;
}
async function migrate(db) {
  const dir = new URL('../supabase/migrations/', import.meta.url);
  const files = (await readdir(dir)).filter(x => x.endsWith('_sec_registration_insert_001.sql'));
  assert.equal(files.length, 1, 'exactly one forward migration');
  await db.exec(await readFile(new URL(files[0], dir), 'utf8'));
}
const forged = {
  teacher_comment: 'FORGED_TEACHER_GUIDANCE', ai_review_count: 999,
  approval_source: 'ai', approved_by: ids.t, approved_at: '2026-01-01T00:00:00Z',
  ai_review_status: 'completed', ai_decision: 'auto_approve', ai_category: 'FORGED',
  ai_confidence: 0.99, ai_revision_status: 'satisfied', ai_revision_confidence: 0.98,
  ai_reason: 'FORGED', ai_model: 'FORGED', ai_reviewed_at: '2026-01-01T00:00:00Z',
  auto_review_reason: 'FORGED', revision_overdue_at: '2026-01-01T00:00:00Z',
  device_detection_source: 'ai', device_detection_confidence: 0.99,
  effective_uses_electronic_device: true,
};
const empty = {
  teacher_comment: null, ai_review_count: 0, approval_source: 'manual',
  approved_by: null, approved_at: null, ai_decision: null, ai_category: null,
  ai_confidence: null, ai_revision_status: null, ai_revision_confidence: null,
  ai_reason: null, ai_model: null, ai_reviewed_at: null, revision_overdue_at: null,
  device_detection_source: 'none', device_detection_confidence: null,
};
async function insert(db, user, payload = {}) {
  const values = { student_id: user, week_id: weeks.next, weekday: 1, period_number: 1,
    content: 'Ôn tập chương 1', status: 'submitted', ...payload };
  return as(db, user, async () => (await db.query(
    `insert into registrations (${Object.keys(values).join(',')}) values (${Object.keys(values).map((_, i) => `$${i+1}`).join(',')}) returning *`,
    Object.values(values))).rows[0]);
}
function canonical(row, { draft = false, enabled = true, device = false } = {}) {
  for (const [key, value] of Object.entries(empty)) assert.equal(row[key], value, key);
  assert.equal(row.status, draft ? 'draft' : 'submitted');
  assert.equal(row.ai_review_status, draft || !enabled ? 'not_needed' : 'pending');
  assert.equal(row.auto_review_reason, draft ? null : enabled ? 'Groq AI kiểm tra đăng ký mới.' : 'AI đang tắt; chuyển giáo viên duyệt.');
  assert.equal(row.effective_uses_electronic_device, device);
}

for (const [actor, user] of [['Student', ids.s], ['Monitor', ids.m]]) {
  for (const status of ['submitted', 'draft']) {
    test(`${actor} ${status}: forged teacher/AI metadata never reaches storage or notifications`, async t => {
      const db = await fixture(t);
      const row = await insert(db, user, { ...forged, status });
      canonical(row, { draft: status === 'draft' });
      // Use the real worker decision resolver: a 0.87 review must not take the
      // lower 0.85 feedback threshold on a genuinely new registration.
      assert.equal(resolveReviewOutcome({ hasTeacherGuidance: Boolean(String(row.teacher_comment || '').trim()),
        modelDecision: 'auto_approve', category: 'study', reviewConfidence: 0.87,
        revisionStatus: 'satisfied', revisionConfidence: 0.99,
        baseThreshold: 0.90, revisionThreshold: 0.85 }).finalDecision, 'manual_review');
      const notices = (await db.query('select * from teacher_notifications where registration_id=$1', [row.id])).rows;
      assert.equal(notices.length, status === 'draft' ? 0 : 1);
      assert.equal(JSON.stringify(notices).includes('FORGED'), false);
      if (status === 'submitted') assert.equal(notices[0].notification_type, 'ai_watch');
    });
  }
}
test('negative counter and empty teacher comment normalize before constraints', async t => {
  const db = await fixture(t);
  canonical(await insert(db, ids.s, { ...forged, teacher_comment: '', ai_review_count: -99 }));
});
test('large, negative and null AI counters initialize to zero without a teacher-comment exploit', async t => {
  const db = await fixture(t);
  for (const [period, count] of [[1, 999], [2, -99], [3, null]]) {
    const row = await insert(db, ids.s, { period_number: period, teacher_comment: null, ai_review_count: count });
    assert.equal(row.ai_review_count, 0);
    canonical(row);
  }
});
test('AI disabled uses canonical manual review and notification', async t => {
  const db = await fixture(t);
  await db.query('update class_settings set ai_automation_enabled=false where class_id=$1', [ids.c]);
  const row = await insert(db, ids.s, forged);
  canonical(row, { enabled: false });
  assert.equal((await db.query('select notification_type from teacher_notifications where registration_id=$1', [row.id])).rows[0].notification_type, 'manual_review');
});
test('legacy default payload accepts draft and submitted and retains existing timestamp semantics', async t => {
  const db = await fixture(t);
  for (const [period, status] of [[1, 'draft'], [2, 'submitted']]) {
    const row = await insert(db, ids.s, { status, period_number: period, teacher_comment: null,
      approval_source: 'manual', approved_at: null, updated_at: '2026-01-01T00:00:00Z',
      ...(status === 'submitted' ? { submitted_at: '2026-01-01T00:00:00Z' } : {}) });
    canonical(row, { draft: status === 'draft' });
    assert.equal(new Date(row.updated_at).toISOString(), '2026-01-01T00:00:00.000Z');
  }
});
test('forged draft stays clean after content edits and submission', async t => {
  const db = await fixture(t);
  const row = await insert(db, ids.s, { ...forged, status: 'draft' });
  await as(db, ids.s, () => db.query("update registrations set content='Bản sửa',note='Ghi chú' where id=$1", [row.id]));
  await as(db, ids.s, () => db.query("update registrations set status='submitted' where id=$1", [row.id]));
  canonical(await reg(db, row.id));
});
test('all protected UPDATE fields still reject student and monitor tampering atomically', async t => {
  const db = await fixture(t);
  for (const user of [ids.s, ids.m]) {
    const row = await insert(db, user);
    for (const [field, value] of Object.entries(forged).filter(([key]) => key !== 'effective_uses_electronic_device')) {
      await assert.rejects(as(db, user, () => db.query(`update registrations set ${field}=$1 where id=$2`, [value, row.id])), { code: '42501' }, field);
      assert.deepEqual(await reg(db, row.id), row);
    }
  }
});
test('genuine needs_revision feedback and counter survive student resubmission with AI on/off', async t => {
  const db = await fixture(t);
  for (const [period, enabled] of [[1, true], [2, false]]) {
    await db.query('update class_settings set ai_automation_enabled=$1 where class_id=$2', [enabled, ids.c]);
    const row = await insert(db, ids.s, { period_number: period });
    await asService(db, () => db.query('update registrations set ai_review_count=2 where id=$1', [row.id]));
    await as(db, ids.t, () => db.query("update registrations set status='needs_revision',teacher_comment='GV: Bổ sung ví dụ' where id=$1", [row.id]));
    await as(db, ids.s, () => db.query("update registrations set content='Thêm ví dụ',status='submitted' where id=$1", [row.id]));
    const updated = await reg(db, row.id);
    assert.equal(updated.teacher_comment, 'GV: Bổ sung ví dụ');
    assert.equal(updated.ai_review_count, 2);
    assert.equal(updated.ai_review_status, enabled ? 'pending' : 'not_needed');
    if (enabled) assert.equal(updated.auto_review_reason, 'HS đã sửa theo phản hồi GV; Groq AI duyệt lại.');
  }
});
test('approved student edit clears genuine feedback but preserves anti-loop counter', async t => {
  const db = await fixture(t);
  const row = await insert(db, ids.s);
  await asService(db, () => db.query('update registrations set ai_review_count=3 where id=$1', [row.id]));
  await as(db, ids.t, () => db.query("update registrations set status='approved',teacher_comment='GV đã duyệt',approved_by=$1,approved_at=now() where id=$2", [ids.t, row.id]));
  await as(db, ids.s, () => db.query("update registrations set content='Nội dung mới',status='submitted',approval_source='manual',approved_at=null where id=$1", [row.id]));
  const updated = await reg(db, row.id);
  assert.equal(updated.teacher_comment, null);
  assert.equal(updated.ai_review_count, 3);
  assert.equal(updated.ai_review_status, 'pending');
  assert.equal(updated.approved_by, null);
});
test('teacher/admin reviews, AI service updates and genuine feedback history retain existing permissions', async t => {
  const db = await fixture(t);
  const row = await insert(db, ids.s);
  await asService(db, () => db.query("update registrations set status='approved',approval_source='ai',ai_review_status='completed',ai_decision='auto_approve',ai_model='trusted',ai_review_count=1 where id=$1", [row.id]));
  await as(db, ids.t, () => db.query("update registrations set status='needs_revision',teacher_comment='Genuine GV' where id=$1", [row.id]));
  assert.equal((await reg(db, row.id)).teacher_comment, 'Genuine GV');
  assert.equal((await db.query('select teacher_comment from ai_review_feedback where registration_id=$1', [row.id])).rows[0].teacher_comment, 'Genuine GV');
  await as(db, ids.a, () => db.query("update registrations set status='approved',teacher_comment='Admin review' where id=$1", [row.id]));
  assert.equal((await reg(db, row.id)).teacher_comment, 'Admin review');
  const changed = await as(db, ids.t2, () => db.query("update registrations set teacher_comment='WRONG CLASS' where id=$1 returning id", [row.id]));
  assert.equal(changed.rows.length, 0);
  for (const manager of [ids.t, ids.a]) await assert.rejects(insert(db, manager, { student_id: ids.s, period_number: 2 }), { code: '42501' });
});
test('owner/status/deletion/emergency/deadline/closed-week failures still reject', async t => {
  const db = await fixture(t);
  for (const payload of [
    { student_id: ids.s2 }, { status: 'approved' }, { status: 'needs_revision' },
    { is_deleted: true }, { is_emergency: true }, { week_id: weeks.past },
  ]) await assert.rejects(insert(db, ids.s, { ...forged, ...payload }), { code: '42501' }, JSON.stringify(payload));
  await db.query("update class_weeks set manual_status='locked' where class_id=$1 and week_id=$2", [ids.c, weeks.next]);
  await assert.rejects(insert(db, ids.s, forged), { code: '42501' });
  assert.equal((await db.query('select count(*)::int n from registrations')).rows[0].n, 0);
});
test('caller class is still derived from profile; supplied class cannot grant cross-class access', async t => {
  const db = await fixture(t);
  const row = await insert(db, ids.s, { ...forged, class_id: ids.c2 });
  assert.equal(row.class_id, ids.c);
  canonical(row);
});
test('bulk insert normalizes every row; a forbidden row rolls back the statement', async t => {
  const db = await fixture(t);
  await as(db, ids.s, () => db.query(`insert into registrations(student_id,week_id,weekday,period_number,content,status,teacher_comment,ai_review_count)
    values($1,$2,1,1,'Clean','submitted',null,0),($1,$2,1,2,'Bad','submitted','FORGED',999)`, [ids.s, weeks.next]));
  for (const row of (await db.query('select * from registrations')).rows) canonical(row);
  await assert.rejects(as(db, ids.s, () => db.query(`insert into registrations(student_id,week_id,weekday,period_number,content,status,teacher_comment,ai_review_count)
    values($1,$3,2,1,'Valid','submitted','FORGED',999),($2,$3,2,2,'Invalid owner','submitted','FORGED',999)`, [ids.s, ids.s2, weeks.next])), { code: '42501' });
  assert.equal((await db.query('select count(*)::int n from registrations')).rows[0].n, 2);
});
test('device policy still recomputes client effective value and retains requested choice', async t => {
  const db = await fixture(t);
  await policy(db, ids.t, 'lock', { weekday: 1, period_number: 1 });
  const row = await insert(db, ids.s, { ...forged, uses_electronic_device: true });
  canonical(row);
  assert.equal(row.uses_electronic_device, true);
});
test('service insert keeps trusted feedback/counter, and security-definer insertion retains student identity', async t => {
  const db = await fixture(t);
  const trusted = await asService(db, async () => (await db.query(`insert into registrations(student_id,class_id,week_id,weekday,period_number,content,status,teacher_comment,ai_review_count)
    values($1,$2,$3,1,1,'Trusted','draft','Genuine import',7) returning *`, [ids.s, ids.c, weeks.next])).rows[0]);
  assert.equal(trusted.teacher_comment, 'Genuine import');
  assert.equal(trusted.ai_review_count, 7);
  // Test-only writer with elevated SQL identity; not installed by the patch.
  await db.exec(`create function public.sec_test_definer_insert() returns public.registrations language sql security definer set search_path=public,pg_temp as $$
    insert into registrations(student_id,week_id,weekday,period_number,content,status,teacher_comment,ai_review_count)
    values(auth.uid(),'${weeks.next}',1,2,'Via definer','submitted','FORGED',999) returning * $$;
    revoke all on function public.sec_test_definer_insert() from public,anon,service_role;
    grant execute on function public.sec_test_definer_insert() to authenticated;`);
  const result = await as(db, ids.s, async () => (await db.query('select * from sec_test_definer_insert()')).rows[0]);
  canonical(result);
});
test('whitelisted emergency Edge Function service insert retains emergency metadata and device policy', async t => {
  const db = await fixture(t);
  await policy(db, ids.t, 'lock', { weekday: 1, period_number: 1 });
  const row = await asService(db, async () => (await db.query(`insert into registrations(student_id,class_id,week_id,weekday,period_number,content,status,approval_source,is_emergency,emergency_reason,emergency_requested_at,uses_electronic_device,submitted_at)
    values($1,$2,$3,1,1,'Emergency content','submitted','manual',true,'Valid reason',now(),true,now()) returning *`, [ids.s, ids.c, weeks.next])).rows[0]);
  assert.equal(row.is_emergency, true);
  assert.equal(row.emergency_reason, 'Valid reason');
  assert.ok(row.emergency_requested_at);
  assert.equal(row.teacher_comment, null);
  assert.equal(row.ai_review_count, 0);
  assert.equal(row.ai_review_status, 'pending');
  assert.equal(row.auto_review_reason, 'Đăng ký bổ sung; Groq AI kiểm tra trước.');
  assert.equal(row.uses_electronic_device, true);
  assert.equal(row.effective_uses_electronic_device, false);
});
test('migration upgrade is idempotent and does not mutate existing rows/history or expose helper', async t => {
  const db = await fixture(t, { patch: false });
  const row = await insert(db, ids.s, forged);
  const before = await reg(db, row.id);
  const notices = (await db.query('select * from teacher_notifications')).rows;
  const signals = (await db.query('select * from storage_change_signals')).rows;
  await migrate(db); await migrate(db);
  assert.deepEqual(await reg(db, row.id), before);
  assert.deepEqual((await db.query('select * from teacher_notifications')).rows, notices);
  assert.deepEqual((await db.query('select * from storage_change_signals')).rows, signals);
  canonical(await insert(db, ids.s, { ...forged, period_number: 2 }));
  const acl = (await db.query(`select has_function_privilege('anon','public.normalize_student_registration_insert()','EXECUTE') a,
    has_function_privilege('authenticated','public.normalize_student_registration_insert()','EXECUTE') s,
    has_function_privilege('service_role','public.normalize_student_registration_insert()','EXECUTE') w`)).rows[0];
  assert.deepEqual(acl, { a: false, s: false, w: false });
  await db.exec('set role anon');
  try { await assert.rejects(db.query(`insert into registrations(student_id,week_id,weekday,period_number,content) values($1,$2,2,1,'Anon')`, [ids.s, weeks.next]), { code: '42501' }); }
  finally { await db.exec('reset role'); }
});
