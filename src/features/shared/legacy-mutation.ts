import type {
  CurrentUser,
  LegacyState,
  LegacySupabaseService,
} from '../../types/legacy'

export interface LegacyMutationRuntime {
  service: Pick<LegacySupabaseService, 'syncState' | 'teacherRebaseWeeks'>
  currentUser: CurrentUser
  getState(): LegacyState
  reload(classId: string): Promise<LegacyState>
  hydrate(state: LegacyState): void
  invalidate(): Promise<void>
}

export async function refreshMutationRuntime(
  runtime: LegacyMutationRuntime,
  classId: string,
): Promise<LegacyState> {
  const canonical = await runtime.reload(classId)
  runtime.hydrate(canonical)
  await runtime.invalidate()
  return canonical
}

export async function commitStateMutation(
  runtime: LegacyMutationRuntime,
  classId: string,
  buildNext: (state: LegacyState) => LegacyState,
): Promise<LegacyState> {
  const source = runtime.getState()
  const next = buildNext(source)
  await runtime.service.syncState(next, runtime.currentUser)
  return refreshMutationRuntime(runtime, classId)
}
