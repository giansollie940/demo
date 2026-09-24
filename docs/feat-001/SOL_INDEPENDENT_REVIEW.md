# FEAT-001 — SOL INDEPENDENT REVIEW

**Mode:** REVIEW_MODE  
**Artifact reviewed:** `FEAT-001-BAO-BAI-V1-REVIEW(1).zip`  
**Decision:** `BLOCKED`

## Evidence reviewed

- Latest project `PROJECT_CONTEXT.txt`, `WORKFLOW.txt`, and `DECISIONS_WITH_BAO_BAI_V1_PERMISSION_RESOLVED.txt`.
- Review bundle `docs/feat-001/FINAL_SPEC.md`, `SOL_SUPPLEMENT.md`, `IMPLEMENTATION_REPORT.md`, `FILES_CHANGED.txt`.
- `database/upgrade/05-FEAT-001-BAO-BAI.sql`.
- `supabase/functions/homework-review/index.ts` and `logic.js`.
- Homework frontend/API files and tests.
- Diff against the original V9 FULL source.

## Findings

### R-001 — BLOCKER — Quantitative rules are not canonical in FINAL SPEC / DECISIONS

**Related:** BR-010, BR-015, BR-017, BR-019; SPEC sections 21, 30, 33–34, 56; source-of-truth rules.

The implementation uses these values:

- duplicate candidate deadline window: `<= 24h`;
- edited deadline recheck threshold: `>= 24h`;
- reminder: max 2/notice/rolling 24h, minimum 6h spacing, max 10/actor/rolling 24h;
- backlog: >=5 pending notices aged >=24h, admin opt-in backlog/all, max one alert/24h until reset.

They appear only in `docs/feat-001/SOL_SUPPLEMENT.md`. The canonical FINAL SPEC still has only BR-001..BR-026 and AC-001..AC-042, and the canonical decision log has no decisions registering those quantitative rules. This task had previously been marked BLOCKED specifically because these values were not yet finalized.

**Required resolution:** Product Owner/Sol must explicitly approve the four values and register them in FINAL SPEC/DECISIONS before implementation can be judged against them. If approved unchanged, the current SQL/logic already matches those values.

### R-002 — BLOCKER — `publish_after_error` introduces a new publication path not defined by FINAL SPEC

**Related:** DEC-005, DEC-006, DEC-019; BR-012, BR-021; EC-010, EC-012.

The migration adds duplicate-review decision `publish_after_error`. On AI/provider failure, `homework_ai('finish')` stores an error and leaves the notice pending with no `duplicate_of`. Teacher/Admin UI then offers “Công bố sau khi kiểm tra”, which publishes the notice with a reason.

This behavior is not one of the three duplicate decisions defined by the SPEC (`keep_existing`, `replace_existing`, `keep_both`) and is not registered as a product rule. More importantly, when semantic AI fails while filtered candidates exist, those candidates are not persisted into `duplicate_of`; the manual fallback UI therefore does not show the candidate comparison before publication.

**Required resolution:** Sol/Product Owner must define the AI-failure resolution rule. Until then Astra must not invent a new publication decision. Safe current-spec behavior is to keep the notice pending and not publish it through an unspecified bypass path.

### R-003 — MEDIUM — Student duplicate-warning UX is only partially implemented

**Related:** Required Behavior section 25.

The SPEC requires a duplicate warning showing the existing notice's subject, title, deadline, author and posted time, with actions “Xem thông báo đã có” and “Sửa nội dung”. Current UI moves a non-published submission to History, shows a generic duplicate/pending state, and conditionally provides “Xem thông báo đã có”; editing is available through the card, but the required warning/details are not presented as specified.

**Required fix:** implement the explicit warning/detail experience for an eligible existing published candidate, without leaking other users' pending/private AI data.

### R-004 — LOW — Monitor limited queue projection returns extra fields beyond the locked business-field set

**Related:** BR-025, AC-039, DEC-027.

The monitor projection removes AI score/reason and several IDs/technical fields, which is good, but still inherits fields such as `published_at` and `icon` from `homework_private.card(...)`. AC-039 says the monitor should receive the locked business-field group.

**Required fix:** construct an explicit allow-list JSON projection for monitor queue rather than subtracting fields from the full card object.

## Positive findings

- No unexpected baseline files were changed; diff is limited to FEAT-001 migration/docs/homework UI/API/Edge/tests plus package dependency/build artifacts.
- New tables are RLS-enabled and direct authenticated table access is revoked; client mutations go through checked RPC/Edge flows.
- Student cannot set another `author_id`, publish directly, call the AI finalizer, self-heart, or decide duplicate cases based on code/test inspection.
- Teacher/admin and monitor permission boundaries generally match BR-023..BR-026; Teacher cannot change competition config and Monitor cannot override AI.
- English-group visibility and duplicate scoping are enforced server-side.
- Soft delete, reaction uniqueness, leaderboard separation, reminder quotas, candidate window and backlog rules are implemented in the database layer.
- AI key/provider calls are server-side; raw provider data is not returned to students.

## Independent verification performed

- `node --test tests/homework/ai.test.mjs`: **PASS — 4/4**.
- `npm test`: **PASS — 3/3 existing regression tests**.
- Full `npm run test:homework`: **NOT VERIFIED independently**. The ZIP does not contain dependencies; dependency installation in the review environment failed at npm CLI level and the database suite could not load `@electric-sql/pglite`.
- `npm run build`: **NOT VERIFIED independently** for the same dependency-installation limitation. A generated `dist/` is present, but it is not treated as proof of a fresh successful build.
- Live Supabase Auth/PostgREST/RLS, Edge deployment/CORS, Groq, scheduler, browser UAT and real multi-session concurrency: **NOT RUN**, consistent with the Implementation Report.

## Decision

`BLOCKED`

The implementation is not eligible for APPROVED because canonical product rules are incomplete and Astra introduced one unapproved publication path. Resolve R-001 and R-002 first. R-003 and R-004 then require implementation fixes/re-review unless Sol explicitly changes the corresponding Required Behavior.
