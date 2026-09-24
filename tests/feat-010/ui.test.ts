import { beforeEach, afterEach, it, expect, vi } from 'vitest'
import { h, ref, nextTick } from 'vue'
import { mount, textOf, findAll, settle } from '../bug-001/renderer'
import RegistrationDialog from '../../src/components/registrations/RegistrationDialog.vue'
import StudySessionCard from '../../src/components/registrations/StudySessionCard.vue'
import ApprovalList from '../../src/components/approvals/ApprovalList.vue'
import StudentTrackingRow from '../../src/components/tracking/StudentTrackingRow.vue'
import {
  deviceDisplay, deviceHistoryEvents, devicePolicyMap, deviceSlotRows, deviceSlotState, usesDevice,
  type DevicePolicySlot,
} from '../../src/features/registrations/device-policy'
import DevicePolicyHistory from '../../src/components/registrations/DevicePolicyHistory.vue'
import AdminDevicePolicy from '../../src/components/admin/AdminDevicePolicy.vue'
import { buildDashboardMetrics } from '../../src/features/dashboard/dashboard-model'
import { trackingDeviceState, trackingFilterCounts } from '../../src/features/tracking/tracking-model'
import { visibleNavigation, navigation } from '../../src/features/navigation/navigation'
import { routes } from '../../src/app/router/routes'
import { devicePolicyInvalidations } from '../../src/realtime/useRealtimeInvalidation'
import { useDevicePolicyOnOpen } from '../../src/features/registrations/device-policy-queries'
import { readFile } from 'node:fs/promises'
import type { RegistrationRecord } from '../../src/types/legacy'

let app: any
beforeEach(() => {
  vi.stubGlobal('Document', class {})
  vi.stubGlobal('ShadowRoot', class {})
  vi.stubGlobal('document', { activeElement: null })
})
afterEach(() => { app?.unmount(); app = null; vi.unstubAllGlobals() })

function render(component: any, props: any) {
  const mounted = mount({ render: () => h(component, props) })
  app = mounted.app
  return mounted.root
}

const week = { id: 'w', number: 7, startDate: '2026-10-05', endDate: '2026-10-11', status: 'open' } as any
const period = { n: 3, start: '09:10', end: '09:55' } as any
const eligibility = {
  regularNewAllowed: true, editable: true, emergencyAllowed: false, started: false,
  reported: false, readOnlyReason: null,
} as any

const registration = (overrides: Partial<RegistrationRecord> = {}): RegistrationRecord => ({
  id: 'r1', studentId: 's', weekId: 'w', dow: 2, period: 3, content: 'Ôn tập', status: 'submitted',
  usesElectronicDevice: false, effectiveUsesElectronicDevice: false, ...overrides,
} as RegistrationRecord)

// ---------------------------------------------------------------------------
// BR-010-009 / AC-010-014 — one derivation, every screen
// ---------------------------------------------------------------------------

it('BR-010-010: ba trạng thái thiết bị là ba câu khác nhau, không phải có/không', () => {
  expect(deviceDisplay(null).short).toBe('Chưa có đăng ký')
  expect(deviceDisplay(registration({ usesElectronicDevice: true, effectiveUsesElectronicDevice: true })).tone).toBe('yes')
  expect(deviceDisplay(registration({ usesElectronicDevice: false, effectiveUsesElectronicDevice: false })).tone).toBe('no')

  // The case the spec is specific about: the student asked, the policy said no.
  // It must not read as "Có thiết bị", and it must not read as a plain "Không".
  const locked = deviceDisplay(registration({ usesElectronicDevice: true, effectiveUsesElectronicDevice: false }))
  expect(locked.tone).toBe('locked')
  expect(locked.label).toContain('khóa')
  expect(locked.label).not.toBe('Không đăng ký')
})

it('AC-010-014: thống kê và theo dõi đếm quyền hiệu lực, không đếm lời xin', () => {
  const rows = [
    registration({ id: 'a', usesElectronicDevice: true, effectiveUsesElectronicDevice: true }),
    registration({ id: 'b', usesElectronicDevice: true, effectiveUsesElectronicDevice: false }),
    registration({ id: 'c', usesElectronicDevice: false, effectiveUsesElectronicDevice: false }),
  ]
  const metrics = buildDashboardMetrics({ users: [], registrations: rows, slots: [] })
  expect(metrics.electronicDevices).toBe(1)

  const tracking = rows.map(row => ({ user: { id: row.id } as any, registration: row, bucket: 'registered' as const }))
  expect(tracking.map(trackingDeviceState)).toEqual(['device', 'no-device', 'no-device'])
  expect(trackingFilterCounts(tracking).device).toBe(1)
})

