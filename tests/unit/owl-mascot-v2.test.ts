import { describe, expect, it } from 'vitest'
import { createOwlMascotController, directionFromPoint, owlMascotV2Enabled, OWL_DIRECTIONS, OWL_REACTIONS } from '../../src/features/owl/mascot-v2'
import { buildOwlContextMessages } from '../../src/features/owl/owl-model'
import type { LegacyState, CurrentUser } from '../../src/types/legacy'

describe('pilot mascot controller', () => {
  it('covers the complete direction grid and reaction vocabulary', () => {
    expect(OWL_DIRECTIONS).toHaveLength(9)
    expect(OWL_REACTIONS).toHaveLength(9)
    expect(directionFromPoint(-80, -80)).toBe('top-left')
    expect(directionFromPoint(0, 0)).toBe('center')
    expect(directionFromPoint(80, 80)).toBe('bottom-right')
  })
  it('queues messages, preserves the active bubble and limits repeats', () => {
    let now = 1000
    const controller = createOwlMascotController(() => now, 1200)
    const low = { kind: 'tip' as const, text: 'Mẹo' }, high = { kind: 'urgent' as const, text: 'Cần xử lý', urgent: true }
    expect(controller.dispatch({ type: 'message', message: low })).toBe(true)
    expect(controller.dispatch({ type: 'message', message: high })).toBe(true)
    expect(controller.state.bubble).toEqual(low)
    expect(controller.dispatch({ type: 'message', message: high })).toBe(false)
    controller.dispatch({ type: 'close' })
    expect(controller.state.bubble).toEqual(high)
    now += 1200
    expect(controller.dispatch({ type: 'message', message: high })).toBe(true)
  })
  it('enables every known role and supports rollback', () => {
    expect(owlMascotV2Enabled('admin', 'true')).toBe(true)
    for (const role of ['teacher', 'student', 'monitor']) expect(owlMascotV2Enabled(role, 'true')).toBe(true)
    expect(owlMascotV2Enabled(undefined, 'true')).toBe(false)
    expect(owlMascotV2Enabled('unknown', 'true')).toBe(false)
    expect(owlMascotV2Enabled('admin', 'false')).toBe(false)
  })
  it('looks at a target without persistence or network IO', () => {
    const controller = createOwlMascotController()
    controller.lookAt({ getBoundingClientRect: () => ({ left: 200, top: 0, width: 40, height: 40 } as DOMRect) }, { x: 100, y: 100 })
    expect(controller.state.direction).toBe('top-right')
  })
})

describe('Device Policy context in the existing owl', () => {
  const state = { currentWeekId: 'w', weeks: [{ id: 'w', number: 5 }], registrations: [], schedule: [], users: [] } as unknown as LegacyState
  const teacher = { id: 't', role: 'teacher' } as CurrentUser
  it('uses only loaded policy rows and labels the selected week', () => {
    const messages = buildOwlContextMessages({ state, user: teacher, path: '/schedule', deviceTab: true, weekId: 'w', devicePolicySlots: [
      { weekday: 1, period_number: 1, state: 'locked', session_start: null },
      { weekday: 1, period_number: 2, state: 'allow_override', session_start: null },
    ] })
    expect(messages.find(message => message.kind === 'page')?.text).toContain('Tuần 5: 1 tiết đang khóa, 1 tiết được mở riêng')
  })
  it('does not make up policy counts before the authorized query succeeds', () => {
    const messages = buildOwlContextMessages({ state, user: teacher, path: '/schedule', deviceTab: true })
    expect(messages.find(message => message.kind === 'page')?.text).not.toContain('0 tiết')
  })
})


describe('BUG-003 Admin Owl role isolation', () => {
  const state = {
    currentWeekId: 'w',
    weeks: [{ id: 'w', number: 5, startDate: '2026-09-28', endDate: '2026-10-04' }],
    periods: [{ n: 1, start: '08:00', end: '08:45' }],
    registrations: [{
      id: 'r1',
      studentId: 's1',
      weekId: 'w',
      dow: 0,
      period: 1,
      content: 'Ôn bài',
      status: 'submitted',
    }],
    schedule: [],
    users: [{ id: 's1', role: 'student', active: true }],
  } as unknown as LegacyState
  const nowMs = new Date('2026-09-24T10:00:00+07:00').getTime()

  it('does not expose Teacher queue workload or urgent state to Admin', () => {
    const admin = { id: 'a', role: 'admin' } as CurrentUser
    const messages = buildOwlContextMessages({ state, user: admin, path: '/admin', weekId: 'w', nowMs })
    expect(messages.some(message => message.text.includes('cần giáo viên xử lý'))).toBe(false)
    expect(messages.some(message => message.urgent)).toBe(false)
    expect(messages.some(message => message.text.includes('Quản trị lớp, giáo viên và phân quyền'))).toBe(true)
  })

  it('preserves the Teacher queue reminder for the same state', () => {
    const teacher = { id: 't', role: 'teacher' } as CurrentUser
    const messages = buildOwlContextMessages({ state, user: teacher, path: '/review', weekId: 'w', nowMs })
    expect(messages.some(message => message.text.includes('còn 1 đăng ký cần giáo viên xử lý'))).toBe(true)
    expect(messages.some(message => message.urgent)).toBe(true)
  })

  it('keeps Admin device guidance read-only without Teacher workload', () => {
    const admin = { id: 'a', role: 'admin' } as CurrentUser
    const messages = buildOwlContextMessages({ state, user: admin, path: '/admin', weekId: 'w', nowMs, deviceTab: true })
    expect(messages.some(message => message.text.includes('Admin chỉ có quyền xem'))).toBe(true)
    expect(messages.some(message => message.text.includes('cần giáo viên xử lý'))).toBe(false)
    expect(messages.some(message => message.urgent)).toBe(false)
  })
})
