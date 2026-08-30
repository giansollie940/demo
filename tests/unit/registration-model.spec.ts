import { describe, expect, it } from 'vitest'
import {
  deadlineForSlot,
  deriveRegistrationEligibility,
  effectiveRegistrationStatus,
  matchesApprovalFilter,
  registrationManagerActions,
} from '../../src/features/registrations/registration-model'
import type { PeriodRecord, RegistrationRecord, WeekRecord } from '../../src/types/legacy'

const week: WeekRecord = {
  id: 'week-1', number: 1, startDate: '2026-08-24', endDate: '2026-08-30',
  status: 'open', deadlineMode: 'per_session_20',
}
const periods: PeriodRecord[] = [{ n: 1, start: '07:00', end: '07:40' }]
const baseRegistration: RegistrationRecord = {
  id: 'reg-1', studentId: 'student-1', weekId: 'week-1', dow: 0, period: 1,
  content: 'Ôn Toán', status: 'submitted', aiReviewStatus: 'not_needed',
}
const at = (iso: string) => new Date(iso).getTime()

describe('registration deadline and eligibility', () => {
  it('derives the per-session deadline on the previous evening', () => {
    expect(deadlineForSlot({ week, dow: 0, deadlineTime: '20:00' })).toBe('2026-08-23T20:00')
  })

  it('allows a new regular registration before deadline and session start', () => {
    const result = deriveRegistrationEligibility({
      week, dow: 0, period: 1, periods, deadlineTime: '20:00',
      registration: null, effectiveWeekStatus: 'open', nowMs: at('2026-08-23T19:00:00+07:00'),
    })
    expect(result).toMatchObject({ regularNewAllowed: true, editable: false, emergencyAllowed: false, started: false, pastDeadline: false })
  })

  it('opens emergency registration only after deadline and before session', () => {
    const result = deriveRegistrationEligibility({
      week, dow: 0, period: 1, periods, deadlineTime: '20:00',
      registration: null, effectiveWeekStatus: 'open', nowMs: at('2026-08-23T21:00:00+07:00'),
    })
    expect(result).toMatchObject({ regularNewAllowed: false, emergencyAllowed: true, started: false, pastDeadline: true })
  })

  it('allows approved edits only before deadline', () => {
    const registration = { ...baseRegistration, status: 'approved' }
    expect(deriveRegistrationEligibility({
      week, dow: 0, period: 1, periods, deadlineTime: '20:00', registration,
      effectiveWeekStatus: 'open', nowMs: at('2026-08-23T19:00:00+07:00'),
    }).editable).toBe(true)
    expect(deriveRegistrationEligibility({
      week, dow: 0, period: 1, periods, deadlineTime: '20:00', registration,
      effectiveWeekStatus: 'open', nowMs: at('2026-08-23T21:00:00+07:00'),
    }).editable).toBe(false)
  })

  it('allows needs-revision edits after deadline until the session starts', () => {
    const registration = { ...baseRegistration, status: 'needs_revision' }
    const before = deriveRegistrationEligibility({
      week, dow: 0, period: 1, periods, deadlineTime: '20:00', registration,
      effectiveWeekStatus: 'open', nowMs: at('2026-08-24T06:59:00+07:00'),
    })
    const after = deriveRegistrationEligibility({
      week, dow: 0, period: 1, periods, deadlineTime: '20:00', registration,
      effectiveWeekStatus: 'open', nowMs: at('2026-08-24T07:00:00+07:00'),
    })
    expect(before).toMatchObject({ editable: true, reported: false })
    expect(after).toMatchObject({ editable: false, reported: true, started: true })
    expect(effectiveRegistrationStatus(registration, { week, periods, nowMs: at('2026-08-24T07:00:00+07:00') })).toBe('revision_overdue')
  })

  it('denies new registration for upcoming weeks or started sessions', () => {
    expect(deriveRegistrationEligibility({
      week, dow: 0, period: 1, periods, deadlineTime: '20:00', registration: null,
      effectiveWeekStatus: 'upcoming', nowMs: at('2026-08-23T19:00:00+07:00'),
    }).regularNewAllowed).toBe(false)
    expect(deriveRegistrationEligibility({
      week, dow: 0, period: 1, periods, deadlineTime: '20:00', registration: null,
      effectiveWeekStatus: 'open', nowMs: at('2026-08-24T07:01:00+07:00'),
    }).emergencyAllowed).toBe(false)
  })
})

describe('teacher action model', () => {
  it('blocks approval while AI is pending and allows it when manual review is ready', () => {
    expect(registrationManagerActions({
      registration: { ...baseRegistration, aiReviewStatus: 'pending' }, week, periods,
      nowMs: at('2026-08-23T19:00:00+07:00'),
    }).canApprove).toBe(false)
    expect(registrationManagerActions({
      registration: baseRegistration, week, periods,
      nowMs: at('2026-08-23T19:00:00+07:00'),
    }).canApprove).toBe(true)
  })

  it('allows revision requests before session start and always allows comments/deletion', () => {
    const actions = registrationManagerActions({
      registration: { ...baseRegistration, status: 'approved' }, week, periods,
      nowMs: at('2026-08-24T06:59:00+07:00'),
    })
    expect(actions).toMatchObject({ canRequestRevision: true, canComment: true, canDelete: true })
  })

  it('matches approval filters using effective status', () => {
    const options = { week, periods, nowMs: at('2026-08-23T19:00:00+07:00') }
    expect(matchesApprovalFilter(baseRegistration, 'attention', options)).toBe(true)
    expect(matchesApprovalFilter({ ...baseRegistration, status: 'approved' }, 'approved', options)).toBe(true)
    expect(matchesApprovalFilter({ ...baseRegistration, status: 'needs_revision' }, 'revision', options)).toBe(true)
    expect(matchesApprovalFilter(baseRegistration, 'all', options)).toBe(true)
  })
})