it('một dòng cũ chưa có cột hiệu lực vẫn đọc theo lựa chọn gốc, không biến thành không-thiết-bị', () => {
  // A page served from cache between the migration and the next full reload has
  // rows without the new column. Reading those as device-free would quietly
  // wipe the number on the dashboard.
  const legacy = { id: 'old', studentId: 's', weekId: 'w', dow: 2, period: 3, content: 'x', status: 'approved', usesElectronicDevice: true } as RegistrationRecord
  expect(usesDevice(legacy)).toBe(true)
  expect(buildDashboardMetrics({ users: [], registrations: [legacy], slots: [] }).electronicDevices).toBe(1)
})

// ---------------------------------------------------------------------------
// BR-010-012 — the student's screen
// ---------------------------------------------------------------------------

it('BR-010-012: ô chọn thiết bị bị khóa nhưng vẫn hiện, kèm lý do', async () => {
  const root = render(RegistrationDialog, {
    open: true, mode: 'regular', week, period, dow: 2, registration: null,
    eligibility, saving: false, error: '', policyState: 'locked',
  })
  await settle()
  const boxes = findAll(root, n => n.type === 'input' && n.props.type === 'checkbox')
  expect(boxes).toHaveLength(1)
  expect(boxes[0].props.disabled).toBe(true)
  expect(textOf(root)).toContain('Sử dụng thiết bị điện tử')
  expect(textOf(root)).toContain('Buổi này tạm thời không cho đăng ký sử dụng thiết bị điện tử.')
  // The reason is wired to the control, not just printed near it.
  expect(boxes[0].props['aria-describedby']).toBe('device-policy-note')
})

it('buổi được mở riêng thì ô chọn mở lại và nói rõ vì sao', async () => {
  const root = render(RegistrationDialog, {
    open: true, mode: 'regular', week, period, dow: 2, registration: null,
    eligibility, saving: false, error: '', policyState: 'allow_override',
  })
  await settle()
  expect(findAll(root, n => n.type === 'input' && n.props.type === 'checkbox')[0].props.disabled).toBe(false)
  expect(textOf(root)).toContain('mở riêng')
})

it('buổi mở bình thường thì không có ghi chú chính sách nào', async () => {
  const root = render(RegistrationDialog, {
    open: true, mode: 'regular', week, period, dow: 2, registration: null,
    eligibility, saving: false, error: '',
  })
  await settle()
  expect(findAll(root, n => n.type === 'input' && n.props.type === 'checkbox')[0].props.disabled).toBe(false)
  expect(textOf(root)).not.toContain('tạm thời không cho đăng ký')
})

it('thẻ buổi học nói "đang bị khóa" thay vì im lặng bỏ dòng thiết bị', () => {
  const locked = render(StudySessionCard, {
    week, period, dow: 2, eligibility, policyState: 'locked',
    registration: registration({ usesElectronicDevice: true, effectiveUsesElectronicDevice: false }),
  })
  expect(textOf(locked)).toContain('Thiết bị điện tử đang bị khóa cho buổi này')
  expect(textOf(locked)).not.toContain('Có sử dụng thiết bị điện tử')
  app.unmount(); app = null

  const allowed = render(StudySessionCard, {
    week, period, dow: 2, eligibility, policyState: 'allow_override',
    registration: registration({ usesElectronicDevice: true, effectiveUsesElectronicDevice: true }),
  })
  expect(textOf(allowed)).toContain('Có sử dụng thiết bị điện tử')
})

it('danh sách duyệt phân biệt "có thiết bị" với "thiết bị đang bị khóa"', () => {
  const root = render(ApprovalList, {
    selectedId: null,
    users: [{ id: 's', name: 'An', code: 'HS01', role: 'student', active: true } as any],
    registrations: [
      registration({ id: 'a', usesElectronicDevice: true, effectiveUsesElectronicDevice: true }),
      registration({ id: 'b', usesElectronicDevice: true, effectiveUsesElectronicDevice: false }),
    ],
  })
  const text = textOf(root)
  expect(text).toContain('Thiết bị điện tử')
  expect(text).toContain('Thiết bị đang bị khóa')
})

