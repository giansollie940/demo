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



export type NormalizedAiDecision = 'auto_approve' | 'request_revision' | 'manual_review' | ''

export function normalizedAiDecision(registration: RegistrationRecord | null | undefined): NormalizedAiDecision {
  if (!registration) return ''
  const value = String(registration.aiDecision ?? '').trim().toLowerCase()
  if (['auto_approve', 'approve', 'approved'].includes(value)) return 'auto_approve'
  if (['request_revision', 'needs_revision', 'revision'].includes(value)) return 'request_revision'
  if (['manual_review', 'manual', 'teacher_review'].includes(value)) return 'manual_review'
  return ''
}

export function aiDecisionLabel(registration: RegistrationRecord | null | undefined): string {
  const decision = normalizedAiDecision(registration)
  if (decision === 'auto_approve') return 'AI đề xuất duyệt'
  if (decision === 'request_revision') return 'AI yêu cầu sửa'
  if (decision === 'manual_review') return 'AI chuyển GV'
  return '—'
}

export function aiCategoryLabel(registration: RegistrationRecord | null | undefined): string {
  const category = String(registration?.aiCategory ?? '').trim().toLowerCase()
  const labels: Record<string, string> = {
    study: 'Học tập',
    device_for_learning: 'Thiết bị phục vụ học tập',
    unclear_device_use: 'Chưa rõ mục đích dùng thiết bị',
    entertainment_or_social: 'Giải trí / mạng xã hội',
    mixed_learning_and_leisure: 'Học tập lẫn giải trí',
    unclear_other: 'Chưa rõ nội dung',
  }
  return labels[category] ?? (category || '—')
}

/**
 * True when AI reports a completed decision but the persisted business state does not
 * match that decision. The frontend must surface this instead of silently approving.
 */
export function aiOutcomeMismatch(registration: RegistrationRecord | null | undefined): boolean {
  if (!registration) return false
  if (String(registration.aiReviewStatus ?? '').toLowerCase() !== 'completed') return false
  const decision = normalizedAiDecision(registration)
  if (decision === 'auto_approve') {
    return registration.status !== 'approved' || registration.approvalSource !== 'ai'
  }
  if (decision === 'request_revision') return registration.status !== 'needs_revision'
  if (decision === 'manual_review') return registration.status !== 'submitted'
  return false
}

export function aiReviewInProgress(registration: RegistrationRecord | null | undefined): boolean {
  if (!registration) return false
  const value = String(registration.aiReviewStatus ?? '').toLowerCase()
  return value === 'pending' || value === 'processing'
}

/**
 * Current registration status is authoritative for the teacher queue.
 * A completed AI/backend mismatch remains visible to the teacher as a fail-safe,
 * but is labelled as a sync problem rather than as an AI manual-review decision.
 */
export function needsTeacherAction(registration: RegistrationRecord | null | undefined): boolean {
  if (!registration || registration.isDeleted === true) return false
  if (registration.status !== 'submitted') return false
  if (aiReviewInProgress(registration)) return false
  return true
}

/** Human-readable AI history while preserving the exact backend decision. */
export function aiReviewHistoryLabel(registration: RegistrationRecord | null | undefined): string {
  if (!registration) return '—'
  const reviewStatus = String(registration.aiReviewStatus ?? '').toLowerCase()
  const decision = normalizedAiDecision(registration)
  const mismatch = aiOutcomeMismatch(registration)

  if (reviewStatus === 'completed') {
    if (decision === 'auto_approve') return mismatch ? 'AI duyệt · Chưa áp dụng' : 'AI duyệt'
    if (decision === 'request_revision') return mismatch ? 'AI yêu cầu sửa · Chưa áp dụng' : 'AI yêu cầu sửa'
    if (decision === 'manual_review') {
      return registration.status === 'approved' ? 'AI chuyển GV · Đã xử lý' : 'AI chuyển GV'
    }
    return 'AI đã xử lý · Chưa rõ quyết định'
  }

  if (registration.status === 'approved' && ['manual', 'manual_review'].includes(reviewStatus)) return 'AI chuyển GV · Đã xử lý'
  if (registration.status === 'needs_revision' && ['approved', 'auto_approve'].includes(reviewStatus)) return 'AI từng duyệt · GV yêu cầu sửa'
  if (registration.status === 'needs_revision' && ['manual', 'manual_review'].includes(reviewStatus)) return 'GV yêu cầu sửa'
  if (registration.status === 'submitted' && ['manual', 'manual_review'].includes(reviewStatus)) return 'AI chuyển GV'
  if (registration.status === 'submitted' && reviewStatus === 'error') return 'AI lỗi · GV xử lý'
  const labels: Record<string, string> = {
    approved: 'AI duyệt',
    auto_approve: 'AI duyệt',
    manual: 'AI chuyển GV',
    manual_review: 'AI chuyển GV',
    needs_revision: 'AI yêu cầu sửa',
    request_revision: 'AI yêu cầu sửa',
    error: 'AI lỗi',
    pending: 'Đang chờ AI',
    processing: 'AI đang xử lý',
    not_needed: 'Không áp dụng AI',
  }
  const fallback = reviewStatus || String(registration.aiDecision ?? '').toLowerCase()
  return labels[fallback] ?? (fallback ? String(registration.aiReviewStatus ?? registration.aiDecision) : '—')
}

export interface RegistrationManagerActions {
  canApprove: boolean
  canRequestRevision: boolean
  canRejectOverdue: boolean
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
  return {
    canApprove: !reported && needsTeacherAction(registration),
    canRequestRevision: !reported && !started && ['submitted', 'needs_revision', 'approved'].includes(registration.status),
    // "Chờ duyệt" nhưng buổi học đã bắt đầu trước khi GV/AI kịp xử lý:
    // request_registration_revision() tự chặn một khi đã started (không thể
    // yêu cầu HS sửa cho buổi đã qua), nên GV cần một lối "Không duyệt" dứt
    // điểm riêng thay vì chỉ còn Duyệt (không hợp lý) hoặc Xóa (mất dấu vết).
    canRejectOverdue: started && needsTeacherAction(registration),
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
