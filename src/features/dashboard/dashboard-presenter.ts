import type { CurrentUser, RegistrationRecord } from '../../types/legacy'
import { needsTeacherAction } from '../registrations/registration-model'
import type { DashboardMetrics } from './dashboard-model'

export interface DashboardQueueRow {
  id: string
  studentId: string
  studentName: string
  studentCode: string
  classLabel: string
  content: string
  timestampLabel: string
  status: string
  statusLabel: string
  actionTo?: string
}

function timestampOf(row: RegistrationRecord): number | null {
  const candidates = [row.updatedAt, row.approvedAt, row.emergencyRequestedAt, row.aiReviewedAt]
  for (const value of candidates) {
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string') {
      const parsed = Date.parse(value)
      if (Number.isFinite(parsed)) return parsed
    }
  }
  return null
}

function relativeTime(value: number | null, nowMs: number): string {
  if (!value) return 'Chưa có thời gian'
  const delta = nowMs - value
  const day = 86_400_000
  const date = new Date(value)
  const hhmm = new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit' }).format(date)
  if (delta >= 0 && delta < day) return `Hôm nay ${hhmm}`
  if (delta >= day && delta < day * 2) return `Hôm qua ${hhmm}`
  return new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(date)
}

export function buildDashboardQueue({
  registrations,
  users,
  classLabel,
  nowMs = Date.now(),
}: {
  registrations: RegistrationRecord[]
  users: CurrentUser[]
  classLabel: string
  nowMs?: number
}): DashboardQueueRow[] {
  const userMap = new Map(users.map(user => [user.id, user]))
  return registrations
    .filter(row => needsTeacherAction(row) || row.status === 'needs_revision' || Boolean(row.revisionOverdueAt))
    .sort((a, b) => (timestampOf(b) ?? 0) - (timestampOf(a) ?? 0))
    .map(row => {
      const user = userMap.get(row.studentId)
      const issue = Boolean(row.revisionOverdueAt)
      const statusLabel = issue ? 'Quá hạn' : row.status === 'needs_revision' ? 'Chỉnh sửa' : 'Chờ duyệt'
      return {
        id: row.id,
        studentId: row.studentId,
        studentName: user?.name ?? 'Học sinh',
        studentCode: user?.code ?? '–',
        classLabel,
        content: row.content || 'Chưa có nội dung',
        timestampLabel: relativeTime(timestampOf(row), nowMs),
        status: issue ? 'overdue' : row.status,
        statusLabel,
        actionTo: needsTeacherAction(row) ? '/review' : issue ? '/issues' : undefined,
      }
    })
}

export function buildMotivationMessage(metrics: DashboardMetrics): { title: string; body: string; tone: 'success' | 'info' | 'warning' } | null {
  if (!metrics.students && !metrics.expected) return null
  if (metrics.issues > 0) return { title: 'Ưu tiên xử lý mục quá hạn', body: `Hiện có ${metrics.issues} mục cần được kiểm tra trước khi tiếp tục tuần học.`, tone: 'warning' }
  if (metrics.completion >= 90) return { title: 'Duy trì nhịp học hiện tại', body: `${metrics.completion}% kế hoạch đã được đăng ký trong tuần này.`, tone: 'success' }
  if (metrics.completion >= 60) return { title: 'Tiến độ đang được duy trì', body: `${metrics.completion}% kế hoạch đã được đăng ký. Tiếp tục hoàn thành các buổi còn lại.`, tone: 'info' }
  return { title: 'Còn nhiều kế hoạch cần hoàn thành', body: `Mức đăng ký hiện tại là ${metrics.completion}%. Hãy ưu tiên các buổi tự học sắp tới.`, tone: 'warning' }
}