it('dòng theo dõi hiển thị trạng thái khóa cho giáo viên', () => {
  const root = render(StudentTrackingRow, {
    row: {
      user: { id: 's', name: 'An', code: 'HS01', role: 'student', active: true } as any,
      registration: registration({ usesElectronicDevice: true, effectiveUsesElectronicDevice: false }),
      bucket: 'registered' as const,
    },
  })
  expect(textOf(root)).toContain('Đang bị khóa')
})

// ---------------------------------------------------------------------------
// The teacher's row model
// ---------------------------------------------------------------------------

const slot = (over: Partial<DevicePolicySlot> = {}): DevicePolicySlot => ({
  weekday: 3, period_number: 3, state: 'open', session_start: '2026-10-07T02:10:00Z',
  locked_at: null, override_id: null, ...over,
})

it('bảng của giáo viên đổi thứ 1–5 của cơ sở dữ liệu sang thứ 0–4 của ứng dụng', () => {
  const map = devicePolicyMap([slot({ weekday: 1, period_number: 2, state: 'locked' })])
  expect(deviceSlotState(map, 0, 2)).toBe('locked')
  expect(deviceSlotState(map, 1, 2)).toBe('open')
  // A slot the policy never mentioned is open, not undefined.
  expect(deviceSlotState(undefined, 4, 5)).toBe('open')
})

it('BR-010-007: nút mở riêng và hủy mở riêng biến mất khi buổi đã bắt đầu; khóa/mở vẫn còn', () => {
  const past = new Date('2026-10-07T02:10:00Z').getTime() + 60_000
  const future = new Date('2026-10-07T02:10:00Z').getTime() - 60_000

  const [beforeStart] = deviceSlotRows([slot({ state: 'locked' })], future)
  expect(beforeStart.started).toBe(false)
  expect(beforeStart.canAllow).toBe(true)

  const [afterStart] = deviceSlotRows([slot({ state: 'locked' })], past)
  expect(afterStart.started).toBe(true)
  expect(afterStart.canAllow).toBe(false)

  const [revocable] = deviceSlotRows([slot({ state: 'allow_override', override_id: 'o1' })], future)
  expect(revocable.canRevoke).toBe(true)
  const [tooLate] = deviceSlotRows([slot({ state: 'allow_override', override_id: 'o1' })], past)
  expect(tooLate.canRevoke).toBe(false)
})

it('một buổi không giải được giờ bắt đầu thì không bị coi là đã bắt đầu', () => {
  // EC-010-010 on the screen: unknown is not "already started", because
  // treating it as started would silently withdraw the teacher's options.
  const [row] = deviceSlotRows([slot({ session_start: null, state: 'locked' })], Date.now())
  expect(row.sessionStart).toBeNull()
  expect(row.started).toBe(false)
  expect(row.canAllow).toBe(true)
})

it('các ô được sắp theo thứ rồi tiết', () => {
  const rows = deviceSlotRows([
    slot({ weekday: 5, period_number: 1 }), slot({ weekday: 1, period_number: 4 }),
    slot({ weekday: 1, period_number: 2 }),
  ], Date.now())
  expect(rows.map(r => `${r.dow}:${r.period}`)).toEqual(['0:2', '0:4', '4:1'])
})

// ---------------------------------------------------------------------------
// Navigation — the mistake this repo has already made once
// ---------------------------------------------------------------------------

it('FEAT-011 chuyển lối vào Thiết bị điện tử vào Thời khóa biểu, không thêm quyền cho học sinh', () => {
  const labels = (role: any) => visibleNavigation(role).map(item => item.label)
  expect(labels('teacher')).toContain('Thời khóa biểu')
  expect(labels('admin')).toContain('Năm học')
  expect(labels('admin')).not.toContain('Thời khóa biểu')
  for (const role of ['student', 'monitor']) expect(labels(role)).not.toContain('Thiết bị điện tử')
  expect(labels('teacher')).not.toContain('Thiết bị điện tử')
  expect(labels('admin')).not.toContain('Thiết bị điện tử')
  const entry = navigation.find(item => item.label === 'Thời khóa biểu' && item.roles.includes('teacher'))
  expect(entry?.to).toBe('/schedule')

  const paths = routes.flatMap(route => (route.children ?? []).map(child => child.path))
  expect(paths).toContain('device-policy')
  const route = routes.flatMap(r => r.children ?? []).find(child => child.path === 'device-policy')
  expect(route?.meta?.roles).toEqual(['teacher'])
})

// ---------------------------------------------------------------------------
// Sol RC1 — frontend half
// ---------------------------------------------------------------------------

