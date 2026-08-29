# R7 – Reference Image Source-of-Truth Redesign

## 1. Goal
Rebuild the Login and Dashboard presentation so the user-provided reference image is the primary visual source-of-truth rather than a loose style reference. Preserve existing authentication, routing, class/week selection, dashboard data flow, review workflow, Supabase integration, and Edge Functions unless a UI requirement explicitly needs a frontend adapter.

## 2. Scope

### In scope
- Login page visual architecture.
- Dashboard visual architecture.
- Desktop/laptop sidebar expanded/collapsed states.
- High-resolution Login and Dashboard hero artwork treatment.
- Dashboard KPI cards, task table, weekly progress panel, and motivation card.
- Responsive behavior for desktop, laptop, tablet, and mobile.
- UI component extraction and CSS/token cleanup directly supporting R7.
- Regression tests for the redesigned surfaces and preserved data contracts.

### Out of scope
- Database schema changes.
- Supabase auth model changes.
- Edge Function behavior changes.
- New login providers.
- GitHub OAuth/login. R7 explicitly removes the GitHub login option from the Login UI.
- Changes to teacher review/approval business logic.

## 3. Visual Source-of-Truth
The user-provided composite reference image is the canonical target for composition, hierarchy, density, illustration treatment, card proportions, spacing, and sidebar behavior. Figma R7 screens must be created from this reference first; production Vue/CSS is then implemented from the approved Figma nodes.

Implementation must not treat the reference as merely inspirational. Deviations are allowed only where existing product functionality requires them or responsive constraints demand them.

## 4. Login R7

### Composition
- One wide, immersive panorama occupying the main page surface.
- Brand and headline live directly on the panorama rather than inside a 50/50 split column.
- Student-group learning illustration is integrated into the central/right panorama.
- Login form is a floating card on the right side.
- Card must remain visually distinct but not dominate the panorama.

### Login card content
- Welcome heading and short helper text.
- Login code field.
- Password field with visibility toggle.
- Primary Login button.
- Existing school-issued-code authentication remains unchanged.
- No GitHub login button, divider, OAuth placeholder, or GitHub icon.

### Input behavior
- Icon, input, and trailing action share one continuous field surface.
- Chrome/WebKit autofill must not create differently colored white/blue end segments.
- Focus, error, disabled, and autofill states preserve continuous radius and background.

### Motion
- Motion belongs to illustration/decorative layers, not the whole login panel.
- Use subtle, low-amplitude animation only.
- `prefers-reduced-motion` disables nonessential motion.

## 5. Dashboard R7

### Sidebar
- Desktop/laptop default state: expanded, showing icon + function name.
- A visible collapse control reduces it to the existing compact Mac-like icon rail.
- Compact mode retains tooltips and current dock interaction quality.
- User/profile block remains at the bottom of expanded sidebar.
- Collapse preference may persist using the existing frontend preference mechanism if one already exists; no new backend persistence is required.

### Top bar
- Preserve existing school year, class, week, theme, and user controls.
- Restyle only as required to match the reference hierarchy.

### Dashboard hero
- Greeting and week context on the left.
- Student-group illustration on the right, visually integrated/full-bleed rather than placed inside a nested image card.
- Illustration must blend into the hero background without a separate border, radius, or shadow.
- Hero artwork uses high-resolution source assets and avoids enlarging undersized raster images.

### KPI cards
Four cards:
1. Students.
2. Registered.
3. Teacher action required.
4. Attention needed.

Each card includes:
- icon,
- primary value,
- label/context,
- trend badge when meaningful,
- mini sparkline when trend history is available.

If historical comparison data is unavailable, the UI must omit the trend/sparkline rather than invent data.

### Work queue table
Replace the simplified three-row summary with a real operational table based on available dashboard/review data. Target columns/fields:
- learner identity/avatar or initials,
- learner name,
- class,
- activity/registration summary,
- relevant timestamp,
- status,
- row action/menu when an existing action is available.

Tabs/filters mirror the reference only where underlying data supports them. No fabricated counts or statuses.

### Weekly progress
- Donut visualization.
- Legend with counts/percentages derived from real data.
- Adjacent motivation/status card when a meaningful computed message can be derived from current week metrics.
- No invented performance claim.

