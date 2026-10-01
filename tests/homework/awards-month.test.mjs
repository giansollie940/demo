// Góc tuyên dương theo tháng: chạy chuỗi nâng cấp FEAT-001 → FEAT-004 rồi migration
// supabase/migrations/20261001090000_homework_awards_by_month.sql trên PGlite.
// Cần FEAT002_UPGRADE=1 FEAT004_UPGRADE=1 (xem script test:homework:awards-month).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createFixture, ids } from './fixture.mjs'

if (!process.env.FEAT004_UPGRADE) {
  test('awards by month needs FEAT002_UPGRADE=1 FEAT004_UPGRADE=1', { skip: true }, () => {})
} else {
  const db = await createFixture()
  const read = file => readFile(new URL(file, import.meta.url), 'utf8')
  for (const file of ['05-FEAT-001-BAO-BAI.sql', '06-FEAT-001-AI-RECOVERY.sql', '07-FEAT-002-PERMISSIONS-LIFECYCLE.sql', '08-FEAT-004-MULTI-CLASS-CATALOG.sql'])
    await db.exec(await read('../../database/upgrade/' + file))
  const migration = await read('../../supabase/migrations/20261001090000_homework_awards_by_month.sql')

  async function as(actor, fn) {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub','${actor}',false); set role authenticated;`)
    try { return await fn() } finally { await db.exec('reset role') }
  }
  const rpc = (actor, action, p = {}) => as(actor, async () =>
    (await db.query('select public.homework_api($1,$2::jsonb) result', [action, JSON.stringify({ class_id: ids.c, ...p })])).rows[0].result)
  async function server(action, p) {
    await db.exec('set role service_role')
    try { return (await db.query('select public.homework_ai($1,$2::jsonb) result', [action, JSON.stringify(p)])).rows[0].result } finally { await db.exec('reset role') }
  }
  async function publish(author, title) {
    const n = await rpc(author, 'submit', { subject_id: subject.id, title, content: title, due_at: '2026-12-10T13:00:00Z', request_id: crypto.randomUUID() })
    const snap = await server('snapshot', { id: n.id })
    await server('finish', { id: n.id, revision: snap.notice.revision, fingerprint: snap.fingerprint, score: 0, reason: 'No candidates' })
    return n.id
  }

  const cat = await rpc(ids.a, 'catalog_save', { grade: 7, name: 'KHTN', short_name: 'KHTN', icon: '🌿' })
  const subject = await rpc(ids.t, 'subject_save', { catalog_subject_id: cat.id })

  await test('migration applies once and is a no-op the second time', async () => {
    await db.exec(migration)
    const def = (await db.query("select pg_get_functiondef('homework_private.api_v3(text,jsonb)'::regprocedure) d")).rows[0].d
    assert.ok(def.includes('m_start date;'))
    assert.ok(def.includes("x.published_at>=win_start and x.published_at<win_end) hearts"))
    await db.exec(migration)
    const again = (await db.query("select pg_get_functiondef('homework_private.api_v3(text,jsonb)'::regprocedure) d")).rows[0].d
    assert.equal(again, def)
  })

  await test('board counts by the month the notice was approved; hearts follow the notice', async () => {
    // Monitor: one notice approved in September, one in October. Student: one in October.
    const sep = await publish(ids.m, 'Sep notice')
    const oct = await publish(ids.m, 'Oct notice')
    const octS = await publish(ids.s, 'Oct student')
    await db.query("update homework_notices set published_at='2026-09-30T16:30:00Z' where id=$1", [sep]) // 30/09 23:30 VN
    await db.query("update homework_notices set published_at='2026-09-30T17:30:00Z' where id=$1", [oct]) // 01/10 00:30 VN
    await db.query("update homework_notices set published_at='2026-10-05T03:00:00Z' where id=$1", [octS])
    // Hearts on the September notice given in October still belong to September.
    await rpc(ids.other, 'heart', { id: sep, liked: true })
    await rpc(ids.s, 'heart', { id: sep, liked: true })
    await rpc(ids.other, 'heart', { id: octS, liked: true })
    await db.query("update homework_notice_reactions set created_at='2026-10-10T03:00:00Z'")

    const row = (board, id) => board.find(x => x.id === id)
    const sepLoad = await rpc(ids.t, 'load', { month: '2026-09' })
    assert.equal(row(sepLoad.leaderboard, ids.m).notices, 1)
    assert.equal(row(sepLoad.leaderboard, ids.m).hearts, 2)
    assert.equal(row(sepLoad.leaderboard, ids.s).notices, 0)

    const octLoad = await rpc(ids.t, 'load', { month: '2026-10' })
    assert.equal(row(octLoad.leaderboard, ids.m).notices, 1)
    assert.equal(row(octLoad.leaderboard, ids.m).hearts, 0)
    assert.equal(row(octLoad.leaderboard, ids.s).notices, 1)
    assert.equal(row(octLoad.leaderboard, ids.s).hearts, 1)
    assert.equal(row(octLoad.leaderboard, ids.m).notice_rank, row(octLoad.leaderboard, ids.s).notice_rank)

    const year = await rpc(ids.t, 'load', {})
    assert.equal(row(year.leaderboard, ids.m).notices, 2)
    assert.equal(row(year.leaderboard, ids.m).hearts, 2)
    assert.equal(row(year.leaderboard, ids.m).year_notices, 2)

    // A month outside the school year gives an empty board, not an error.
    const outside = await rpc(ids.t, 'load', { month: '2028-01' })
    assert.ok(outside.leaderboard.every(x => x.notices === 0 && x.hearts === 0))
    await assert.rejects(rpc(ids.t, 'load', { month: '2026-13' }), /Tháng không hợp lệ/)
    await assert.rejects(rpc(ids.t, 'load', { month: "2026-09'; drop table x; --" }), /Tháng không hợp lệ/)
  })

  await test('award_months lists the school year up to the current month', async () => {
    const r = await rpc(ids.s, 'load', { month: '2026-09' })
    assert.ok(Array.isArray(r.award_months))
    assert.equal(r.award_months[0], '2026-07') // fixture school year starts 2026-07-01
    assert.deepEqual([...r.award_months].sort(), r.award_months)
    const nowMonth = (await db.query("select to_char(now() at time zone 'Asia/Ho_Chi_Minh','YYYY-MM') m")).rows[0].m
    assert.ok(r.award_months.at(-1) <= nowMonth)
  })

  await test('week_id still works for older clients', async () => {
    const weekId = crypto.randomUUID()
    await db.query("insert into weeks values($1,$2,'2026-09-28','2026-10-04',13)", [weekId, ids.y])
    const r = await rpc(ids.t, 'load', { week_id: weekId })
    assert.equal(r.leaderboard.find(x => x.id === ids.m).notices, 2) // both approvals fall in that week
  })

  await db.close()
}
