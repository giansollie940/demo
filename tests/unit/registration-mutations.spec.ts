import { describe, expect, it } from 'vitest'
import {
  cancelEmergencyRegistration,
  createEmergencyRegistrationWithAi,
  saveRegistrationMutation,
  submitRegistrationWithAi,
  type RegistrationMutationRuntime,
} from '../../src/features/registrations/registration-mutations'
import type { CurrentUser, LegacyState, RegistrationRecord } from '../../src/types/legacy'

function stateFixture(): LegacyState {
  return {
    version: 1,
    activeSchoolYearId: 'year-1', selectedSchoolYearId: 'year-1', availableSchoolYears: [{ id: 'year-1', name: '2026–2027', startDate: '2026-08-24', endDate: '2027-05-30', active: true }], activeClassId: 'class-1', availableClasses: [], settings: {}, users: [],
    weeks: [{ id: 'week-1', number: 1, startDate: '2026-08-24', endDate: '2026-08-30' }],
    periods: [{ n: 1, start: '07:00', end: '07:40' }], schedule: [{ dow: 0, period: 1 }], overrides: [],
    registrations: [], notifications: [], currentWeekId: 'week-1',
  }
}

function userFixture(): CurrentUser {
  return { id: 'student-1', code: 'HS01', name: 'Nguyễn An', role: 'student', classId: 'class-1', active: true }
}

function runtimeFixture() {
  let canonical = stateFixture()
  let aiFails = false
  const events: string[] = []
  const service = {
    async syncState(next: LegacyState) {
      events.push('sync')
      canonical = structuredClone(next)
      for (const row of canonical.registrations) {
        if (row.status === 'submitted' && !['pending', 'processing'].includes(row.aiReviewStatus ?? '')) {
          row.aiReviewStatus = 'pending'
        }
      }
    },
    async teacherRebaseWeeks() { return {} },
    async requestAiReview(id: string) {
      events.push('ai')
      if (aiFails) throw new Error('ai unavailable')
      const row = canonical.registrations.find(item => item.id === id)
      if (row) Object.assign(row, { status: 'approved', approvalSource: 'ai', aiReviewStatus: 'completed', aiConfidence: .96 })
      return { ok: true }
    },
    async emergencyRegister(input: { weekId: string; dow: number; period: number; content: string; note?: string; reason: string; usesElectronicDevice?: boolean }) {
      events.push('emergency')
      const row: RegistrationRecord = {
        id: 'emergency-1', studentId: 'student-1', weekId: input.weekId, dow: input.dow,
        period: input.period, content: input.content, note: input.note, status: 'submitted',
        isEmergency: true, emergencyReason: input.reason, aiReviewStatus: 'pending',
      }
      canonical.registrations.push(row)
      return structuredClone(row)
    },
    async deleteRegistration(id: string) {
      events.push('delete')
      canonical.registrations = canonical.registrations.filter(row => row.id !== id)
      return true
    },
  }
  const runtime: RegistrationMutationRuntime = {
    service,
    currentUser: userFixture(),
    getState: () => canonical,
    async reload() { events.push('reload'); return structuredClone(canonical) },
    hydrate() { events.push('hydrate') },
    async invalidate() { events.push('invalidate') },
  }
  return { runtime, events, getState: () => structuredClone(canonical), setAiFails: (value: boolean) => { aiFails = value } }
}

const input = {
  classId: 'class-1', weekId: 'week-1', dow: 0, period: 1,
  content: 'Ôn phương trình', note: 'Bài 1–5', usesElectronicDevice: false,
} as const