## 6. Asset Quality Strategy

### Raster artwork targets
- Login panorama: source width at least ~3000 px for desktop use.
- Dashboard hero: source width at least ~2400 px, preferably 2880–3200 px when the artwork spans a large desktop region.
- Avoid using screenshots of Figma as committed production artwork.
- Avoid repeated raster resizing/export cycles.

### Responsive delivery
- Use appropriate `srcset`/density variants when multiple raster sizes are committed.
- Preserve aspect ratio and crop intentionally with `object-fit`/`object-position`.
- Use SVG/vector assets for icons and simple decorative graphics where appropriate.

## 7. Component Architecture
Extract R7 UI responsibilities into focused components while reusing existing primitives where they remain suitable:
- `DashboardHero.vue`
- `KpiTrendCard.vue`
- `PendingTasksTable.vue`
- `WeeklyProgressCard.vue`
- `MotivationCard.vue`
- `SidebarProfileCard.vue`

Existing `AppShell.vue`, `SidebarNav.vue`, `TopBar.vue`, `LoginPage.vue`, and `DashboardPage.vue` remain orchestration points rather than accumulating all presentation logic.

Do not extract components solely for abstraction. Each extracted component must have a clear responsibility and reusable/testable interface.

## 8. Data Flow
- Login continues to invoke the current authentication path.
- Dashboard continues to consume the existing class/week/dashboard model.
- New presentational components receive already-computed values via props where possible.
- Trend/sparkline components receive real time-series/comparison data only if the current model exposes it or can derive it safely from already-fetched frontend data.
- Missing optional visual data results in graceful omission, not mock values.

## 9. Responsive Rules

### Desktop/laptop
- Expanded sidebar by default.
- Full reference-style dashboard density.
- Login panorama + floating right login card.

### Tablet
- Sidebar may default compact if horizontal space is insufficient.
- KPI grid becomes 2×2 as needed.
- Work queue and progress sections stack when required.
- Login card may overlap less of the panorama but retains floating-card visual hierarchy.

### Mobile
- Navigation becomes the existing mobile/drawer pattern.
- Login form becomes primary content; panorama/illustration is reduced or repositioned.
- Dashboard cards and table become vertically stacked/mobile-safe presentations.

## 10. Code Cleanup
R7 includes only cleanup directly related to the redesigned surfaces:
- remove superseded R6 hero/login selectors,
- remove unused R6 illustration assets,
- eliminate duplicate visual overrides,
- consolidate repeated spacing/radius/surface values into existing tokens or narrowly scoped R7 tokens,
- format touched Vue/CSS files for maintainability,
- update stale visual regression tests rather than keeping dead asset references alive.

No unrelated refactor is included.

## 11. Testing Strategy
Follow TDD for implementation.

Required regression coverage:
- GitHub login UI is absent.
- Existing login code/password flow remains wired.
- Continuous autofill field surface.
- Reduced-motion fallback.
- Desktop sidebar defaults expanded and can collapse/expand.
- Compact sidebar retains accessible labels/tooltips.
- Dashboard hero uses the R7 high-resolution asset treatment and no nested-image-card border/shadow.
- KPI values remain grounded in real dashboard model outputs.
- Work queue renders real available rows and honest empty states.
- Optional trends/sparklines disappear when data is unavailable.
- Responsive breakpoint contracts for desktop/tablet/mobile.
- No stale R6 assets/selectors referenced after cleanup.

Before release packaging:
- full static regression suite,
- release verifier,
- Vue typecheck and Vite production build when dependencies are available,
- archive extraction/integrity verification.

## 12. Acceptance Criteria
R7 is accepted when:
- Login composition materially matches the reference panorama + floating-card layout.
- GitHub login is completely removed from the UI.
- Dashboard composition materially matches the reference hierarchy and density.
- Desktop/laptop sidebar opens expanded by default and collapses to the compact Mac-like rail.
- Hero imagery is visibly sharp at common desktop DPRs and does not look stretched/soft from undersized sources.
- Dashboard values/statuses remain sourced from actual application data.
- Existing authentication, class/week selection, review workflow, and backend behavior remain intact.
- Touched code is cleaner than R6 and no superseded visual paths remain active.
