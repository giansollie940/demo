import { describe, expect, it } from 'vitest'
import {
  canRecordLate, canRevokeLate, clampLateThreshold, conductOverview, lateForSession, studentLateSummary,
  type LateTrackingData,
} from '../../src/features/tracking/late-model'
import type { CurrentUser } from '../../src/types/legacy'

const user = (id: string, name: string, role: CurrentUser['role'] = 'student'): CurrentUser =>
  ({ id, code: id.toUpperCase(), name, role, classId: 'c1', active: true })
const late = (id: string, studentId: string, extra: Partial<LateTrackingData['lates'][number]> = {}) =>
  ({ id, studentId, weekId: 'w1', dow: 0, period: 1, recordedAt: `2026-10-${10 + id.length}T08:00:00Z`, recordedBy: 'm1', conductCaseId: null, ...extra })
const conductCase = (id: string, studentId: string, extra: Partial<LateTrackingData['cases'][number]> = {}) =>
  ({ id, studentId, threshold: 3, createdAt: '2026-10-20T08:00:00Z', resolvedAt: null, resolvedBy: null, resolutionNote: null, ...extra })

const data: LateTrackingData = {
  available: true,
  threshold: 3,
  lates: [
    late('l1', 'an', { conductCaseId: 'k1' }), late('l2', 'an', { conductCaseId: 'k1' }), late('l3', 'an', { conductCaseId: 'k1' }),
    late('l4', 'an', { dow: 2 }), late('l5', 'binh', { dow: 1, period: 2 }), late('l6', 'binh', { dow: 3 }),
  ],
  cases: [conductCase('k1', 'an'), conductCase('k0', 'binh', { resolvedAt: '2026-10-21T08:00:00Z', createdAt: '2026-10-01T08:00:00Z' })],
}

describe('studentLateSummary', () => {
  it('counts only late registrations not yet turned into a conduct case', () => {
    expect(studentLateSummary(data, 'an')).toMatchObject({ pending: 1, threshold: 3, resolvedCases: 0 })
    expect(studentLateSummary(data, 'an').openCases.map(c => c.id)).toEqual(['k1'])
    expect(studentLateSummary(data, 'binh')).toMatchObject({ pending: 2, openCases: [], resolvedCases: 1 })
    expect(studentLateSummary(data, 'chi')).toMatchObject({ pending: 0, openCases: [], resolvedCases: 0 })
  })
})

describe('lateForSession', () => {
  it('finds the late registration of one student in one session', () => {
    expect(lateForSession(data.lates, 'binh', 'w1', { dow: 1, period: 2 })?.id).toBe('l5')
    expect(lateForSession(data.lates, 'binh', 'w1', { dow: 1, period: 1 })).toBeNull()
    expect(lateForSession(data.lates, 'binh', 'w2', { dow: 1, period: 2 })).toBeNull()
  })
})

describe('canRecordLate', () => {
  const base = { actorRole: 'monitor' as const, actorId: 'm1', studentId: 'an', bucket: 'missing' as const, started: true, alreadyRecorded: false }
  it('lets monitors and teachers record a verbal registration once the session has started', () => {
    expect(canRecordLate(base)).toBe(true)
    expect(canRecordLate({ ...base, actorRole: 'teacher' })).toBe(true)
    expect(canRecordLate({ ...base, actorRole: 'admin' })).toBe(true)
  })
  it('refuses before the session starts, for registered students, twice, for students, and for the monitor themself', () => {
    expect(canRecordLate({ ...base, started: false })).toBe(false)
    expect(canRecordLate({ ...base, bucket: 'registered' })).toBe(false)
    expect(canRecordLate({ ...base, alreadyRecorded: true })).toBe(false)
    expect(canRecordLate({ ...base, actorRole: 'student' })).toBe(false)
    expect(canRecordLate({ ...base, studentId: 'm1' })).toBe(false)
    expect(canRecordLate({ ...base, actorRole: 'teacher', studentId: 'm1' })).toBe(true)
  })
})

describe('canRevokeLate', () => {
  it('allows undoing a mistaken record until it has been counted', () => {
    expect(canRevokeLate(late('x', 'an'), 'monitor', 'm1')).toBe(true)
    expect(canRevokeLate(late('x', 'an', { conductCaseId: 'k1' }), 'teacher', 't1')).toBe(false)
    expect(canRevokeLate(late('x', 'm1'), 'monitor', 'm1')).toBe(false)
    expect(canRevokeLate(late('x', 'an'), 'student', 'an')).toBe(false)
  })
})

describe('conductOverview', () => {
  it('lists open cases oldest first and students with pending lates, most first', () => {
    const users = [user('an', 'Lê An'), user('binh', 'Trần Bình'), user('chi', 'Ngô Chi')]
    const overview = conductOverview(data, users)
    expect(overview.openCases.map(row => [row.case.id, row.user?.name, row.lateCount])).toEqual([['k1', 'Lê An', 3]])
    expect(overview.pending.map(row => [row.user.name, row.pending])).toEqual([['Trần Bình', 2], ['Lê An', 1]])
    expect(overview.resolvedCases.map(row => row.case.id)).toEqual(['k0'])
  })
})

describe('clampLateThreshold', () => {
  it('keeps the threshold a whole number from 1 to 20, defaulting to 3', () => {
    expect(clampLateThreshold(4)).toBe(4)
    expect(clampLateThreshold('5')).toBe(5)
    expect(clampLateThreshold(0)).toBe(1)
    expect(clampLateThreshold(99)).toBe(20)
    expect(clampLateThreshold('abc')).toBe(3)
    expect(clampLateThreshold(2.6)).toBe(3)
  })
})
