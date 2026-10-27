// FEAT-LATE-001: các hàm mới trong public/supabase-service.js, chạy với một Supabase client giả.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const SOURCE = readFileSync(new URL('../public/supabase-service.js', import.meta.url), 'utf8')
const CLASS = '11111111-1111-4111-8111-111111111111', YEAR = '22222222-2222-4222-8222-222222222222'
const STUDENT = '33333333-3333-4333-8333-333333333333', WEEK = '44444444-4444-4444-8444-444444444444'

function load(responses) {
  const calls = []
  const builder = table => {
    const query = { table, filters: [] }
    calls.push(query)
    const self = {
      select: cols => { query.select = cols; return self },
      eq: (col, value) => { query.filters.push(['eq', col, value]); return self },
      is: (col, value) => { query.filters.push(['is', col, value]); return self },
      order: () => self,
      update: values => { query.update = values; return self },
      maybeSingle: () => self,
      then: (ok, bad) => Promise.resolve(responses[table]).then(ok, bad),
    }
    return self
  }
  const client = {
    from: builder,
    rpc: async (name, args) => { calls.push({ rpc: name, args }); return responses[name] },
    auth: {},
  }
  const sessionStorage = { getItem: () => null, setItem() {}, removeItem() {} }
  const window = { APP_CONFIG: { mode: 'supabase', projectUrl: 'https://x.supabase.co', publishableKey: 'k' }, supabase: { createClient: () => client }, sessionStorage, localStorage: sessionStorage }
  vm.runInNewContext(SOURCE, { window, sessionStorage, localStorage: sessionStorage, console, setTimeout, clearTimeout, URL, Intl, Date, JSON, Promise })
  return { api: window.SupabaseService, calls }
}

// Objects come from the vm realm; compare plain copies.
const plain = value => JSON.parse(JSON.stringify(value))

test('loadLateTracking maps rows, keeps only active lates and reads the class threshold', async () => {
  const { api, calls } = load({
    late_registrations: { data: [{ id: 'l1', student_id: STUDENT, week_id: WEEK, weekday: 2, period_number: 5, recorded_at: '2026-10-27T01:00:00Z', recorded_by: null, conduct_case_id: null }], error: null },
    conduct_cases: { data: [{ id: 'k1', student_id: STUDENT, threshold: 3, created_at: '2026-10-20T00:00:00Z', resolved_at: null, resolved_by: null, resolution_note: null }], error: null },
    class_settings: { data: { late_conduct_threshold: 4 }, error: null },
  })
  const data = await api.loadLateTracking(CLASS, YEAR)
  assert.equal(data.available, true)
  assert.equal(data.threshold, 4)
  assert.deepEqual(plain(data.lates[0]), { id: 'l1', studentId: STUDENT, weekId: WEEK, dow: 1, period: 5, recordedAt: '2026-10-27T01:00:00Z', recordedBy: null, conductCaseId: null })
  assert.equal(data.cases[0].resolvedAt, null)
  const lates = calls.find(c => c.table === 'late_registrations')
  assert.deepEqual(plain(lates.filters), [['eq', 'class_id', CLASS], ['eq', 'school_year_id', YEAR], ['is', 'revoked_at', null]])
})

test('before the migration is applied the feature reports itself unavailable instead of failing', async () => {
  const missing = { data: null, error: { code: 'PGRST205', message: "Could not find the table 'public.late_registrations' in the schema cache" } }
  const { api } = load({ late_registrations: missing, conduct_cases: missing, class_settings: { data: null, error: { code: '42703', message: 'column class_settings.late_conduct_threshold does not exist' } } })
  assert.deepEqual(plain(await api.loadLateTracking(CLASS, YEAR)), { available: false, threshold: 3, lates: [], cases: [] })
})

test('recordLateRegistration sends a 1-based weekday and passes the server message through', async () => {
  const { api, calls } = load({ record_late_registration: { data: { late_id: 'l9', pending: 0, threshold: 3, conduct_case_id: 'k2' }, error: null } })
  assert.deepEqual(plain(await api.recordLateRegistration({ studentId: STUDENT, weekId: WEEK, dow: 0, period: 1 })), { lateId: 'l9', pending: 0, threshold: 3, conductCaseId: 'k2' })
  assert.deepEqual(plain(calls.at(-1).args), { p_student_id: STUDENT, p_week_id: WEEK, p_weekday: 1, p_period_number: 1 })

  const denied = load({ record_late_registration: { data: null, error: { code: '42501', message: 'Cán sự không tự ghi nhận cho chính mình; hãy nhờ giáo viên.' } } })
  await assert.rejects(denied.api.recordLateRegistration({ studentId: STUDENT, weekId: WEEK, dow: 0, period: 1 }), /chính mình/)
  const odd = load({ record_late_registration: { data: null, error: { code: 'XX000', message: 'internal' } } })
  await assert.rejects(odd.api.recordLateRegistration({ studentId: STUDENT, weekId: WEEK, dow: 0, period: 1 }), /Không ghi nhận được lần trễ/)
})

test('setLateConductThreshold validates the range and reports a refused update', async () => {
  const { api } = load({ class_settings: { data: [], error: null } })
  await assert.rejects(api.setLateConductThreshold(CLASS, 0), /từ 1 đến 20/)
  await assert.rejects(api.setLateConductThreshold(CLASS, 4), /Chỉ giáo viên/)
  const ok = load({ class_settings: { data: [{ late_conduct_threshold: 4 }], error: null } })
  assert.equal(await ok.api.setLateConductThreshold(CLASS, 4), 4)
})
