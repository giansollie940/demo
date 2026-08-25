import type { PeriodRecord, RegistrationRecord, WeekRecord } from '../../types/legacy'

export type EffectiveWeekStatus = 'open' | 'locked' | 'upcoming' | 'holiday'
export type ApprovalFilter = 'attention' | 'approved' | 'revision' | 'all'

const OFFSET = '+07:00'

function addDaysISO(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

export function dateForDow(week: WeekRecord, dow: number): string {
  return addDaysISO(week.startDate, Number(dow))
}

export function deadlineForSlot({
  week,
  dow,
  deadlineTime,
}: {
  week: WeekRecord
  dow: number
  deadlineTime: string
}): string {
  const time = /^([01]\d|2[0-3]):[0-5]\d$/.test(deadlineTime) ? deadlineTime : '20:00'
  if (week.deadlineMode === 'specific') return week.deadline ?? ''
  if (week.deadlineMode === 'week_before_20') return `${addDaysISO(week.startDate, -1)}T${time}`
  return `${addDaysISO(dateForDow(week, dow), -1)}T${time}`
}

export function sessionStartMs({
  week,
  dow,
  period,
  periods,
}: {
  week: WeekRecord
  dow: number
  period: number
  periods: PeriodRecord[]
}): number {
  const item = periods.find(candidate => Number(candidate.n) === Number(period))
  if (!item?.start) return Number.NaN
  return new Date(`${dateForDow(week, dow)}T${item.start}:00${OFFSET}`).getTime()
}

export function isRevisionOverdue(
  registration: RegistrationRecord | null,
  { week, periods, nowMs }: { week: WeekRecord; periods: PeriodRecord[]; nowMs: number },
): boolean {
  if (!registration) return false
  if (registration.revisionOverdueAt) return true
  if (registration.status !== 'needs_revision') return false
  const start = sessionStartMs({ week, dow: registration.dow, period: registration.period, periods })
  return Number.isFinite(start) && nowMs >= start
}

export interface RegistrationEligibility {
  regularNewAllowed: boolean
  editable: boolean
  emergencyAllowed: boolean
  started: boolean
  pastDeadline: boolean
  reported: boolean
  readOnlyReason: 'started' | 'upcoming' | 'holiday' | 'deadline' | 'locked' | null
}

export function deriveRegistrationEligibility({
  week,
  dow,
  period,
  periods,
  deadlineTime,
  registration,
  effectiveWeekStatus,
  nowMs,
}: {
  week: WeekRecord
  dow: number
  period: number
  periods: PeriodRecord[]
  deadlineTime: string
  registration: RegistrationRecord | null
  effectiveWeekStatus: EffectiveWeekStatus
  nowMs: number
}): RegistrationEligibility {
  const deadline = deadlineForSlot({ week, dow, deadlineTime })
  const deadlineMs = deadline ? new Date(`${deadline}:00${OFFSET}`).getTime() : Number.NaN
  const pastDeadline = Number.isFinite(deadlineMs) && nowMs > deadlineMs
  const start = sessionStartMs({ week, dow, period, periods })
  const started = Number.isFinite(start) && nowMs >= start
  const reported = isRevisionOverdue(registration, { week, periods, nowMs })
  const open = effectiveWeekStatus === 'open'
  const regularNewAllowed = !registration && open && !pastDeadline && !started
  const approvedEdit = registration?.status === 'approved' && open && !pastDeadline && !started
  const revisionEdit = registration?.status === 'needs_revision' && !reported && !started
  const ordinaryEdit = Boolean(
    registration
    && ['draft', 'submitted'].includes(registration.status)
    && open
    && !pastDeadline
    && !started,
  )
  const editable = approvedEdit || revisionEdit || ordinaryEdit
  const emergencyAllowed = !registration && open && pastDeadline && !started
  const readOnlyReason = started
    ? 'started'
    : effectiveWeekStatus === 'upcoming'
      ? 'upcoming'
      : effectiveWeekStatus === 'holiday'
        ? 'holiday'
        : pastDeadline
          ? 'deadline'
          : effectiveWeekStatus === 'locked'
            ? 'locked'
            : null
  return { regularNewAllowed, editable, emergencyAllowed, started, pastDeadline, reported, readOnlyReason }
}

export function effectiveRegistrationStatus(
  registration: RegistrationRecord | null,
  options: { week: WeekRecord; periods: PeriodRecord[]; nowMs: number },
): string {
  if (!registration) return 'missing'
  return isRevisionOverdue(registration, options) ? 'revision_overdue' : registration.status
}

export interface RegistrationManagerActions {
  canApprove: boolean
  canRequestRevision: boolean
  canComment: boolean
  canDelete: boolean
  started: boolean
  reported: boolean
}

export function registrationManagerActions({
  registration,
  week,
  periods,
  nowMs,
}: {
  registration: RegistrationRecord
  week: WeekRecord
  periods: PeriodRecord[]
  nowMs: number
}): RegistrationManagerActions {
  const start = sessionStartMs({ week, dow: registration.dow, period: registration.period, periods })
  const started = Number.isFinite(start) && nowMs >= start
  const reported = isRevisionOverdue(registration, { week, periods, nowMs })
  const aiBusy = ['pending', 'processing'].includes(registration.aiReviewStatus ?? '')
  return {
    canApprove: !reported && registration.status === 'submitted' && !aiBusy,
    canRequestRevision: !reported && !started && ['submitted', 'needs_revision', 'approved'].includes(registration.status),
    canComment: true,
    canDelete: true,
    started,
    reported,
  }
}

export function matchesApprovalFilter(
  registration: RegistrationRecord,
  filter: ApprovalFilter,
  options: { week: WeekRecord; periods: PeriodRecord[]; nowMs: number },
): boolean {
  if (filter === 'all') return true
  if (filter === 'approved') return registration.status === 'approved'
  if (filter === 'revision') {
    return registration.status === 'needs_revision' && !isRevisionOverdue(registration, options)
  }
  return registrationManagerActions({ registration, ...options }).canApprove
}
