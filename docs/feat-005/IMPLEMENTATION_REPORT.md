# FEAT-005 — Implementation Report

**Status: READY_FOR_REVIEW (local implementation).**

**RC2 update, 2026-09-15:** RC1 review findings R-001/R-002 are fixed. See RC2_FIX_REPORT.md for the two-file UI change, pre-fix failures and real-browser re-verification. Current combined automated evidence is 134 passing tests; production verification boundaries remain unchanged.

**Astra effort: high**, as explicitly requested. Prepared 2026-09-15, Asia/Ho_Chi_Minh.

Governing documents: FINAL_SPEC_SYSTEM_ACTOR_RESOLVED.md, DECISIONS_UPDATE_SYSTEM_ACTOR_RESOLVED.md and the Product Owner-approved DECISIONS_ADDENDUM_2026-09-15.md. Original resolved documents are preserved unchanged. This report is not independent approval or release authorization.

## Implementation summary

Implemented ownership, Monitor reports, assigned-Teacher report processing/statistics, private correction drafts, resubmission, two rounds of exactly 72-hour eligibility, Teacher decisions, withdrawal, emergency removal, System attribution and hard-delete compatibility. Vue UI exposes only the appropriate role actions; the backend enforces the same permissions and state transitions.

The source was actually recovered from the supplied BUG-002-BANNER-REVIEW-V2.zip. There was no earlier FEAT-005 draft in the workspace. The supplied source's 19 homework functions were compared with live Supabase definitions using read-only queries and matched exactly. See PREFLIGHT.md and evidence/baseline-function-comparison.json.

No production mutation, migration execution, Edge deployment, frontend deployment, push, merge or commit occurred. No synthetic System profile/account was created.

## Files changed

The complete source inventory and before/after SHA-256 values are in FILES_CHANGED.json. SOURCE_CHANGES.patch compares current source with the supplied archive because the workspace has no baseline Git commit. Build output, installed dependencies, caches and this documentation are excluded from that source diff.

Created:

- database/upgrade/09-FEAT-005-OWNERSHIP-CORRECTION.sql.
- HomeworkModerationDialog.vue, HomeworkCorrectionPanel.vue and HomeworkReports.vue.
- src/features/homework/moderation.ts.
- tests/feat-005: isolated database fixtures, ownership/workflow/AI/replacement tests, UI/page tests, real-browser fixture and browser flow.
- Verification, baseline comparison, blocker reproduction and source-manifest scripts.
- docs/feat-005: specifications, approved addendum, plan, preflight, operations, this report, diff, file manifest and evidence.

Modified:

- src/pages/HomeworkPage.vue, HomeworkCard.vue, HomeworkAdminOversight.vue.
- src/features/homework/api.ts and view-context.ts; Owl guidance for the new tabs.
- supabase/functions/homework-review/index.ts to route authorized correction approvals through the existing AI pipeline.
- tests/bug-001/regression.test.ts: expected tabs now include correction/report, and the Teacher edit scenario edits the Teacher's own notice, as required by FEAT-005. Existing reminder and permission checks are retained.

Deleted: **NONE** in application source. No existing migration, data fixture or business subsystem was removed.

## Database changes

Migration 09 is additive and transactional, after migrations 05–08:

- Canonical deleted_actor_type on notices and soft_delete_actor_type on tombstones, constrained to valid user/System attribution. Manual deletions retain the actual UUID. System deletions use a null human UUID with explicit system type.
- Existing immutable tombstones receive a constant default user type without UPDATEing their historical values. The human deleter column becomes nullable only for valid System attribution.
- Restricted reports, corrections, correction_rounds and moderation_events tables; RLS enabled and direct client privileges revoked. Partial unique indexes enforce one open report per reporter/notice and one open correction per notice. Round constraints enforce 1–2.
- Public homework_api wraps the prior private dispatcher with ownership and correction gates. Prior dispatchers remain in the inaccessible private schema; no alternate public bypass was left behind.
- Reports and reporter identity stay out of public/author/Monitor/Admin daily payloads. Teacher gets report history, student code, class and per-reporter statistics. Report abuse has no automatic role/permission effect.
- Public notice fields remain unchanged while drafts/submitted revisions are private. Teacher approval applies the validated revision and preserves material-change checks. Material revisions remain pending until the existing AI/duplicate rules resolve them.
- Author notifications cover request, final round, approval, timeout, final rejection, withdrawal and emergency removal. They contain no report source or reporter identity. Deleted-notice notifications remain visible to their author.
- Separate restricted audit records cover all moderation transitions. Teacher rejection in round 2 retains the Teacher decision actor while terminal soft-delete attribution is System.
- All relevant transitions share the existing per-class transaction lock. State/version/round tokens reject stale and repeated submissions/decisions. Resubmission records the timestamp used at the deadline decision point and ends the author timer.
- Server-only maintenance performs idempotent expiry and preserves backlog work. Existing named pg_cron job is configured to run every minute when migration is later applied on a host with pg_cron. Eligibility is precisely 72 hours; background execution occurs on the next successful tick.
- Hard-delete retains Admin-only confirmation/reason/tombstone-before-purge behavior. New restricted operational children are purged with the target notice; existing minimal tombstone/history redaction rules remain intact.

