# School Year Selector + Bubble Menu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add safe Admin school-year management, role-aware school-year selection, dependent class/week context loading, and a bubble sidebar with a short rotating hover ring.

**Architecture:** Keep the legacy Supabase bridge as the frontend data boundary. Add atomic root-admin RPCs for year creation/activation, expose them through the existing `admin-manage-classes` Edge Function, then extend `LegacyState`/Pinia context so selected school year drives classes and weeks. Sidebar changes remain CSS/component-local.

**Tech Stack:** Vue 3, Pinia, TypeScript, TanStack Vue Query, Supabase/PostgreSQL, Deno Edge Functions, Node test runner.

**Spec:** `docs/superpowers/specs/2026-08-27-school-year-bubble-menu-design.md`

## Global Constraints
- Keep the existing root-admin authorization model and `admin-manage-classes` write boundary.
- Keep `activeSchoolYearId` backward compatible; add separate selected-year state.
- Do not expose school-year deletion.
- Preserve all existing registration/AI/reminder/history behavior.
- Respect `prefers-reduced-motion` for hover-ring animation.
- Release must remain ROOT-FLAT and secret-free.

---

### Task 1: Contract tests for school-year management
**Files:**
- Create: `tests/v871-school-year-bubble-menu.test.mjs`
- Test: `supabase/functions/admin-manage-classes/index.ts`, `public/supabase-service.js`, `src/stores/context.ts`, `src/components/layout/TopBar.vue`, `src/pages/AdminPage.vue`, `src/components/layout/SidebarNav.vue`

**Interfaces:**
- Produces expected contracts for `availableSchoolYears`, `selectedSchoolYearId`, `create_school_year`, `set_active_school_year`, Admin `years` tab, and bubble-ring CSS.

- [ ] Write tests asserting the new backend/frontend contracts and hover-ring behavior.
- [ ] Run `node --test tests/v871-school-year-bubble-menu.test.mjs` and verify RED for missing contracts.

### Task 2: Atomic database school-year RPCs
**Files:**
- Modify: `database/upgrade/01-UPGRADE-CURRENT-TO-V8.7.1.sql`
- Modify: `database/fresh-install/01-INSTALL-V8.7.1-FROM-COMPATIBLE-BASELINE.sql`
- Modify: `database/verify/VERIFY-V8.7.1.sql`

**Interfaces:**
- Produces `public.admin_create_school_year(p_actor_id uuid,p_name text,p_start_date date,p_end_date date,p_set_active boolean) returns uuid`.
- Produces `public.admin_set_active_school_year(p_actor_id uuid,p_school_year_id uuid) returns void`.

- [ ] Add SQL contract assertions to the new test and verify they fail.
- [ ] Implement both SECURITY DEFINER RPCs with root-admin guard, validation, atomic activation, week generation and PostgREST schema notification.
- [ ] Add read-only verifier rows checking both RPCs exist and are security-definer.
- [ ] Re-run the targeted test to GREEN for SQL contracts.

### Task 3: Edge admin year actions and directory normalization
**Files:**
- Modify: `supabase/functions/admin-manage-classes/index.ts`
- Modify: `src/features/admin/admin-directory.ts`

**Interfaces:**
- `list` returns `schoolYears` rows `{id,name,start_date,end_date,is_active}`.
- `create_school_year` accepts `{name,startDate,endDate,setActive}`.
- `set_active_school_year` accepts `{schoolYearId}`.
- Frontend exports `createSchoolYear(...)` and `setActiveSchoolYear(...)` mutations.

- [ ] Verify targeted tests fail on missing Edge actions/directory fields.
- [ ] Implement list/actions/audit and normalization/mutations.
- [ ] Re-run targeted tests to GREEN for backend bridge contracts.

### Task 4: Role-aware selected-year state and dependent reload
**Files:**
- Modify: `src/types/legacy.ts`
- Modify: `public/supabase-service.js`
- Modify: `src/stores/auth.ts`
- Modify: `src/stores/context.ts`
- Modify: callers of `auth.reload(...)` where selected-year preservation is required.

**Interfaces:**
- `LegacyState.availableSchoolYears: SchoolYearRecord[]`.
- `LegacyState.selectedSchoolYearId: string|null`.
- `LegacySupabaseService.loadState(preferredClassId?, preferredSchoolYearId?)`.
- `auth.reload(preferredClassId?, preferredSchoolYearId?)`.
- `context.selectSchoolYear(id)`.

- [ ] Verify targeted tests fail on selected-year contract.
- [ ] Implement role-aware year resolution and filter classes/weeks by selected year.
- [ ] Preserve selected year in reload runtimes and realtime refreshes.
- [ ] Re-run targeted and existing context/history tests.

### Task 5: Topbar school-year bubble
**Files:**
- Modify: `src/components/layout/TopBar.vue`

**Interfaces:**
- Managers receive an interactive year select on the left.
- Learners receive a static year bubble.
- Year change reloads state with selected year and resets invalid class/week context.

- [ ] Verify test fails while duplicated class identity remains.
- [ ] Replace left class identity with year bubble and add `changeSchoolYear`.
- [ ] Re-run topbar and targeted tests.

### Task 6: Admin `Năm học` tab
**Files:**
- Modify: `src/pages/AdminPage.vue`
- Optionally create: `src/components/admin/AdminSchoolYearCard.vue`

**Interfaces:**
- Tabs: `Tổng quan | Năm học | Lớp học | Giáo viên | Phân quyền`.
- Create form fields: name, first-week start, end, set active.
- Existing year cards expose activate action; no delete.

- [ ] Verify test fails for missing Admin tab/form.
- [ ] Implement year cards/form and connect mutations.
- [ ] Re-run Admin source tests and targeted test.

### Task 7: Flat bubble sidebar with rotating hover ring
**Files:**
- Modify: `src/components/layout/SidebarNav.vue`
- Modify: `src/layouts/AppShell.vue` only if edge-toggle styling needs alignment.

**Interfaces:**
- Expanded nav items are rounded soft bubbles.
- Collapsed nav icons are circular bubbles with tooltip.
- `::before`/`::after` conic-gradient ring animates only on hover/focus-visible; no continuous active spin.

- [ ] Verify bubble/ring test fails on current sidebar CSS.
- [ ] Implement compact bubble and keyframes with warm violet/coral/amber palette.
- [ ] Add reduced-motion override.
- [ ] Re-run navigation/design targeted tests.

### Task 8: Full verification and release
**Files:**
- Modify: `CHANGELOG-V8.7.1.md`
- Modify: `VERIFICATION-V8.7.1.md`

**Interfaces:**
- Final ROOT-FLAT GitHub-ready ZIP with all source/backend/database/docs.

- [ ] Run `npm test` and require zero failures.
- [ ] Run frontend TypeScript/SFC syntax transpile and Edge TypeScript syntax checks.
- [ ] Run `node scripts/verify-release.mjs` and require PASS.
- [ ] Package ROOT-FLAT ZIP, extract it fresh, run `npm test` from extracted artifact, verify internal SHA manifest and outer ZIP checksum.
