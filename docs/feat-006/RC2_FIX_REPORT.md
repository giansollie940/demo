# FEAT-006 RC2 — P1 fix report

**STATUS: READY_FOR_RE_REVIEW**  
**ASTRA_EFFORT: MEDIUM**  
**Finding:** Sol RC1 P1 — Monitor can obtain a fresh image read outside their English group.

## Fix

`public.homework_media('read', ...)` now checks current English membership directly for published peer images. A matching `english_group_members` row with `left_at IS NULL` is required when the notice has an English group. Monitor no longer inherits the legacy helper's role exemption.

The existing author branch, Teacher assigned-class access and Admin oversight are preserved. The shared `homework_private.visible()` helper and frontend are unchanged. This implements F6-RB-010 / AC6-09 as already specified; no new business rule or permission expansion is introduced. The existing helper's behavior for non-media endpoints is outside this focused correction and is not presented as newly fixed.

## Evidence

- `evidence/rc2-p1-before.log`: the new test failed against RC1 with `Missing expected rejection`.
- `evidence/rc2-p1-after.log`: the same scenario passed after the fix.
- Monitor same class with no E1 membership → denied.
- Monitor active in E2 only → denied for E1 image.
- Assign Monitor to E1 → allowed.
- Move Monitor to E2, closing E1 membership (`left_at` retained) → fresh read denied.
- Ordinary class image, assigned Teacher and Admin oversight → allowed as before.
- Function-only upgrade test loads the exact RC1 function body from the shipped baseline, reproduces the bypass, applies the RC2 patch twice, and verifies data preservation, unchanged shared helper and anon denial.

Fresh local regression logs in `evidence/verification-results.json` and corresponding command logs:

| Suite | Result |
|---|---:|
| FEAT-006 SQL/storage | 13 PASS |
| FEAT-006 frontend | 10 PASS |
| FEAT-005 under migration 10 | 13 PASS |
| FEAT-001/002 legacy SQL | 43 PASS |
| FEAT-004 SQL | 6 PASS |
| Static frontend regressions | 8 PASS |
| Existing FEAT-001–005 frontend | 64 PASS |
| **Total** | **157 PASS, 0 FAIL** |
| Frontend typecheck | PASS |
| Frontend production build | PASS |

The initial full run included a test using `group_assign(null)`, which the existing assignment API does not support. The test was corrected to use the existing reassignment flow (E1 → E2), closing E1 membership without changing product semantics. The media suite was then rerun successfully; other unchanged suite logs retain their fresh full-run timestamps.

## Deployment paths

- New FEAT-006 installation on FEAT-005 RC2: corrected `database/upgrade/10-FEAT-006-HOMEWORK-MEDIA.sql`.
- Existing FEAT-006 RC1 staging installation: `deploy/feat-006/rc1-monitor-read-fix.sql`. Do not rerun migration 10 over RC1 tables.
- Never deploy `tests/feat-006/fixtures/rc1-media-function.sql`; it intentionally reproduces the historical function for the upgrade test only.

No production deployment, remote SQL execution, bucket change or secret change was performed. R2/Edge code did not change from RC1.

## Files and review scope

Runtime source modified: `database/upgrade/10-FEAT-006-HOMEWORK-MEDIA.sql` only.

Added: function-only deployment patch, historical test fixture, Sol review copy, fix report, focused diff/evidence.

Tests modified: `tests/feat-006/database.test.mjs` (two integration tests).

Documentation updated: START-HERE, Deployment, Implementation Report, full-source diff and changed-file inventories. No source deletion; packaging metadata refreshed.

`RC2_SOURCE_CHANGES.patch` is the focused runtime/test/deployment diff against FEAT-006 RC1. `SOURCE_CHANGES.patch` remains the full implementation diff against FEAT-005 RC2. The ZIP includes SHA256SUMS.txt for verification.

## Remaining gates

Sol must re-review the actual RC2 code/diff and evidence. Browser/device, Deno runtime and live Auth/RLS/R2/CORS/cron checks remain NOT RUN/PARTIAL as documented in the Implementation Report. The database tests exercise the RPC before the Edge function would sign a URL; they do not claim an actual live signed-GET test. Previously issued URLs retain their original short expiry (up to 60 seconds).

FEAT-008 and FEAT-007 remain pending the agreed independent review gates. RC2 is not release-approved.
