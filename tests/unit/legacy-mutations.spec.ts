import { describe, expect, it } from 'vitest'
import {
  commitStateMutation,
  type LegacyMutationRuntime,
} from '../../src/features/shared/legacy-mutation'
import {
  resetWeekScheduleMutation,
  saveDefaultScheduleMutation,
  saveWeekScheduleMutation,
} from '../../src/features/schedule/schedule-mutations'
import {
  rebaseWeekCalendarMutation,
  saveWeekSettingsMutation,
} from '../../src/features/weeks/week-mutations'
import { buildWeekDrafts } from '../../src/features/weeks/week-editor-model'
import type { CurrentUser, LegacyState } from '../../src/types/legacy'

function stateFixture(): LegacyState {
  return {
    version: 1,
    activeSchoolYearId: 'year-1',
    selectedSchoolYearId: 'year-1',
    availableSchoolYears: [{ id: 'year-1', name: '2026–2027', startDate: '2026-08-24', endDate: '2027-05-30', active: true }],
    activeClassId: 'class-1',
    availableClasses: [{ id: 'class-1', code: '7A1', name: '7A1', active: true }],
    settings: { registrationDeadlineTime: '20:00' },
    users: [],
    weeks: [
      { id: 'week-1', number: 1, startDate: '2026-08-24', endDate: '2026-08-30', status: 'open' },
      { id: 'week-2', number: 2, startDate: '2026-08-31', endDate: '2026-09-06', status: 'open' },
    ],
    periods: [
      { n: 1, start: '07:00', end: '07:40' },
      { n: 2, start: '07:45', end: '08:25' },
    ],
    schedule: [{ dow: 0, period: 1 }],
    overrides: [
      { classId: 'class-1', weekId: 'week-1', dow: 1, period: 1, active: true },
      { classId: 'class-1', weekId: 'week-2', dow: 2, period: 2, active: true },
    ],
    registrations: [{
      id: 'reg-1', studentId: 'student-1', weekId: 'week-1', dow: 0, period: 1,
      content: 'Toán', status: 'submitted',
    }],
    notifications: [],
    currentWeekId: 'week-1',
  }
}

function userFixture(role: CurrentUser['role'] = 'teacher'): CurrentUser {
  return { id: `${role}-1`, code: role, name: role, role, classId: 'class-1', active: true }
}

function runtimeFixture(role: CurrentUser['role'] = 'teacher') {
  let canonical = stateFixture()
  let failSync = false
  const events: string[] = []
  const runtime: LegacyMutationRuntime = {
    service: {
      async syncState(next) {
        events.push('sync')
        if (failSync) throw new Error('network down')
        canonical = structuredClone(next)
      },
      async teacherRebaseWeeks() {
        events.push('rebase')
      },
    },
    currentUser: userFixture(role),
    getState: () => canonical,
    async reload() {
      events.push('reload')
      return structuredClone(canonical)
    },
    hydrate() {
      events.push('hydrate')
    },
    async invalidate() {
      events.push('invalidate')
    },
  }
  return {
    runtime,
    events,
    getCanonical: () => structuredClone(canonical),
    setFailSync: (value: boolean) => { failSync = value },
  }
}

describe('legacy mutation runtime', () => {
  it('syncs, reloads, hydrates, and invalidates in order without mutating source', async () => {
    const fixture = runtimeFixture()
    const source = fixture.getCanonical()
    await commitStateMutation(fixture.runtime, 'class-1', state => ({ ...state, version: 2 }))
    expect(fixture.events).toEqual(['sync', 'reload', 'hydrate', 'invalidate'])
    expect(source.version).toBe(1)
    expect(fixture.getCanonical().version).toBe(2)
  })

  it('does not reload or invalidate after sync failure', async () => {
    const fixture = runtimeFixture()
    fixture.setFailSync(true)
    await expect(commitStateMutation(
      fixture.runtime,
      'class-1',
      state => ({ ...state, version: 2 }),
    )).rejects.toThrow('network down')
    expect(fixture.events).toEqual(['sync'])
  })
})

describe('schedule mutations', () => {
  it('saves default schedule without changing any week override', async () => {
    const fixture = runtimeFixture()
    const overrides = fixture.getCanonical().overrides
    await saveDefaultScheduleMutation(fixture.runtime, 'class-1', [{ dow: 4, period: 2 }])
    expect(fixture.getCanonical().schedule).toEqual([{ dow: 4, period: 2 }])
    expect(fixture.getCanonical().overrides).toEqual(overrides)
  })

  it('saves one week schedule while preserving other weeks and registrations', async () => {
    const fixture = runtimeFixture()
    const registrations = fixture.getCanonical().registrations
    await saveWeekScheduleMutation(
      fixture.runtime,
      'class-1',
      'week-1',
      [{ dow: 3, period: 2 }],
    )
    expect(fixture.getCanonical().overrides).toEqual([
      { classId: 'class-1', weekId: 'week-2', dow: 2, period: 2, active: true },
      { classId: 'class-1', weekId: 'week-1', dow: 3, period: 2, active: true },
    ])
    expect(fixture.getCanonical().registrations).toEqual(registrations)
  })

  it('resets only the selected week schedule', async () => {
    const fixture = runtimeFixture()
    await resetWeekScheduleMutation(fixture.runtime, 'class-1', 'week-1')
    expect(fixture.getCanonical().overrides).toEqual([
      { classId: 'class-1', weekId: 'week-2', dow: 2, period: 2, active: true },
    ])
  })
})

describe('week mutations', () => {
  it('saves week drafts without changing schedule or registrations', async () => {
    const fixture = runtimeFixture()
    const before = fixture.getCanonical()
    const drafts = buildWeekDrafts(before.weeks)
    drafts[0].holiday = true
    await saveWeekSettingsMutation(fixture.runtime, 'class-1', drafts)
    expect(fixture.getCanonical().weeks[0].status).toBe('holiday')
    expect(fixture.getCanonical().schedule).toEqual(before.schedule)
    expect(fixture.getCanonical().registrations).toEqual(before.registrations)
  })

  it('rejects calendar rebase for teachers before calling the bridge', async () => {
    const fixture = runtimeFixture('teacher')
    await expect(rebaseWeekCalendarMutation(
      fixture.runtime,
      'class-1',
      '2026-08-24',
      '20:00',
    )).rejects.toThrow('Chỉ quản trị viên được đổi mốc Tuần 1.')
    expect(fixture.events).toEqual([])
  })

  it('rebases for admin then reloads canonical state', async () => {
    const fixture = runtimeFixture('admin')
    await rebaseWeekCalendarMutation(fixture.runtime, 'class-1', '2026-08-24', '20:00')
    expect(fixture.events).toEqual(['rebase', 'reload', 'hydrate', 'invalidate'])
  })
})
