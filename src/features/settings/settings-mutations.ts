import type { LegacyState } from '../../types/legacy'
import { commitStateMutation, type LegacyMutationRuntime } from '../shared/legacy-mutation'

export interface SettingsPatch {
  announcement: string
  registrationDeadlineTime: string
  registrationDeadlineMode?: 'per_session_20' | 'week_before_20'
  aiAutomationEnabled: boolean
  aiAutoApproveThreshold: number
}

export async function saveSettingsMutation(
  runtime: LegacyMutationRuntime,
  classId: string,
  patch: SettingsPatch,
): Promise<LegacyState> {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(patch.registrationDeadlineTime)) throw new Error('Giờ chốt đăng ký không hợp lệ.')
  if (patch.registrationDeadlineMode && !['per_session_20', 'week_before_20'].includes(patch.registrationDeadlineMode)) throw new Error('Cách chốt hạn không hợp lệ.')
  return commitStateMutation(runtime, classId, source => {
    const settings = {
      ...source.settings,
      announcement: patch.announcement.trim(),
      registrationDeadlineTime: patch.registrationDeadlineTime,
      registrationDeadlineMode: patch.registrationDeadlineMode ?? source.settings.registrationDeadlineMode ?? 'per_session_20',
      aiAutomationEnabled: patch.aiAutomationEnabled,
      smartApprovalEnabled: patch.aiAutomationEnabled,
      aiReviewEnabled: patch.aiAutomationEnabled,
      aiAutoApproveThreshold: Math.max(.8, Math.min(.99, patch.aiAutoApproveThreshold)),
    }
    const audit = Array.isArray(source.audit) ? [...source.audit] : []
    audit.unshift({
      at: new Date().toISOString(),
      userId: runtime.currentUser.id,
      action: 'Cập nhật cài đặt',
      entityId: 'settings',
      detail: `AI_AUTO=${patch.aiAutomationEnabled}; threshold=${settings.aiAutoApproveThreshold}; deadline=${settings.registrationDeadlineTime}`,
    })
    const weeks = source.weeks.map(week => week.deadlineOverrideMode === 'inherit'
      ? { ...week, deadlineMode: String(settings.registrationDeadlineMode), deadline: '' } : week)
    return { ...source, settings, weeks, audit }
  })
}
