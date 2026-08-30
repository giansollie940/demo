# Sổ Tự Học V8.8.0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship V8.8.0 with dialog-based admin account management, global mutation feedback, session-scoped quick reports, template/version/assignment timetable architecture, generated periods, dynamic lifecycle, and reliable audit.

**Architecture:** Preserve the existing Vue + legacy bridge boundary. Add a pure timetable engine shared conceptually by frontend and SQL, introduce new normalized DB entities behind `admin-manage-classes`, and migrate current school-year periods into default template versions. Keep existing study slot tables as slot selection, not time definitions.

**Tech Stack:** Vue 3 + TypeScript + Pinia + Vue Query + Vite; Supabase/PostgreSQL; Deno Edge Functions; Node static tests/Vitest/vue-tsc.

**Spec:** `docs/superpowers/specs/2026-08-28-v880-ux-timetable-design.md`

## Global Constraints
- Root Admin remains unique.
- Admin hard-delete guards remain server-enforced.
- Teacher never edits system timetable templates.
- Monitor is read-only for timetable/week management.
- Existing registrations are preserved.
- GitHub Pages remains hash-router + relative Vite base.
- Browser config remains generated at build time and is never committed.

---

### Task 1: Version and regression contract
**Files:** `package.json`, `tests/v880-ux-timetable.test.mjs`
- [ ] Write failing static contract tests for V8.8.0, dialogs, reset password, quick-report session scope, timetable engine/tables/actions, week popover, loading feedback, Admin Owl settings.
- [ ] Run test and verify RED.
- [ ] Bump package/release labels to 8.8.0 minimally.
- [ ] Keep test RED for missing feature code.

### Task 2: Shared mutation feedback + Admin dialogs
**Files:** `src/components/admin/AdminUserDialog.vue`, `src/components/admin/AdminPasswordDialog.vue`, `src/components/admin/AdminStudentCard.vue`, `src/components/admin/AdminTeacherCard.vue`, `src/pages/AdminPage.vue`, `src/features/admin/admin-directory.ts`
- [ ] Add dialog forms for create/edit HS/GV and password reset.
- [ ] Add per-entity busy state and optimistic Vue Query cache patch for safe updates.
- [ ] Keep hard delete server-confirmed before cache removal.
- [ ] Add reset password action for both HS/Cán sự and GV.
- [ ] Run focused tests GREEN.

### Task 3: Admin personal Owl settings
**Files:** `src/app/router/routes.ts`, `src/pages/SettingsPage.vue`, `src/components/layout/TopBar.vue`
- [ ] Allow admin personal settings route/profile action.
- [ ] Render personal appearance/Owl section for Admin without class settings.
- [ ] Run focused tests GREEN.

### Task 4: Session-scoped quick reports
**Files:** `src/features/tracking/tracking-model.ts`, `src/components/tracking/TrackingQuickReport.vue`, `src/components/tracking/TrackingFilters.vue`, `src/pages/TrackingPage.vue`
- [ ] Add `unknown-device` semantics and session-only report view models.
- [ ] Render compact reports for missing/device/no-device.
- [ ] Keep detail rows for all/registered/attention.
- [ ] Ensure monitor has no manager actions.
- [ ] Run focused tests GREEN.

### Task 5: Week layout and deadline popover
**Files:** `src/pages/WeeksPage.vue`, `src/components/weeks/WeekEditorCard.vue`
- [ ] Narrow master list to 210–230px.
- [ ] Replace conditional deadline grid block with anchored overlay/popover.
- [ ] Add saving overlay/disabled state.
- [ ] Run focused tests GREEN.

### Task 6: Pure timetable engine
**Files:** `src/features/timetable/timetable-types.ts`, `src/features/timetable/timetable-engine.ts`, `tests/unit/timetable-engine.test.ts`
- [ ] Write engine unit tests first: auto period count, duration override, custom break, day override inheritance, invalid config.
- [ ] Implement deterministic calculator and validation.
- [ ] Run unit tests GREEN.

### Task 7: V8.8.0 database schema and migration
**Files:** `database/upgrade/01-UPGRADE-CURRENT-TO-V8.8.0.sql`, `database/verify/VERIFY-V8.8.0.sql`, `database/fresh-install/02-INSTALL-V8.8.0-TIMETABLE-TEMPLATES.sql`
- [ ] Add template/version/day-config/assignment tables with RLS/read grants and service-role write.
- [ ] Add overlap exclusion/trigger guard for assignments.
- [ ] Migrate existing school-year periods into default templates/versions and assign active classes.
- [ ] Add SQL calculation function and lifecycle resolution with fallback.
- [ ] Add verifier checks for schema, migration coverage, overlap guard and lifecycle function source.
- [ ] Static SQL contract test GREEN.

### Task 8: Admin timetable API + bridge
**Files:** `supabase/functions/admin-manage-classes/index.ts`, `public/supabase-service.js`, `src/types/legacy.ts`, `src/features/admin/admin-directory.ts`
- [ ] List timetable templates/versions/assignments in Admin directory.
- [ ] Add create/update/version/assign actions with Root Admin guard and audit.
- [ ] Expose bridge methods through `adminManageClasses` payloads; normalize records.
- [ ] Run focused tests GREEN.

### Task 9: Admin timetable builder UI
**Files:** `src/components/admin/AdminTimetableBuilder.vue`, `src/components/admin/AdminTimetableAssignment.vue`, `src/components/admin/AdminSchoolYearCard.vue`, `src/pages/AdminPage.vue`
- [ ] Build base config editor + live preview.
- [ ] Add period duration exceptions, break types including custom, weekday inheritance overrides.
- [ ] Add version save and class assignment effective ranges with overlap validation.
- [ ] Add loading and inline status.
- [ ] Run focused tests GREEN.

### Task 10: Class/week timetable resolution and teacher/monitor schedule
**Files:** `public/supabase-service.js`, `src/pages/SchedulePage.vue`, `src/components/schedule/ScheduleGrid.vue`, `src/features/schedule/schedule-model.ts`
- [ ] Load resolved generated periods for selected class/week.
- [ ] Teacher only toggles self-study slots; monitor schedule page/read-only route is allowed.
- [ ] Remove any time-edit affordance from teacher view.
- [ ] Run focused tests GREEN.

### Task 11: Audit coverage and contract
**Files:** `supabase/functions/admin-reset-password/index.ts`, `supabase/functions/admin-create-user/index.ts`, `supabase/functions/admin-update-user/index.ts`, `supabase/functions/admin-manage-classes/index.ts`, `src/components/admin/AdminAuditLog.vue`
- [ ] Use specific reset action names by target role without logging passwords.
- [ ] Audit timetable create/version/assignment actions.
- [ ] Preserve structured backend error display.
- [ ] Run focused tests GREEN.

### Task 12: Full verification and release packaging
**Files:** docs/changelog/deployment/verification, release scripts as needed.
- [ ] Run `npm test`.
- [ ] Attempt `npm ci`, `npm run typecheck`, `npm run test:unit`, `npm run build`; report exact limitations if dependency install unavailable.
- [ ] Run Edge TS syntax checks and `npm run verify:release`.
- [ ] Package 10 Edge ZIPs.
- [ ] Create ROOT-FLAT and DEPLOY-ONLY V8.8.0 artifacts.
- [ ] Extract final ROOT-FLAT and rerun static tests/verifier/checksums.