describe('regular registration mutation', () => {
  it('saves a draft without mutating the source object', async () => {
    const fixture = runtimeFixture()
    const source = fixture.getState()
    const result = await saveRegistrationMutation(fixture.runtime, { ...input, status: 'draft' }, 1000)
    expect(result.registration).toMatchObject({ content: 'Ôn phương trình', status: 'draft' })
    expect(source.registrations).toEqual([])
    expect(fixture.events).toEqual(['sync', 'reload', 'hydrate', 'invalidate'])
  })

  it('resubmits an approved edit and clears prior approval and AI fields', async () => {
    const fixture = runtimeFixture()
    fixture.runtime.getState().registrations.push({
      id: 'reg-1', studentId: 'student-1', weekId: 'week-1', dow: 0, period: 1,
      content: 'Cũ', status: 'approved', approvalSource: 'ai', approvedAt: 500,
      aiReviewStatus: 'completed', aiDecision: 'approve', aiConfidence: .98, aiReason: 'Tốt',
    })
    const result = await saveRegistrationMutation(fixture.runtime, { ...input, status: 'submitted' }, 2000)
    expect(result.registration).toMatchObject({
      id: 'reg-1', status: 'submitted', approvalSource: 'manual', approvedAt: null,
      aiReviewStatus: 'pending', aiDecision: '', aiConfidence: null, aiReason: '',
    })
  })

  it('re-runs AI after a student resubmits a teacher revision request', async () => {
    const fixture = runtimeFixture()
    fixture.runtime.getState().registrations.push({
      id: 'reg-revision', studentId: 'student-1', weekId: 'week-1', dow: 0, period: 1,
      content: 'Cũ', status: 'needs_revision', teacherComment: 'Ghi rõ nội dung cần ôn.',
      approvalSource: 'ai', aiReviewStatus: 'approved', aiReason: 'AI từng duyệt trước đó',
    })
    const result = await submitRegistrationWithAi(fixture.runtime, input, 2500)
    expect(result.aiAttempted).toBe(true)
    expect(result.registration).toMatchObject({ status: 'approved', approvalSource: 'ai' })
    expect(result.registration.teacherComment).toBe('Ghi rõ nội dung cần ôn.')
  })

  it('runs pending AI review and returns canonical AI approval', async () => {
    const fixture = runtimeFixture()
    const result = await submitRegistrationWithAi(fixture.runtime, input, 3000)
    expect(result).toMatchObject({ aiAttempted: true, aiError: null })
    expect(result.registration).toMatchObject({ status: 'approved', approvalSource: 'ai', aiConfidence: .96 })
    expect(fixture.events).toEqual(['sync', 'reload', 'hydrate', 'invalidate', 'ai', 'reload', 'hydrate', 'invalidate'])
  })

  it('keeps the saved registration when AI fails', async () => {
    const fixture = runtimeFixture()
    fixture.setAiFails(true)
    const result = await submitRegistrationWithAi(fixture.runtime, input, 4000)
    expect(result.aiAttempted).toBe(true)
    expect(result.aiError).toBe('ai unavailable')
    expect(result.registration.status).toBe('submitted')
    expect(fixture.getState().registrations).toHaveLength(1)
  })
})

describe('emergency registration orchestration', () => {
  it('requires a meaningful reason before calling the bridge', async () => {
    const fixture = runtimeFixture()
    await expect(createEmergencyRegistrationWithAi(fixture.runtime, {
      ...input, reason: 'quên',
    })).rejects.toThrow('Hãy ghi lý do cần đăng ký bổ sung.')
    expect(fixture.events).toEqual([])
  })

  it('creates emergency registration, runs AI, and reloads canonical state', async () => {
    const fixture = runtimeFixture()
    const result = await createEmergencyRegistrationWithAi(fixture.runtime, {
      ...input, reason: 'Em quên xác nhận trước hạn.',
    })
    expect(result.registration).toMatchObject({ isEmergency: true, status: 'approved' })
    expect(fixture.events).toEqual(['emergency', 'ai', 'reload', 'hydrate', 'invalidate'])
  })

  it('cancels only an emergency registration', async () => {
    const fixture = runtimeFixture()
    fixture.runtime.getState().registrations.push({
      id: 'normal-1', studentId: 'student-1', weekId: 'week-1', dow: 0, period: 1,
      content: 'Thường', status: 'submitted', isEmergency: false,
    })
    await expect(cancelEmergencyRegistration(fixture.runtime, 'class-1', 'normal-1')).rejects.toThrow('Chỉ có thể hủy đăng ký bổ sung.')
    fixture.runtime.getState().registrations[0].isEmergency = true
    await cancelEmergencyRegistration(fixture.runtime, 'class-1', 'normal-1')
    expect(fixture.getState().registrations).toEqual([])
  })
})
