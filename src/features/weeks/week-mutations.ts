import type { LegacyState } from '../../types/legacy'
import {
  commitStateMutation,
  refreshMutationRuntime,
  type LegacyMutationRuntime,
} from '../shared/legacy-mutation'
import {
  applyWeekDrafts,
  validateWeek1Start,
  type WeekEditorDraft,
} from './week-editor-model'

export function saveWeekSettingsMutation(
  runtime: LegacyMutationRuntime,
  classId: string,
  drafts: WeekEditorDraft[],
): Promise<LegacyState> {
  return commitStateMutation(runtime, classId, state => applyWeekDrafts(state, drafts))
}

export async function rebaseWeekCalendarMutation(
  runtime: LegacyMutationRuntime,
  classId: string,
  firstWeekStart: string,
  deadlineTime: string,
): Promise<LegacyState> {
  if (runtime.currentUser.role !== 'admin') {
    throw new Error('Chỉ quản trị viên được đổi mốc Tuần 1.')
  }
  validateWeek1Start(firstWeekStart)
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(deadlineTime)) {
    throw new Error('Giờ deadline không hợp lệ.')
  }
  await runtime.service.teacherRebaseWeeks(firstWeekStart, deadlineTime, runtime.getState().selectedSchoolYearId)
  return refreshMutationRuntime(runtime, classId)
}