## Product clarification discovered and resolved

Self-review reproduced a real interaction: duplicate replacement could move A to replaced while A still had an open correction and a stranded timer. Evidence is retained in replacement-correction-conflict.json.

The Product Owner explicitly selected: **block replacement while A has an open correction; Teacher must resolve that correction first**. The approved addendum is implemented both server-side and in the duplicate-review UI. Regression checks cover awaiting_author and awaiting_teacher, atomic denial without changing the deadline, and normal replacement after correction closes. replacement-correction-resolution.json confirms the original reproduction now resolves correctly. There is no outstanding product blocker from this finding.

## Verification results

Results are from executed commands; full logs and timestamps are in evidence/. The initial failed runs are retained under evidence/previous-* where available and described below.

| Check | Result | Evidence |
|---|---|---|
| FEAT-005 real PostgreSQL logic tests | PASS — 13 tests | database.log |
| FEAT-001/002 regression and AI logic | PASS — 43 tests | legacy-database.log |
| FEAT-004 database regression | PASS — 6 tests | feat004-database.log |
| Existing static/banner regression | PASS — 8 tests | static.log |
| Vue UI + BUG-001/FEAT-003/004/005 regression | PASS — 64 tests | ui.log |
| TypeScript/Vue typecheck | PASS | typecheck.log |
| Vite production build | PASS | build.log |
| Real browser flow, desktop/mobile | PASS — 7 recorded groups | browser.json and PNGs |
| Baseline/live function comparison | PASS — 19/19 exact | baseline-function-comparison.json |
| Approved replacement rule reproduction | PASS | replacement-correction-resolution.json |

**134 automated tests passed** across the five test groups. A passing build is a local artifact only.

The browser exercised the real Vue page and migrated PGlite database: Monitor report, Teacher report processing, correction request, author draft/save/resubmit, private board content, round 2, approval and duplicate logic, emergency removal, Admin Trash and role restrictions. No browser console/page/network errors were observed in the passing run, and the 390px viewport had no horizontal overflow. The AI provider was deterministic and local.

### NOT RUN

- Native PostgreSQL multi-session race/stress tests. PGlite serializes a single database session; both logical orderings and stale actions were tested, but this is not a simultaneous multi-connection lock proof.
- Actual pg_cron job firing, production scheduler latency and outage recovery. SQL maintenance behavior was exercised locally; pg_cron itself is unavailable in the fixture.
- Staging/production migration and live data backfill execution. Explicitly outside authorization.
- Deployed Supabase Auth/PostgREST/Deno Edge/Groq end-to-end verification. Browser tests use local synthetic actors and an isolated provider, not real accounts or deployed functions.
- Independent review by Sol. This package is prepared for that review; Astra self-review is not a substitute.

## Acceptance criteria mapping

PASS below means the cited **local** implementation/test evidence, subject to the NOT RUN boundaries above.

