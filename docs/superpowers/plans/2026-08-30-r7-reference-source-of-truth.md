# R7 Reference Source-of-Truth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild Login and Dashboard to materially match the approved reference image while preserving existing authentication, class/week context, review workflow, and backend behavior.

**Architecture:** Keep existing stores, queries, mutations, routing, Supabase adapter, and Edge Functions unchanged. Rebuild the presentation layer around focused Vue components, derive all dashboard values from current week/class data, and treat high-resolution R7 artwork plus Figma R7 nodes as the visual source-of-truth. Sidebar state remains a frontend preference and defaults expanded when no preference has been saved.

**Tech Stack:** Vue 3 SFC + TypeScript, Pinia, Vue Router, TanStack Vue Query, lucide-vue-next, scoped CSS/design tokens, Node static regression tests, Vitest unit tests where available.

**Spec:** `docs/superpowers/specs/2026-08-30-r7-reference-source-of-truth-design.md`

## Global Constraints

- Preserve existing school-issued login-code + password authentication behavior.
- Remove GitHub login UI completely; do not add a replacement OAuth provider.
- Preserve Supabase, database schema, Edge Functions, class/week selection, and review/approval business logic.
- Desktop/laptop sidebar defaults expanded when no saved preference exists and can collapse to the existing Mac-like icon rail.
- Dashboard values and statuses must come from actual fetched/current frontend data; do not fabricate trend or queue values.
- Missing historical data means trend badges/sparklines are omitted.
- Use `prefers-reduced-motion` for nonessential animation.
- R7 cleanup is limited to superseded Login/Dashboard/sidebar visual paths and assets.

---

### Task 1: R7 Figma source-of-truth and production artwork

**Files:**
- Create: `src/assets/images/r7-login-students@2x.png`
- Create: `src/assets/images/r7-dashboard-students@2x.png`
- Create: `src/assets/images/r7-login-panorama-soft@2x.png`
- Modify: Figma file `DQR4DZIO8mfJkZfcT4WoRE` with new `Login R7` and `Dashboard R7` frames.
- Test: `tests/v900-r7-assets-source.test.mjs`

**Interfaces:**
- Produces: committed 2x raster assets used only through imports in R7 Vue components.
- Produces: Figma node IDs recorded in the source regression test comments and release notes.

- [ ] **Step 1: Write the failing asset regression test**

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const files = [
  'src/assets/images/r7-login-students@2x.png',
  'src/assets/images/r7-dashboard-students@2x.png',
  'src/assets/images/r7-login-panorama-soft@2x.png',
]

test('R7 high density artwork exists and legacy R6 hero assets are absent', () => {
  for (const file of files) assert.equal(fs.existsSync(path.join(root, file)), true, file)
  assert.equal(fs.existsSync(path.join(root, 'src/assets/images/student-group-dashboard-blend.png')), false)
})
```

- [ ] **Step 2: Run test to verify RED**

Run: `node --test tests/v900-r7-assets-source.test.mjs`

Expected: FAIL because the R7 asset files do not exist and the R6 blend asset still exists.

- [ ] **Step 3: Produce high-resolution artwork from the approved reference without baking UI text into production components**

Use `/mnt/data/a_wide_high_resolution_ui_illustration_composite.png` as the canonical visual reference. Crop the student illustration regions, upscale once with Lanczos, apply a restrained unsharp mask, and export PNGs at 2x density. Generate a soft panorama background from the reference’s illustration/background region without the login form card. Do not repeatedly resize the same output.

- [ ] **Step 4: Build Login R7 and Dashboard R7 frames in Figma**

Create editable Figma frames at 1536×960 or 1440×900 matching the reference composition: panorama login with floating right card; expanded sidebar dashboard with hero, four KPI cards, work queue, progress donut, motivation panel. Use the R7 raster assets only for illustration regions; keep text/cards editable.

- [ ] **Step 5: Run asset regression test**

Run: `node --test tests/v900-r7-assets-source.test.mjs`

Expected: PASS.

---

### Task 2: Login R7 panorama and continuous authentication card

**Files:**
- Modify: `src/pages/LoginPage.vue`
- Modify: `src/styles/tokens.css` only if a narrowly-scoped R7 surface token is necessary.
- Test: `tests/v900-r7-login-source.test.mjs`

**Interfaces:**
- Consumes: `r7-login-students@2x.png`, `r7-login-panorama-soft@2x.png`.
- Preserves: `auth.login(code, password)` and existing post-login router navigation.

- [ ] **Step 1: Write failing Login R7 source contracts**

Tests must assert:

```js
assert.match(source, /login-panorama/)
assert.match(source, /login-card-float/)
assert.match(source, /r7-login-students@2x\.png/)
assert.doesNotMatch(source, /GitHub|github|oauth-divider/i)
assert.match(source, /:-webkit-autofill/)
assert.match(source, /prefers-reduced-motion/)
```

Also assert the login method still invokes the existing authentication store path rather than a new provider.

- [ ] **Step 2: Run Login test and confirm RED**

Run: `node --test tests/v900-r7-login-source.test.mjs`

Expected: FAIL on panorama/floating-card/R7 asset contracts.

- [ ] **Step 3: Rebuild Login template**

Keep the existing `<script setup>` authentication logic. Replace the 50/50 visual split with:

```vue
<main class="login-page-r7">
  <section class="login-panorama">
    <div class="login-brand-copy">...</div>
    <img class="login-students" :src="loginStudentsUrl" alt="" />
    <form class="login-card-float" @submit.prevent="login">...</form>
  </section>