it('RC1-§10 nút Khóa/Mở theo trạng thái hiện tại của slot, không theo lịch sử của tuần đang xem', () => {
  const now = Date.now()
  // A past week that sat inside an interval since released: the session reads
  // `locked` for ever, but there is nothing open to unlock. Deriving the button
  // from `state` here offers "Mở từ bây giờ" for a no-op.
  const [historical] = deviceSlotRows(
    [slot({ state: 'locked', current_recurring_state: 'open', session_start: '2020-01-01T00:00:00Z' })], now)
  expect(historical.state).toBe('locked')
  expect(historical.recurringLocked).toBe(false)

  const [live] = deviceSlotRows(
    [slot({ state: 'locked', current_recurring_state: 'locked', locked_at: '2026-10-01T00:00:00Z' })], now)
  expect(live.recurringLocked).toBe(true)
  expect(live.lockedAt).not.toBeNull()

  // A student's row carries none of those fields. Falling back to `state` would
  // reintroduce the bug, so the fallback goes the safe way: not locked.
  const [sanitized] = deviceSlotRows([{
    weekday: 3, period_number: 3, state: 'locked', session_start: '2026-10-07T02:10:00Z',
  }], now)
  expect(sanitized.recurringLocked).toBe(false)
  expect(sanitized.lockedAt).toBeNull()
  expect(sanitized.overrideId).toBeNull()
})

it('RC1-P2 trạng thái khóa của một buổi chỉ có ở tuần này vẫn tới được hộp thoại đăng ký', async () => {
  // The state RPC now returns week-only sessions, so the map has a row for one.
  // This is the frontend half: that row must reach the dialog and disable the
  // box, rather than the slot being absent and defaulting to open.
  const map = devicePolicyMap([slot({ weekday: 4, period_number: 5, state: 'locked' })])
  expect(deviceSlotState(map, 3, 5)).toBe('locked')

  const root = render(RegistrationDialog, {
    open: true, mode: 'regular', week, period: { n: 5, start: '10:50', end: '11:35' }, dow: 3,
    registration: null, eligibility, saving: false, error: '',
    policyState: deviceSlotState(map, 3, 5),
  })
  await settle()
  expect(findAll(root, n => n.type === 'input' && n.props.type === 'checkbox')[0].props.disabled).toBe(true)
  expect(textOf(root)).toContain('Buổi này tạm thời không cho đăng ký sử dụng thiết bị điện tử.')
})

it('RC2-§8 tín hiệu realtime là bảng tín hiệu, KHÔNG phải hai bảng policy', () => {
  // Hai bảng policy là manager-only, và Postgres Changes áp RLS khi phát. Đăng
  // ký nghe chúng nghĩa là học sinh — đúng nhóm người cần — không nhận được gì.
  expect(devicePolicyInvalidations('device_use_policy_signals')).toEqual([['device-policy'], ['week-data']])
  for (const table of ['device_use_lock_intervals', 'device_use_session_overrides']) {
    expect(devicePolicyInvalidations(table)).toBeNull()
  }
  for (const table of ['registrations', 'teacher_notifications', 'class_weeks', 'weeks', '', null, undefined]) {
    expect(devicePolicyInvalidations(table)).toBeNull()
  }
})

it('RC2-§8 subscription đăng ký bảng tín hiệu và bỏ hai bảng manager-only', async () => {
  // Quy tắc ở trên vô nghĩa nếu Postgres không bao giờ gửi sự kiện. Legacy
  // service là JS thuần không có bề mặt export nào để gọi, nên đọc danh sách
  // bảng mà nó đăng ký.
  const service = await readFile(new URL('../../public/supabase-service.js', import.meta.url), 'utf8')
  const list = service.slice(service.indexOf('const tables=['))
  const registered = list.slice(0, list.indexOf(']'))
  expect(registered).toContain('"device_use_policy_signals"')
  expect(registered).not.toContain('"device_use_lock_intervals"')
  expect(registered).not.toContain('"device_use_session_overrides"')
})

it('RC2-§8 mở hộp thoại thì hỏi lại máy chủ, không phụ thuộc realtime', async () => {
  // Tín hiệu realtime chỉ tới nếu người triển khai đã bật publication. Một màn
  // hình đúng không được phụ thuộc vào một cái công tắc trên dashboard, nên có
  // đường thứ hai: hỏi lại đúng lúc sắp dùng tới.
  const open = ref(false)
  let refetches = 0
  useDevicePolicyOnOpen(open, { refetch: async () => { refetches++ } })

  expect(refetches).toBe(0)
  open.value = true
  await nextTick()
  expect(refetches).toBe(1)

  // Đóng lại thì không hỏi; mở lần nữa thì hỏi lại.
  open.value = false
  await nextTick()
  expect(refetches).toBe(1)
  open.value = true
  await nextTick()
  expect(refetches).toBe(2)
})

