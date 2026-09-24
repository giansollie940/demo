# File Disposition

| Path / candidate | Action | Evidence / reason |
|---|---|---|
| `.gitignore` | CREATE | Full source had no ignore policy; prevents generated/local artifacts from being committed |
| `src/components/tracking/SessionSummaryCard.vue` | DELETE | No incoming reference in application source, tests, scripts, or runtime string references |
| `src/components/weeks/WeekCalendarSetup.vue` | DELETE | No incoming reference in application source, tests, scripts, or runtime string references |
| `src/features/shared/format.ts` | CREATE | Canonical exact duplicate `formatBytes()` implementation |
| `src/features/storage/api.ts` local `formatBytes()` | CONSOLIDATE | Re-export shared function to preserve existing import path |
| `src/features/archive/format.ts` local `formatBytes()` | CONSOLIDATE | Re-export shared function to preserve existing import path |
| `src/features/shared/date.ts` | CREATE | Canonical exact duplicate `addDaysISO()` implementation |
| `schedule-model.ts` local `addDaysISO()` | CONSOLIDATE | Exact-body duplicate; import shared helper |
| `week-lifecycle.ts` local `addDaysISO()` | CONSOLIDATE | Exact-body duplicate; import shared helper |
| `registration-model.ts` local `addDaysISO()` | CONSOLIDATE | Exact-body duplicate; import shared helper |
| `StudySessionCard.vue` `CalendarDays` import | DELETE_DEAD | Imported but unused |
| `CAPACITY_HOLD_MESSAGE` | DELETE_DEAD | Zero callers/references outside definition |
| `deleteTeacher()` wrapper | DELETE_DEAD | Zero callers/references outside definition |
| `updateSchoolYearPeriods()` wrapper | DELETE_DEAD | Zero callers/references outside definition |
| `WeekTrendRow` / `statisticsTrend()` | DELETE_DEAD | Zero callers/references outside definition |
| `rebaseWeekCalendarMutation()` | DELETE_DEAD | Zero callers/references outside definition; no route/component/test references |
| `validateWeek1Start()` | DELETE_DEAD | Became globally unused after removal of dead rebase wrapper |
| exported `AppDialog` type | DELETE_DEAD | Zero imports/references |
| exported `createAppDialog()` symbol | INTERNALIZE | Only used in its own module; public export removed, behavior unchanged |
| `@vue/test-utils` | REMOVE DEPENDENCY | Zero references in `src/`, `tests/`, `scripts/`; lockfile pruned offline |
| `scripts/package-github-pages-minimal.mjs` | MODIFY | Include `.gitignore` in future minimal deploy-source packages |
| `database/**` | KEEP / NO CHANGE | Backend changes prohibited |
| `supabase/**` | KEEP / NO CHANGE | RLS/RPC/Edge Function changes prohibited |
| `public/supabase-service.js` | KEEP / NO CHANGE | High-risk legacy integration; exact SHA preserved |
| large page/component structural refactor | DEFER | Full dependency-based compile/build verification unavailable in this environment |
