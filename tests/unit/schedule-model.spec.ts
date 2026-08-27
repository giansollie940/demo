import { describe, expect, it } from 'vitest'
import {
  applyDefaultSchedule,
  applyWeekSchedule,
  createWeekScheduleDraft,
  diffSchedule,
  effectiveScheduleForWeek,
  normalizeScheduleSlots,
  resetWeekSchedule,
} from '../../src/features/schedule/schedule-model'
import type { LegacyState, PeriodRecord, ScheduleSlot } from '../../src/types/legacy'

const periods: PeriodRecord[] = [
  { n: 1, start: '07:00', end: '07:40' },
  { n: 2, start: '07:45', end: '08:25' },
  { n: 3, start: '08:30', end: '09:10' },
]

function stateFixture(): LegacyState {
  return {
    version: 1,
    activeSchoolYearId: 'year-1',
    selectedSchoolYearId: 'year-1',
    availableSchoolYears: [{ id: 'year-1', name: '2026–2027', startDate: '2026-08-24', endDate: '2027-05-30', active: true }],
    activeClassId: 'class-1',
    availableClasses: [{ id: 'class-1', code: '7A1', name: '7A1', active: true }],
    settings: {},
    users: [],
    weeks: [
      { id: 'week-1', number: 1, startDate: '2026-08-24', endDate: '2026-08-30' },
      { id: 'week-2', number: 2, startDate: '2026-08-31', endDate: '2026-09-06' },
    ],
    periods,
    schedule: [{ dow: 0, period: 1 }, { dow: 2, period: 2 }],
    overrides: [
      { id: 'override-1', classId: 'class-1', weekId: 'week-1', dow: 1, period: 2, active: true },
      { id: 'override-2', classId: 'class-1', weekId: 'week-2', dow: 4, period: 3, active: true },
    ],
    registrations: [],
    notifications: [],
    currentWeekId: 'week-1',
  }
}

describe('normalizeScheduleSlots', () => {
  it('deduplicates and sorts without mutating the input', () => {
    const input: ScheduleSlot[] = [
      { dow: 2, period: 3 },
      { dow: 0, period: 1 },
      { dow: 2, period: 3 },
    ]
    const snapshot = structuredClone(input)

    expect(normalizeScheduleSlots(input, periods)).toEqual([
      { dow: 0, period: 1 },
      { dow: 2, period: 3 },
    ])
    expect(input).toEqual(snapshot)
  })

  it('rejects an empty schedule', () => {
    expect(() => normalizeScheduleSlots([], periods)).toThrow('Thời khóa biểu phải có ít nhất một tiết.')
  })

  it('rejects a day outside Monday through Friday', () => {
    expect(() => normalizeScheduleSlots([{ dow: 5, period: 1 }], periods)).toThrow('Ngày học không hợp lệ.')
  })

  it('rejects a period missing from the class period list', () => {
    expect(() => normalizeScheduleSlots([{ dow: 0, period: 9 }], periods)).toThrow('Tiết học không tồn tại.')
  })
})

describe('effective schedule', () => {
  it('uses the default schedule when a week has no override', () => {
    const state = stateFixture()
    state.overrides = state.overrides.filter(row => row.weekId !== 'week-1')
    expect(effectiveScheduleForWeek(state, 'week-1')).toEqual([
      { dow: 0, period: 1 },
      { dow: 2, period: 2 },
    ])
  })

  it('uses only active rows from a week-specific override', () => {
    const state = stateFixture()
    state.overrides.push({ classId: 'class-1', weekId: 'week-1', dow: 3, period: 1, active: false })
    expect(effectiveScheduleForWeek(state, 'week-1')).toEqual([{ dow: 1, period: 2 }])
    expect(createWeekScheduleDraft(state, 'week-1')).toEqual([{ dow: 1, period: 2 }])
  })
})

describe('immutable schedule application', () => {
  it('updates the default schedule without changing any override', () => {
    const source = stateFixture()
    const originalOverrides = structuredClone(source.overrides)
    const next = applyDefaultSchedule(source, [{ dow: 4, period: 1 }])

    expect(next.schedule).toEqual([{ dow: 4, period: 1 }])
    expect(next.overrides).toEqual(originalOverrides)
    expect(source.schedule).toEqual([{ dow: 0, period: 1 }, { dow: 2, period: 2 }])
  })

  it('replaces only the selected week schedule', () => {
    const source = stateFixture()
    const next = applyWeekSchedule(source, 'class-1', 'week-1', [
      { dow: 3, period: 2 },
      { dow: 0, period: 1 },
    ])

    expect(next.overrides.filter(row => row.weekId === 'week-1')).toEqual([
      { classId: 'class-1', weekId: 'week-1', dow: 0, period: 1, active: true },
      { classId: 'class-1', weekId: 'week-1', dow: 3, period: 2, active: true },
    ])
    expect(next.overrides.filter(row => row.weekId === 'week-2')).toEqual([
      { id: 'override-2', classId: 'class-1', weekId: 'week-2', dow: 4, period: 3, active: true },
    ])
    expect(source.overrides).toHaveLength(2)
  })

  it('resets only the selected week to the default schedule', () => {
    const source = stateFixture()
    const next = resetWeekSchedule(source, 'week-1')

    expect(next.overrides).toEqual([
      { id: 'override-2', classId: 'class-1', weekId: 'week-2', dow: 4, period: 3, active: true },
    ])
    expect(effectiveScheduleForWeek(next, 'week-1')).toEqual(source.schedule)
  })
})

describe('schedule difference', () => {
  it('reports literal added and removed slots', () => {
    expect(diffSchedule(
      [{ dow: 0, period: 1 }, { dow: 1, period: 2 }],
      [{ dow: 0, period: 1 }, { dow: 3, period: 3 }],
    )).toEqual({
      added: [{ dow: 3, period: 3 }],
      removed: [{ dow: 1, period: 2 }],
    })
  })
})
