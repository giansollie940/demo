import type { CurrentUser, LegacyState, RegistrationRecord, ScheduleSlot, WeekData, WeekRecord } from '../../types/legacy'
import { effectiveScheduleForWeek } from '../schedule/schedule-model'

export interface WeekStatistics {
  students: number
  slots: number
  total: number
  valid: number
  issues: number
  missing: number
  needs: number
  rate: number
}

export interface WeekTrendRow extends WeekStatistics {
  week: WeekRecord
}

export function mergeWeekData(state: LegacyState, weekId: string, weekData: WeekData): LegacyState {
  return {
    ...state,
    registrations: [
      ...state.registrations.filter(row => row.weekId !== weekId),
      ...weekData.registrations,
    ],
    overrides: [
      ...state.overrides.filter(row => row.weekId !== weekId),
      ...weekData.overrides,
    ],
  }
}

export function activeStudents(users: CurrentUser[]): CurrentUser[] {
  return users.filter(user => user.active !== false && ['student', 'monitor'].includes(user.role))
}

export function registrationBucket(registration: RegistrationRecord | null): 'valid' | 'issue' | 'missing' {
  if (!registration || registration.status === 'draft') return 'missing'
  if (registration.revisionOverdueAt) return 'issue'
  return 'valid'
}

function registrationFor(
  registrations: RegistrationRecord[],
  weekId: string,
  studentId: string,
  slot: ScheduleSlot,
): RegistrationRecord | null {
  return registrations.find(row => row.isDeleted !== true
    && row.weekId === weekId
    && row.studentId === studentId
    && Number(row.dow) === Number(slot.dow)
    && Number(row.period) === Number(slot.period)) ?? null
}

export function statisticsForWeek(state: LegacyState, weekId: string): WeekStatistics {
  const students = activeStudents(state.users)
  const slots = effectiveScheduleForWeek(state, weekId)
  let valid = 0
  let issues = 0
  let missing = 0
  let needs = 0
  for (const student of students) {
    for (const slot of slots) {
      const registration = registrationFor(state.registrations, weekId, student.id, slot)
      const bucket = registrationBucket(registration)
      if (bucket === 'valid') valid += 1
      else if (bucket === 'issue') issues += 1
      else missing += 1
      if (bucket === 'valid' && registration?.status === 'needs_revision') needs += 1
    }
  }
  const total = students.length * slots.length
  return {
    students: students.length,
    slots: slots.length,
    total,
    valid,
    issues,
    missing,
    needs,
    rate: total ? Math.round(valid / total * 100) : 0,
  }
}

export function statisticsTrend(state: LegacyState, limit = 12): WeekTrendRow[] {
  return [...state.weeks]
    .slice(0, Math.max(0, limit))
    .map(week => ({ week, ...statisticsForWeek(state, week.id) }))
}

function csvCell(value: unknown): string {
  let text = String(value ?? '')
  if (/^[=+\-@]/.test(text)) text = `'${text}`
  return `"${text.replace(/"/g, '""')}"`
}

export function statisticsCsv(state: LegacyState, weekId: string): string {
  const slots = effectiveScheduleForWeek(state, weekId)
  const statusLabel = (registration: RegistrationRecord | null) => {
    if (!registration || registration.status === 'draft') return 'Chưa đăng ký'
    if (registration.revisionOverdueAt) return 'Cần xử lý'
    if (registration.status === 'approved') return 'Đã duyệt'
    if (registration.status === 'needs_revision') return 'Cần chỉnh sửa'
    return 'Chờ duyệt'
  }
  const lines = [
    ['Mã', 'Họ tên', ...slots.map(slot => `T${slot.dow + 2}-Tiết ${slot.period}`)].map(csvCell).join(','),
  ]
  for (const student of activeStudents(state.users)) {
    lines.push([
      student.code,
      student.name,
      ...slots.map(slot => statusLabel(registrationFor(state.registrations, weekId, student.id, slot))),
    ].map(csvCell).join(','))
  }
  return `\ufeff${lines.join('\n')}`
}
