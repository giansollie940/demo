# Code Cleanup Inventory

## DELETE_DEAD — completed

- `SessionSummaryCard.vue`
- `WeekCalendarSetup.vue`
- unused `CalendarDays` import in `StudySessionCard.vue`
- `CAPACITY_HOLD_MESSAGE`
- `deleteTeacher()` wrapper
- `updateSchoolYearPeriods()` wrapper
- `WeekTrendRow`
- `statisticsTrend()`
- `rebaseWeekCalendarMutation()`
- `validateWeek1Start()`
- unused exported `AppDialog` type
- unnecessary export visibility on `createAppDialog()`

All were checked against source, tests, scripts, and public/runtime references before removal.

## CONSOLIDATE — completed

### Byte formatting

Two exact `formatBytes()` implementations were consolidated into:

`src/features/shared/format.ts`

The former modules re-export the function, preserving current import contracts:

- `src/features/storage/api.ts`
- `src/features/archive/format.ts`

### ISO date addition

Three exact `addDaysISO()` implementations were consolidated into:

`src/features/shared/date.ts`

Consumers now import the shared pure helper:

- `src/features/registrations/registration-model.ts`
- `src/features/schedule/schedule-model.ts`
- `src/features/weeks/week-lifecycle.ts`

## DEPENDENCY CLEANUP — completed

Removed direct devDependency:

- `@vue/test-utils`

No repository import/reference was found. `package-lock.json` was regenerated offline from existing lock metadata, removing its no-longer-required transitive subtree.

## KEEP — protected behavior surfaces

- Authentication/session logic
- `public/supabase-service.js`
- Student registration and deadline logic
- AI review/revision flow
- Teacher review
- Role/permission behavior
- Homework duplicate/media/archive behavior
- Storage thresholds/protection
- FEAT-009 Owl V2 rollout behavior
- FEAT-010 Device Policy behavior
- Realtime behavior
- Database/RLS/RPC/Edge Function code

## DEFER

Large structural page decomposition and legacy Supabase-service modularization. These require a separate architecture/refactor task or an environment where the full dependency tree, typecheck, build, unit tests, and browser tests can all run after each structural change.