// ---------------------------------------------------------------------------
// Sol RC3 R-001 — the permission model the app actually exposes
// ---------------------------------------------------------------------------

const historyPayload = {
  intervals: [
    { id: 'i1', class_id: 'c', weekday: 3, period_number: 3, locked_at: '2026-10-01T02:00:00Z',
      locked_by: 't', unlocked_at: '2026-10-05T02:00:00Z', unlocked_by: 't' },
    { id: 'i2', class_id: 'c', weekday: 1, period_number: 2, locked_at: '2026-10-08T02:00:00Z',
      locked_by: 't', unlocked_at: null, unlocked_by: null },
  ],
  overrides: [
    { id: 'o1', interval_id: 'i1', class_id: 'c', week_id: 'w8', weekday: 3, period_number: 3,
      created_at: '2026-10-02T02:00:00Z', created_by: 't', revoked_at: '2026-10-03T02:00:00Z', revoked_by: 't' },
  ],
}

it('R-001 lịch sử policy là một dòng thời gian bốn loại sự kiện, mới nhất trước', () => {
  const events = deviceHistoryEvents(historyPayload)
  // Two intervals → lock + unlock + lock (one still open); one override → allow + revoke.
  expect(events.map(e => e.kind)).toEqual(['lock', 'unlock', 'revoke_allow', 'allow', 'lock'])
  expect(events.map(e => e.at)).toEqual([...events.map(e => e.at)].sort((a, b) => b - a))

  const open = events.find(e => e.kind === 'lock' && e.dow === 0)
  expect(open).toBeTruthy()
  expect(open!.period).toBe(2)

  // An interval with no unlock must not invent an unlock event.
  expect(events.filter(e => e.kind === 'unlock')).toHaveLength(1)
  // The override events carry the week they belong to; the interval ones do not.
  expect(events.find(e => e.kind === 'allow')!.weekId).toBe('w8')
  expect(events.find(e => e.kind === 'unlock')!.weekId).toBeNull()
  expect(deviceHistoryEvents(null)).toEqual([])
  expect(deviceHistoryEvents({ intervals: [], overrides: [] })).toEqual([])
})

it('R-001 giáo viên mở được lịch sử Khóa/Mở/mở riêng ngay trên trang chính sách', () => {
  const root = render(DevicePolicyHistory, { history: historyPayload, loading: false, error: '' })
  const text = textOf(root)
  expect(text).toContain('Khóa')
  expect(text).toContain('Mở khóa')
  expect(text).toContain('Mở riêng')
  expect(text).toContain('Hủy mở riêng')
  // Timestamps, per §8 "xem lịch sử lock/unlock/override".
  expect(text).toMatch(/\d{2}:\d{2}/)
  // Slot names, so an event can be attributed to a session.
  expect(text).toContain('Thứ 4 · Tiết 3')
  expect(text).toContain('Thứ 2 · Tiết 2')
})

it('R-001 Admin có đường vào chỉ-đọc, và không có nút thao tác nào', () => {
  // Admin is redirected away from every route except /admin, /settings and
  // /homework by the router guard, so the read-only surface is an Admin tab —
  // not a second copy of the Teacher page behind a hole in that guard.
  const labels = (role: any) => visibleNavigation(role).map(item => item.label)
  expect(labels('admin')).toContain('Năm học')
  expect(labels('admin')).not.toContain('Thời khóa biểu')
  expect(labels('teacher')).toContain('Thời khóa biểu')
  for (const role of ['student', 'monitor']) expect(labels(role)).not.toContain('Thiết bị điện tử')

  const adminEntry = navigation.find(item => item.roles.includes('admin') && item.label === 'Năm học')
  expect(adminEntry?.to).toBe('/admin?tab=years')

  const root = render(AdminDevicePolicy, {
    classes: [{ id: 'c', code: '7A9', name: '7A9' } as any],
    weeks: [{ id: 'w8', number: 8 } as any],
  })
  const buttons = findAll(root, n => n.type === 'button').map(n => textOf(n).trim())
  for (const forbidden of ['Khóa từ bây giờ', 'Mở từ bây giờ', 'Mở riêng tuần này', 'Hủy mở riêng']) {
    expect(buttons).not.toContain(forbidden)
  }
  expect(textOf(root)).toContain('chỉ xem')
})
