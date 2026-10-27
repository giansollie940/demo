import type { CurrentUser, ScheduleSlot, UserRole } from '../../types/legacy'
import type { TrackingBucket } from './tracking-model'

// FEAT-LATE-001: học sinh chưa đăng ký mà buổi tự học đã bắt đầu thì báo miệng;
// cán sự / GV ghi nhận một lần trễ. Đủ ngưỡng (mặc định 3, GV đổi được) thì
// server tạo một lần cải thiện ý thức. Bộ đếm và ngưỡng do server quyết định,
// ở đây chỉ hiển thị.

export const DEFAULT_LATE_THRESHOLD = 3

export interface LateRegistrationRecord {
  id: string
  studentId: string
  weekId: string
  dow: number
  period: number
  recordedAt: string
  recordedBy: string | null
  conductCaseId: string | null
}

export interface ConductCaseRecord {
  id: string
  studentId: string
  threshold: number
  createdAt: string
  resolvedAt: string | null
  resolvedBy: string | null
  resolutionNote: string | null
}

/** Chỉ chứa lần trễ còn hiệu lực (chưa bị hủy vì ghi nhầm). */
export interface LateTrackingData {
  available: boolean
  threshold: number
  lates: LateRegistrationRecord[]
  cases: ConductCaseRecord[]
}

export interface StudentLateSummary {
  pending: number
  threshold: number
  openCases: ConductCaseRecord[]
  resolvedCases: number
}

const RECORDERS: UserRole[] = ['monitor', 'teacher', 'admin']

export function clampLateThreshold(value: unknown): number {
  const number = Math.round(Number(value))
  if (!Number.isFinite(number)) return DEFAULT_LATE_THRESHOLD
  return Math.min(20, Math.max(1, number))
}

export function studentLateSummary(data: LateTrackingData, studentId: string): StudentLateSummary {
  const cases = data.cases.filter(item => item.studentId === studentId)
  return {
    pending: data.lates.filter(item => item.studentId === studentId && !item.conductCaseId).length,
    threshold: data.threshold,
    openCases: cases.filter(item => !item.resolvedAt),
    resolvedCases: cases.filter(item => item.resolvedAt).length,
  }
}

export function lateForSession(lates: LateRegistrationRecord[], studentId: string, weekId: string, session: ScheduleSlot) {
  return lates.find(item =>
    item.studentId === studentId && item.weekId === weekId &&
    Number(item.dow) === Number(session.dow) && Number(item.period) === Number(session.period)) ?? null
}

/** Cán sự không tự ghi nhận cho chính mình; server kiểm tra lại cùng các điều kiện này. */
function actsOnOther(actorRole: UserRole | null | undefined, actorId: string | null | undefined, studentId: string) {
  if (!actorRole || !RECORDERS.includes(actorRole)) return false
  return actorRole !== 'monitor' || actorId !== studentId
}

export function canRecordLate({ actorRole, actorId, studentId, bucket, started, alreadyRecorded }: {
  actorRole: UserRole | null | undefined
  actorId: string | null | undefined
  studentId: string
  bucket: TrackingBucket
  started: boolean
  alreadyRecorded: boolean
}): boolean {
  return started && bucket === 'missing' && !alreadyRecorded && actsOnOther(actorRole, actorId, studentId)
}

export function canRevokeLate(late: LateRegistrationRecord, actorRole: UserRole | null | undefined, actorId: string | null | undefined) {
  return !late.conductCaseId && actsOnOther(actorRole, actorId, late.studentId)
}

export function canResolveCase(item: ConductCaseRecord, actorRole: UserRole | null | undefined, actorId: string | null | undefined) {
  return !item.resolvedAt && actsOnOther(actorRole, actorId, item.studentId)
}

export function conductOverview(data: LateTrackingData, users: CurrentUser[]) {
  const byId = new Map(users.map(item => [item.id, item]))
  const lateCount = (caseId: string) => data.lates.filter(item => item.conductCaseId === caseId).length
  const byName = (a?: CurrentUser, b?: CurrentUser) => (a?.name ?? '').localeCompare(b?.name ?? '', 'vi')

  const openCases = data.cases
    .filter(item => !item.resolvedAt)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map(item => ({ case: item, user: byId.get(item.studentId), lateCount: lateCount(item.id) }))

  const resolvedCases = data.cases
    .filter(item => item.resolvedAt)
    .sort((a, b) => String(b.resolvedAt).localeCompare(String(a.resolvedAt)))
    .map(item => ({ case: item, user: byId.get(item.studentId), lateCount: lateCount(item.id) }))

  const pending = users
    .map(user => ({ user, pending: studentLateSummary(data, user.id).pending }))
    .filter(row => row.pending > 0)
    .sort((a, b) => b.pending - a.pending || byName(a.user, b.user))

  return { openCases, resolvedCases, pending }
}
