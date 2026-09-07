import type { LegacyState, WeekRecord } from '../../types/legacy'

export type WeekOperationalStatus = 'open' | 'locked' | 'upcoming'
export type WeekStatusSummary = Record<WeekOperationalStatus | 'holiday', number>

export interface WeekEditorDraft {
  id: string
  number: number
  startDate: string
  endDate: string
  holiday: boolean
  manualStatus: 'open' | 'locked' | null
  deadlineMode: 'per_session_20' | 'specific'
  deadline: string
  note: string
}

export function buildWeekDrafts(weeks: WeekRecord[]): WeekEditorDraft[] {
  return weeks.map(week => ({
    id: week.id,
    number: Number(week.number),
    startDate: week.startDate,
    endDate: week.endDate,
    holiday: week.status === 'holiday',
    manualStatus: week.manualStatus??null,
    deadlineMode: week.deadlineMode === 'specific' ? 'specific' : 'per_session_20',
    deadline: week.deadline ?? '',
    note: week.note ?? '',
  }))
}

function isValidLocalDateTime(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}:00+07:00`).getTime()
  return Number.isFinite(parsed)
}

export function validateWeekDrafts(drafts: WeekEditorDraft[]): void {
  for (const draft of drafts) {
    if (draft.deadlineMode !== 'specific') continue
    if (!draft.deadline) {
      throw new Error(`Tuần ${draft.number} dùng hạn cụ thể phải có ngày và giờ.`)
    }
    if (!isValidLocalDateTime(draft.deadline)) {
      throw new Error(`Deadline của Tuần ${draft.number} không hợp lệ.`)
    }
  }
}

export function applyWeekDrafts(state: LegacyState, drafts: WeekEditorDraft[]): LegacyState {
  validateWeekDrafts(drafts)
  const next = structuredClone(state)
  const byId = new Map(drafts.map(draft => [draft.id, draft]))
  next.weeks = next.weeks.map(week => {
    const draft = byId.get(week.id)
    if (!draft) return week
    const status = draft.holiday
      ? 'holiday'
      : week.status === 'holiday'
        ? 'upcoming'
        : week.status
    return {
      ...week,
      status,
      manualStatus: draft.manualStatus,
      deadlineMode: draft.deadlineMode,
      deadline: draft.deadlineMode === 'specific' ? draft.deadline : '',
      note: draft.note,
    }
  })
  return next
}

export function validateWeek1Start(value: string): void {
  if (!value) throw new Error('Hãy chọn ngày bắt đầu Tuần 1.')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error('Ngày bắt đầu Tuần 1 không hợp lệ.')
  }
  const date = new Date(`${value}T00:00:00Z`)
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error('Ngày bắt đầu Tuần 1 không hợp lệ.')
  }
  if (date.getUTCDay() !== 1) {
    throw new Error('Ngày bắt đầu Tuần 1 phải là Thứ Hai.')
  }
}

export function summarizeWeekStatuses(
  drafts: WeekEditorDraft[],
  statuses: Record<string, WeekOperationalStatus>,
): WeekStatusSummary {
  const summary: WeekStatusSummary = { open: 0, locked: 0, upcoming: 0, holiday: 0 }
  for (const draft of drafts) {
    if (draft.holiday) {
      summary.holiday += 1
      continue
    }
    const status = draft.manualStatus ?? statuses[draft.id] ?? 'upcoming'
    summary[status] += 1
  }
  return summary
}
