import type { LegacyState } from '../../types/legacy'
import { commitStateMutation, type LegacyMutationRuntime } from '../shared/legacy-mutation'

export interface SettingsPatch {
  announcement: string
  registrationDeadlineTime: string
  aiAutomationEnabled: boolean
  aiAutoApproveThreshold: number
}

export async function saveSettingsMutation(
  runtime: LegacyMutationRuntime,
  classId: string,
  patch: SettingsPatch,
): Promise<LegacyState> {
  return commitStateMutation(runtime, classId, source => {
    const settings = {
      ...source.settings,
      announcement: patch.announcement.trim(),
      registrationDeadlineTime: patch.registrationDeadlineTime || '20:00',
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
    return { ...source, settings, audit }
  })
}
