import type {
  CurrentUser,
  LegacyState,
  LegacySupabaseService,
  ScheduleOverride,
} from '../../src/types/legacy'

declare const service: LegacySupabaseService
declare const state: LegacyState
declare const user: CurrentUser

const override: ScheduleOverride = {
  weekId: 'week-1',
  dow: 0,
  period: 1,
  active: true,
}

void override
void service.syncState(state, user)
void service.teacherRebaseWeeks('2026-08-24', '20:00')
