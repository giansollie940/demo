import type { LegacyState, ScheduleSlot } from '../../types/legacy'
import {
  commitStateMutation,
  type LegacyMutationRuntime,
} from '../shared/legacy-mutation'
import {
  applyDefaultSchedule,
  applyWeekSchedule,
  resetWeekSchedule,
} from './schedule-model'

export function saveDefaultScheduleMutation(
  runtime: LegacyMutationRuntime,
  classId: string,
  slots: ScheduleSlot[],
): Promise<LegacyState> {
  return commitStateMutation(runtime, classId, state => applyDefaultSchedule(state, slots))
}

export function saveWeekScheduleMutation(
  runtime: LegacyMutationRuntime,
  classId: string,
  weekId: string,
  slots: ScheduleSlot[],
): Promise<LegacyState> {
  return commitStateMutation(
    runtime,
    classId,
    state => applyWeekSchedule(state, classId, weekId, slots),
  )
}

export function resetWeekScheduleMutation(
  runtime: LegacyMutationRuntime,
  classId: string,
  weekId: string,
): Promise<LegacyState> {
  return commitStateMutation(runtime, classId, state => resetWeekSchedule(state, weekId))
}