</main>
```

No GitHub button/divider/icon is allowed.

- [ ] **Step 4: Implement continuous field surfaces and motion**

Use one wrapper per field with icon/input/trailing action inside the same `overflow:hidden` radius. WebKit autofill must paint the input transparent/current field surface. Apply subtle motion only to `.login-students`/decorative elements and disable it under reduced motion.

- [ ] **Step 5: Run Login test**

Run: `node --test tests/v900-r7-login-source.test.mjs`

Expected: PASS.

---

### Task 3: Sidebar R7 expanded default, compact dock, and profile card

**Files:**
- Modify: `src/layouts/AppShell.vue`
- Modify: `src/components/layout/SidebarNav.vue`
- Modify: `src/stores/preferences.ts`
- Create: `src/components/layout/SidebarProfileCard.vue`
- Test: `tests/v900-r7-sidebar-source.test.mjs`

**Interfaces:**
- Consumes: `preferences.sidebarCollapsed` and `preferences.toggleSidebar()`.
- Produces: `SidebarProfileCard` props `{ name: string; roleLabel: string; collapsed: boolean }`.

- [ ] **Step 1: Write failing sidebar contracts**

Assert that:
- no saved localStorage key => expanded (`sidebarCollapsed === false`),
- edge toggle remains accessible,
- expanded sidebar renders icon + text labels,
- compact state retains tooltip text,
- expanded footer renders a profile card using current user name/role,
- desktop sidebar is not forced full-height merely to place profile at bottom; use a coherent reference-style vertical card within the app shell.

- [ ] **Step 2: Run sidebar test and confirm RED**

Run: `node --test tests/v900-r7-sidebar-source.test.mjs`

Expected: FAIL because the R7 profile card/component and reference-style expanded treatment do not exist.

- [ ] **Step 3: Create `SidebarProfileCard.vue`**

Expose props and render initials/avatar fallback, name, role label, and online/status dot. In collapsed mode render a compact avatar-only treatment with accessible label.

- [ ] **Step 4: Integrate into `AppShell.vue` and restyle navigation**

Keep the existing toggle and dock transforms. Expanded state uses reference-like 190–210px sidebar width with visible labels; collapsed state keeps the compact Mac-like rail. Persist only explicit user toggles via the existing localStorage key.

- [ ] **Step 5: Run sidebar test**

Run: `node --test tests/v900-r7-sidebar-source.test.mjs`

Expected: PASS.

---

### Task 4: Dashboard R7 hero and grounded KPI cards

**Files:**
- Create: `src/components/dashboard/DashboardHero.vue`
- Create: `src/components/dashboard/KpiTrendCard.vue`
- Modify: `src/pages/DashboardPage.vue`
- Modify: `src/features/dashboard/dashboard-model.ts`
- Test: `tests/v900-r7-dashboard-kpi-source.test.mjs`
- Test: `tests/unit/dashboard-model.spec.ts`

**Interfaces:**
- `DashboardHero` props: `{ name:string; weekLabel:string; classLabel:string; syncLabel:string; illustrationSrc:string }`.
- `KpiTrendCard` props: `{ label:string; value:string|number; context?:string; icon:Component; tone:'blue'|'green'|'amber'|'violet'; trend?:{ direction:'up'|'down'|'flat'; value:number; label:string }; points?:number[] }`.
- Extend `DashboardMetrics` only with safely derived fields; do not invent historical series.

- [ ] **Step 1: Write failing model and source tests**

Model test covers current students/submitted/approved/revision/issues/completion and optional trend absence when no historical input is supplied. Source test requires `DashboardHero`, `KpiTrendCard`, R7 illustration import, and four manager KPI cards.

- [ ] **Step 2: Run tests and confirm RED**

Run: `node --test tests/v900-r7-dashboard-kpi-source.test.mjs && npx vitest run --configLoader runner tests/unit/dashboard-model.spec.ts`

Expected: source test FAIL; unit test may be unavailable if dependencies are not installed—record that separately.

- [ ] **Step 3: Create `DashboardHero.vue`**

Match Figma/reference composition: greeting/meta on left, full-bleed student illustration on right, no nested image-card border/radius/shadow.

- [ ] **Step 4: Create `KpiTrendCard.vue`**

Render icon/value/label/context. Render trend badge and sparkline only if corresponding props are present; otherwise omit the elements entirely.

- [ ] **Step 5: Integrate manager Dashboard KPI grid**

Teacher/admin manager metrics remain Students, Registered, Teacher Action Required, Attention Needed. Student/monitor role branches continue to render honest role-specific values.

- [ ] **Step 6: Run source/model tests**

Expected: all available tests PASS.

---

### Task 5: Real work queue table, weekly progress, and motivation card

**Files:**
- Create: `src/components/dashboard/PendingTasksTable.vue`
- Create: `src/components/dashboard/WeeklyProgressCard.vue`
- Create: `src/components/dashboard/MotivationCard.vue`
- Create: `src/features/dashboard/dashboard-presenter.ts`
- Modify: `src/pages/DashboardPage.vue`
- Test: `tests/v900-r7-dashboard-queue-source.test.mjs`
- Test: `tests/unit/dashboard-presenter.spec.ts`

**Interfaces:**
- `buildDashboardQueue({ registrations, users, className, nowMs }) => DashboardQueueRow[]`.
- `DashboardQueueRow = { id; studentId; studentName; studentCode; classLabel; content; timestampLabel; status; statusLabel; actionTo?:string }`.
- `buildMotivationMessage(metrics) => { title:string; body:string; tone:'success'|'info'|'warning' } | null` based only on current metrics.

- [ ] **Step 1: Write presenter unit tests**

Cases:
- teacher-action registration maps to learner identity/content/status;
- missing user uses safe fallback;
- timestamp prefers `updatedAt`, then `approvedAt`, then emergency/AI timestamps when parseable;
- empty queue returns `[]`;
- motivation message derives from current completion/attention counts without fabricating trends.

- [ ] **Step 2: Run presenter test and confirm RED**

Run: `npx vitest run --configLoader runner tests/unit/dashboard-presenter.spec.ts`

Expected: FAIL because presenter module does not exist. If Vitest is unavailable, also create equivalent static source contracts and record dependency limitation.

- [ ] **Step 3: Implement `dashboard-presenter.ts`**

Use `needsTeacherAction(row)` for operational queue eligibility and existing user/registration data only.

- [ ] **Step 4: Create `PendingTasksTable.vue`**

Render reference-like tabs only for supported local categories, learner initials/avatar fallback, name, class, content, timestamp, status, and existing action link when available. Empty state is explicit.

- [ ] **Step 5: Create `WeeklyProgressCard.vue` and `MotivationCard.vue`**

Donut and legend values come from current metrics. Motivation copy is deterministic from metrics; no unsupported performance claims.

- [ ] **Step 6: Integrate into `DashboardPage.vue` and run tests**

Expected: PASS.

---

### Task 6: R7 responsive behavior, cleanup, and release verification

**Files:**
- Modify: `src/pages/LoginPage.vue`
- Modify: `src/pages/DashboardPage.vue`
- Modify: R7 dashboard components created above.
- Modify: `src/layouts/AppShell.vue`
- Modify: `src/components/layout/SidebarNav.vue`
- Modify: `src/styles/tokens.css`, `src/styles/themes.css` only where R7 needs shared values.
- Delete: superseded R6 Login/Dashboard illustration assets/selectors no longer referenced.
- Test: `tests/v900-r7-responsive-cleanup.test.mjs`
- Test: all existing `tests/*.test.mjs`

**Interfaces:**
- No new backend interface.

- [ ] **Step 1: Write responsive/cleanup regression test**

Assert desktop expanded-sidebar and panorama layout contracts, tablet KPI 2×2/stacking contracts, mobile form-first/login and mobile navigation contracts, no GitHub UI, and no stale R6 asset/selectors referenced from `src`.

- [ ] **Step 2: Run test and confirm RED where cleanup remains**

Run: `node --test tests/v900-r7-responsive-cleanup.test.mjs`

- [ ] **Step 3: Implement final responsive rules and remove superseded selectors/assets**

Desktop/laptop matches reference density; tablet may compact navigation and use 2×2 KPI; mobile uses existing drawer/navigation pattern, form-first Login, and stacked dashboard sections.

- [ ] **Step 4: Run complete static suite**

Run: `npm run test:static`

Expected: 0 failures.

- [ ] **Step 5: Run release verifier**

Run: `npm run verify:release`

Expected: PASS, all packaged Edge ZIPs valid.

- [ ] **Step 6: Run dependency-backed checks when available**

Run: `npm run typecheck && npm run build`

Expected: PASS. If dependencies are unavailable, report the exact missing executable/error and do not claim these checks passed.

- [ ] **Step 7: Package and verify archives**

Create a complete GitHub-root R7 archive plus an R6.5→R7 overlay. Extract both into clean directories, run static/release verification in the full archive and static verification after applying overlay to a clean R6.5 tree, then compute SHA256 sums.

