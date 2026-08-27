import { describe, expect, it } from 'vitest'
import {
  applyWeekDrafts,
  buildWeekDrafts,
  summarizeWeekStatuses,
  validateWeek1Start,
  validateWeekDrafts,
  type WeekEditorDraft,
} from '../../src/features/weeks/week-editor-model'
import type { LegacyState, WeekRecord } from '../../src/types/legacy'

const weeks: WeekRecord[] = [
  {
    id: 'week-1',
    number: 1,
    startDate: '2026-08-24',
    endDate: '2026-08-30',
    status: 'open',
    deadlineMode: 'per_session_20',
    note: 'Tuần đầu',
  },
  {
    id: 'week-2',
    number: 2,
    startDate: '2026-08-31',
    endDate: '2026-09-06',
    status: 'holiday',
    deadlineMode: 'specific',
    deadline: '2026-08-29T19:30',
  },
]

function stateFixture(): LegacyState {
  return {
    version: 1,
    activeSchoolYearId: 'year-1',
    selectedSchoolYearId: 'year-1',
    availableSchoolYears: [{ id: 'year-1', name: '2026–2027', startDate: '2026-08-24', endDate: '2027-05-30', active: true }],
    activeClassId: 'class-1',
    availableClasses: [],
    settings: {},
    users: [],
    weeks: structuredClone(weeks),
    periods: [],
    schedule: [],
    overrides: [],
    registrations: [],
    notifications: [],
    currentWeekId: 'week-1',
  }
}

describe('week editor drafts', () => {
  it('maps persisted week settings into editable drafts', () => {
    expect(buildWeekDrafts(weeks)).toEqual([
      {
        id: 'week-1', number: 1, startDate: '2026-08-24', endDate: '2026-08-30',
        holiday: false, manualStatus: null, deadlineMode: 'per_session_20', deadline: '', note: 'Tuần đầu',
      },
      {
        id: 'week-2', number: 2, startDate: '2026-08-31', endDate: '2026-09-06',
        holiday: true, manualStatus: null, deadlineMode: 'specific', deadline: '2026-08-29T19:30', note: '',
      },
    ])
  })

  it('requires a valid datetime for specific deadline mode', () => {
    const drafts = buildWeekDrafts(weeks)
    drafts[0].deadlineMode = 'specific'
    expect(() => validateWeekDrafts(drafts)).toThrow('Tuần 1 dùng hạn cụ thể phải có ngày và giờ.')
    drafts[0].deadline = 'không-hợp-lệ'
    expect(() => validateWeekDrafts(drafts)).toThrow('Deadline của Tuần 1 không hợp lệ.')
  })

  it('clears inactive specific deadline while preserving unrelated state', () => {
    const source = stateFixture()
    const drafts = buildWeekDrafts(source.weeks)
    drafts[1].holiday = false
    drafts[1].deadlineMode = 'per_session_20'
    const next = applyWeekDrafts(source, drafts)

    expect(next.weeks[1].status).not.toBe('holiday')
    expect(next.weeks[1].deadlineMode).toBe('per_session_20')
    expect(next.weeks[1].deadline).toBe('')
    expect(source.weeks[1].status).toBe('holiday')
    expect(next.registrations).toEqual(source.registrations)
  })

  it('persists holiday and specific deadline on the matching week only', () => {
    const source = stateFixture()
    const drafts = buildWeekDrafts(source.weeks)
    drafts[0].holiday = true
    drafts[0].deadlineMode = 'specific'
    drafts[0].deadline = '2026-08-23T20:00'
    const next = applyWeekDrafts(source, drafts)

    expect(next.weeks[0]).toMatchObject({
      status: 'holiday',
      deadlineMode: 'specific',
      deadline: '2026-08-23T20:00',
    })
    expect(next.weeks[1].deadline).toBe('2026-08-29T19:30')
  })
})

describe('week calendar validation', () => {
  it('accepts Monday and rejects other or malformed dates', () => {
    expect(() => validateWeek1Start('2026-08-24')).not.toThrow()
    expect(() => validateWeek1Start('2026-08-25')).toThrow('Ngày bắt đầu Tuần 1 phải là Thứ Hai.')
    expect(() => validateWeek1Start('')).toThrow('Hãy chọn ngày bắt đầu Tuần 1.')
    expect(() => validateWeek1Start('2026-99-99')).toThrow('Ngày bắt đầu Tuần 1 không hợp lệ.')
  })
})

describe('week status summary', () => {
  it('counts explicit holidays before operational statuses', () => {
    const drafts: WeekEditorDraft[] = buildWeekDrafts(weeks)
    expect(summarizeWeekStatuses(drafts, {
      'week-1': 'open',
      'week-2': 'open',
    })).toEqual({ open: 1, locked: 0, upcoming: 0, holiday: 1 })
  })
})