| AC | Result and evidence |
|---|---|
| 501 | PASS — other-author edits rejected by RPC; role-specific buttons absent; ownership and UI tests. |
| 502 | PASS — own valid edits succeed; correction drafts use dedicated author path. |
| 503 | PASS — Monitor-only report action on others' published notices; Student/Teacher/Admin denied. |
| 504 | PASS — reporter/time/category/note and restricted audit persisted. |
| 505 | PASS — no report identity/note in author/Student/Monitor/Admin daily payloads. |
| 506 | PASS — assigned Teacher sees identity/history; cross-class denial enforced. |
| 507 | PASS — valid, invalid and suspected_abuse outcomes with real Teacher actor. |
| 508 | PASS — per-reporter counts and human insight; no role change or report lock. |
| 509 | PASS — Teacher direct edit of another author denied. |
| 510 | PASS — issue type array/reason required; one open correction. |
| 511 | PASS — published board retained with correction badge. |
| 512 | PASS local — round-1 timeout, System attribution, notification and audit; live cron NOT RUN. |
| 513 | PASS — submitted state survives an overdue stored deadline and maintenance. |
| 514 | PASS — approval closes correction; unchanged edit can publish, material edit stays behind AI gate. |
| 515 | PASS — reject round 1 opens one new 72-hour final round; stale duplicate rejection denied. |
| 516 | PASS local — round-2 expiry soft-deletes. |
| 517 | PASS — final rejection causes System soft-delete; round 3/stale mutations rejected. |
| 518 | PASS — private draft/revision never replaces public fields before approval. |
| 519 | PASS — exact duplicate with semantic disabled, AI error/retry and stale finalizers tested after correction approval. |
| 520 | PASS — normal deletion blocked while open; withdrawal requires reason. |
| 521 | PASS — author withdrawal closes correction, retains human actor and audits. |
| 522 | PASS — emergency removal category/reason/Teacher scope, notification and soft-delete. |
| 523 | PASS — learner emergency attempts rejected. |
| 524 | PASS — Admin daily mutations denied; hard-delete remains available. |
| 525 | PASS — report payload/history restricted; no report source in author notification or board. |
| 526 | PASS local — maintenance idempotency and closed/submitted exclusions; live scheduler NOT RUN. |
| 527 | PARTIAL — shared-lock design and both serial outcomes verified; native concurrent sessions NOT RUN. |
| 528 | PASS — report/correction/deletion transitions persisted in restricted audit; hard-delete redacts/purges operational history. |
| 529 | PASS — deleted notices disappear from board, stop accepting hearts, and no longer count as active published contributions. |
| 530 | PASS local — report/correction/removal cross-class denials and direct-table/private-helper denials. |
| 531 | PASS local — 43 legacy DB/AI, 6 FEAT-004 DB, 64 UI and 8 static tests; targeted legacy behaviors also tested under 09. |
| 532 | PASS — timeout actor type system with null human UUID. |
| 533 | PASS — System-deleted notice passes Admin hard-delete, confirmation and tombstone/purge gates. |
| 534 | PASS — manual/withdraw/emergency deletions retain actual user UUID. |
| 535 | PASS — final rejection preserves separate Teacher decision actor and System deletion actor. |
| 536 | PASS — migration creates no profile/auth account; fixture profile count unchanged. |
| 537 | PASS — populated migration preserves existing tombstones and manual-deletion records. |

## Test → self-review → fix → re-test

1. Ownership test failed on the unmodified baseline because Teacher edit override was accepted. Migration 09 makes the same test pass.
2. First migration execution found a missing function-definition terminator; fixed and re-run successfully.
3. Early test-fixture expectations incorrectly counted unrelated catalog audit as notice-owned data and recreated an existing catalog label; corrected fixture/assertion scope without weakening purge checks.
4. Virtual UI tests required their existing Document/ShadowRoot stubs and explicit form submission; corrected the test harness, then all UI tests passed.
5. Regression expectations for Teacher override and old tabs were updated only where superseded by FEAT-005. The regression runner now separates FEAT-004's self-migrating fixture from FEAT004_UPGRADE runs.
6. Real browser flow completed but initially reported a missing fixture favicon; fixed the fixture resource and re-ran with zero console/network errors.
7. Self-review added AI regression checks, deadline timestamp consistency, Teacher moderation audit visibility, actor display names and immediate invalidation of in-flight role-scoped loads.
8. Duplicate-replacement interaction was reproduced, marked BLOCKED, resolved by the Product Owner's explicit decision, implemented and re-tested. The final UI test was corrected to select the queue tab with its dynamic count; all 62 UI tests then passed.

## Deviations and remaining limits

Unapproved business-rule deviations: **NONE**. The only additional rule is explicitly approved in the dated addendum.

No known unaddressed implementation blocker remains from the executed local checks. Native multi-session concurrency, live scheduler and deployed Auth/Edge integration remain verification gaps and should be evaluated by Sol before any release recommendation. Physical cron execution can be delayed by its tick or outage; deadline eligibility and synchronous late-submission rejection are enforced server-side.

Self-review result: **PASS within the executed local scope; READY_FOR_REVIEW, not release-approved.**

## Sol review entry points

Read the two resolved documents and the addendum, then this report, SOURCE_CHANGES.patch, FILES_CHANGED.json and the evidence logs. Review especially private report payload separation, prior-dispatcher access, deadline locking, correction approval's AI re-check, System attribution, tombstone-before-purge transactionality and the approved replacement guard. Reproduce using the commands in OPERATIONS.md. Do not infer live deployment readiness from the local PASS results.
