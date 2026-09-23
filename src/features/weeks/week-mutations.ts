import type { LegacyState } from '../../types/legacy'
import { commitStateMutation, type LegacyMutationRuntime } from '../shared/legacy-mutation'
import { applyWeekDrafts, type WeekEditorDraft } from './week-editor-model'

export function saveWeekSettingsMutation(
  runtime: LegacyMutationRuntime,
  classId: string,
  drafts: WeekEditorDraft[],
): Promise<LegacyState> {
  return commitStateMutation(runtime, classId, state => applyWeekDrafts(state, drafts))
}
