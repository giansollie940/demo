# Admin Hard Delete + Vertical Dock + Vanilla Background Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Admin a full system manager for learners and teachers with audited hard-delete, expose seven direct Admin navigation destinations including audit logs, correct the vertical macOS Dock behavior, and restore the vanilla background in light mode while preserving smooth dark mode.

**Architecture:** Keep the existing Vue/Supabase boundaries. Admin destructive actions remain server-enforced in Edge Functions; teachers retain soft-delete only. Admin system areas remain on `/admin` and are selected by `?tab=` so direct sidebar items do not duplicate pages. Audit logs are exposed through a new root-admin-only Edge action. Dock behavior is implemented only in navigation layout/CSS and background behavior only in the shell/theme layer.

**Tech Stack:** Vue 3, TypeScript, Pinia, Vue Router, TanStack Vue Query, Supabase Edge Functions (Deno), PostgreSQL, Node test runner.

**Spec:** Conversation-approved scope on 2026-08-27: Admin seven direct functions, hard-delete learners/monitors/teachers, teacher soft-delete, audited destructive actions, vertical Dock displacement to the right, logo safe zone, vanilla light background, dark overlay only.

## Global Constraints

- Root Admin remains unique and cannot hard-delete self or another root admin directly.
- Admin hard-delete teachers only when there are no active class assignments.
- Teacher delete remains soft delete and class-scoped.
- Hard-delete learner/monitor may remove dependent learning data according to existing FK/cascade rules; audit snapshot must survive.
- No server secret is added to frontend source.
- Existing year/week/period/lifecycle behavior must remain green.
- `prefers-reduced-motion` must disable Dock magnification and ring rotation.

---

### Task 1: Admin user-management and hard-delete contract

**Files:**
- Modify: `supabase/functions/admin-delete-user/index.ts`
- Modify: `supabase/functions/admin-list-users/index.ts`
- Modify: `src/services/legacy-supabase.ts`
- Modify: `public/supabase-service.js`
- Modify: `src/features/admin/admin-directory.ts`
- Create: `src/components/admin/AdminStudentCard.vue`
- Modify: `src/components/admin/AdminTeacherCard.vue`
- Modify: `src/pages/AdminPage.vue`
- Test: `tests/v871-admin-hard-delete-audit-ui.test.mjs`

**Interfaces:**
- `admin-delete-user` consumes `{ userId, confirmCode, mode: 'soft'|'hard', confirmPhrase? }`.
- Hard delete returns `{ ok:true, hardDeleted:true, deletedUser:{...} }`.
- Teacher soft delete remains `{ mode:'soft' }` and is class-scoped by backend permissions.

- [ ] Write failing tests for Admin learner directory and hard-delete rules.
- [ ] Verify the tests fail on current source.
- [ ] Implement root-admin-only hard delete with self/root-admin/teacher-assignment guards and pre-delete audit snapshot.
- [ ] Expose Admin learner/teacher controls in AdminPage; keep teacher page soft-delete semantics unchanged.
- [ ] Run focused tests to green.

### Task 2: Seven direct Admin destinations + audit log

**Files:**
- Modify: `src/features/navigation/navigation.ts`
- Modify: `src/pages/AdminPage.vue`
- Create: `src/components/admin/AdminAuditLog.vue`
- Create: `supabase/functions/audit-log/index.ts` or extend existing action safely
- Modify: `src/services/legacy-supabase.ts`
- Modify: `public/supabase-service.js`
- Test: `tests/v871-admin-hard-delete-audit-ui.test.mjs`

**Interfaces:**
- Admin sidebar items route to `/admin`, `/admin?tab=years`, `/admin?tab=classes`, `/admin?tab=students`, `/admin?tab=teachers`, `/admin?tab=permissions`, `/admin?tab=audit`.
- Audit endpoint is root-admin-only and accepts bounded filters: date range, actor, action, entity type, class id, text query, limit.

- [ ] Write failing tests for seven Admin navigation items and audit UI/API contract.
- [ ] Verify RED.
- [ ] Implement direct Admin navigation and audit listing/detail drawer.
- [ ] Run focused tests to green.

### Task 3: Vertical macOS Dock displacement

**Files:**
- Modify: `src/components/layout/SidebarNav.vue`
- Modify: `src/layouts/AppShell.vue`
- Test: `tests/v871-admin-hard-delete-audit-ui.test.mjs`

**Interfaces:**
- Hovered item moves only on X axis to the right.
- Neighbor items move away on Y axis and scale slightly smaller than hovered.
- First nav item remains below a fixed brand safe zone.

- [ ] Write failing source-contract tests for X-only hover displacement, neighbor Y displacement, and brand safe zone.
- [ ] Verify RED.
- [ ] Implement the Dock transform and spacing behavior, retaining one-shot conic-gradient rotation.
- [ ] Run focused tests to green.

### Task 4: Vanilla light background + dark overlay

**Files:**
- Modify: `src/layouts/AppShell.vue`
- Modify: `src/styles/themes.css`
- Test: `tests/v871-admin-hard-delete-audit-ui.test.mjs`

**Interfaces:**
- Light mode renders the school image at full opacity/no blend overlay.
- Dark mode adds a separate charcoal-plum overlay layer with transition.

- [ ] Write failing tests for no light overlay/multiply and dark-only overlay.
- [ ] Verify RED.
- [ ] Implement independent image layer plus dark overlay pseudo-element.
- [ ] Run focused tests to green.

### Task 5: Release verification and packaging

**Files:**
- Modify: `CHANGELOG-V8.7.1.md`
- Modify: `DEPLOYMENT-V8.7.1.md`
- Modify: `VERIFICATION-V8.7.1.md`
- Modify: `database/verify/VERIFY-V8.7.1.sql` only if hard-delete safety needs a DB invariant check.

- [ ] Run full `npm test`.
- [ ] Run frontend/Edge syntax checks available in the environment.
- [ ] Run `npm run verify:release`.
- [ ] Build ROOT-FLAT and DEPLOY-ONLY archives.
- [ ] Extract final ROOT-FLAT and rerun tests/checksums/Edge ZIP integrity.
