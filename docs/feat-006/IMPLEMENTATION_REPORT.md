# FEAT-006 — RC2 implementation report

- Task: one private image per homework notice/revision.
- Status: **READY_FOR_RE_REVIEW**, not approved for release.
- ASTRA_EFFORT: MEDIUM.
- Baseline: user-supplied `SO-TU-HOC-FEAT-005-RC2-FULL.zip`.
- Scope: Phase 1 only, MEDIA_STORAGE_SUITE V2 + decisions including DEC-081. FEAT-008 and FEAT-007 are not implemented; their documents are retained as dependency references.
- No production deployment, migration, R2 configuration or secret changes were performed.

## RC2 — Sol finding P1

Sol returned REQUEST_CHANGES for Monitor English-group image isolation. The new regression first reproduced the RC1 bypass (`Missing expected rejection`), then passed after the backend fix. Evidence: `evidence/rc2-p1-before.log` and `evidence/rc2-p1-after.log`.

Published peer image reads now require no English group or an active matching `english_group_members` row (`left_at IS NULL`) for both Student and Monitor. The media RPC no longer delegates this branch to the legacy helper that exempts Monitor. Author access, assigned Teacher access and Admin oversight retain their existing branches. The shared `homework_private.visible()` helper, notice/reaction/inbox behavior and frontend are unchanged by RC2. This corrects implementation to F6-RB-010 / AC6-09; it does not introduce a business-rule change.

Tests cover Monitor with no membership, wrong group, E1 membership, leaving E1 through reassignment, preserved historical membership, ordinary non-English notice access, Teacher and Admin. A second test restores the exact RC1 function body, reproduces the bypass, applies the function-only upgrade twice and verifies denial, unchanged attachment data and unchanged shared helper, as well as grants and oversight access.

For new installations use corrected migration 10. For an existing RC1 staging database, use `deploy/feat-006/rc1-monitor-read-fix.sql` after review; do not rerun migration 10 over populated RC1 tables. No schema/data rewrite is needed. `tests/feat-006/fixtures/rc1-media-function.sql` is deliberately vulnerable historical test input and must never be deployed.

See `RC2_FIX_REPORT.md` and `RC2_SOURCE_CHANGES.patch` for the focused fix, alongside the updated full-source patch against FEAT-005 RC2.

## Implementation summary

The composer converts supported images to WebP locally, preserves shape, stores a recoverable form/Blob draft in IndexedDB, and uploads only on explicit submission. A one-image reference is finalized with the notice or correction in the existing database transaction. Text-only submission remains independent of storage availability.

Supabase remains the authority for roles, ownership, class/English-group scope and correction transitions. The Edge function authenticates the user and obtains a scoped upload ticket, validates the staged object's byte count, WebP frame dimensions and SHA-256, then promotes it to an immutable final key. The browser cannot write the final object. Failed notice validation leaves the verified pending image reusable for up to 24 hours. Short-lived read URLs are requested after authorization and never stored in database/local draft metadata.

Soft deletion keeps media; restore reuses the object. Published-image history and correction rounds retain references. Legitimate hard deletion records durable purge work in the same transaction as the existing tombstone operation. Failed R2 cleanup is retried rather than silently lost. Staging-only jobs never delete active final images. Claim tokens prevent stale acknowledgements from erasing a newer purge job. Year-end archive/purge is deliberately absent pending FEAT-007.

## Database changes

`database/upgrade/10-FEAT-006-HOMEWORK-MEDIA.sql` adds `homework_attachments`, `homework_notice_media`, `homework_media_history`, `homework_media_outbox`, `homework_media_receipts` and nullable media linkage to correction rounds. Media tables have RLS enabled and no direct anon/authenticated table grants. Explicitly checked RPCs serve user operations; the sealing/cleanup RPC is granted only to service_role. Internal functions are not callable by public/anon/authenticated.

The new `homework_api` wrapper delegates ordinary business rules to the RC2 implementation. Existing notices and tombstones are not rewritten. Two triggers enqueue deletion on notice purge and staging cleanup after attachment activation. Existing user/System deletion attribution is preserved. Migration is additive and transactional; it must only be applied after RC2 migration 09.

## Verification results

Latest logs are in `evidence/`; `verification-results.json` records command exit codes/timestamps. All commands below exited 0:

| Verification | Result | Coverage |
|---|---|---|
| FEAT-006 database/storage | 13 tests PASS | 10 PGlite integration tests; 3 in-memory object-adapter tests |
| FEAT-006 frontend | 10 tests PASS | Compression decisions, upload retry, local-draft composer, stale image reads |
| FEAT-005 under migration 10 | 13 tests PASS | Ownership, correction, System attribution, replacement, AI regression |
| Legacy database | 43 tests PASS | Existing FEAT-001/002 contracts with FEAT-004 upgrade fixture |
| FEAT-004 database | 6 tests PASS | Multi-class/catalog contracts |
| Static frontend regression | 8 tests PASS | Existing banner/layout assertions |
| Existing frontend suites | 64 tests PASS | FEAT-001/BUG-001/FEAT-002/003/004/005 component contracts |
| Frontend typecheck | PASS | vue-tsc -b |
| Production frontend build | PASS | Vite; build output included |
| Media Edge syntax bundle | PASS | esbuild parses both entrypoints and local imports; external npm unresolved |
| Browser/visual acceptance | **NOT RUN** | Local navigation returned ERR_BLOCKED_BY_CLIENT |
| Actual codecs/EXIF/HEIC on devices | **NOT RUN** | Compression tests inject a codec; real browser gate remains |
| Deno typecheck / Supabase Edge runtime | **NOT RUN** | Deno/Supabase CLI unavailable |
| Live Auth/RLS/R2/CORS/signing/cron | **NOT RUN** | No live credentials/configuration; local fixtures do not substitute for this |

Total automated local tests: **157 passed, 0 failed**. This count includes regression tests and does not imply live integration acceptance. PGlite roles/RPC tests verify SQL behavior; they do not prove production PostgREST/Auth/gateway settings or multi-connection races.

## Acceptance criteria

“LOCAL PASS” means the named deterministic tests/code checks passed. “PARTIAL” explicitly means required real-runtime acceptance remains unverified.

| Criterion | Status | Evidence / outstanding check |
|---|---|---|
| AC6-01 formats | PARTIAL | Format allowlist, conversion/failure tests; actual devices not run |
| AC6-02 HEIC, aspect/orientation | PARTIAL | Native decode with orientation handling and safe rejection; actual HEIC/EXIF samples not run |
| AC6-03 no crop | LOCAL PASS | Full-frame drawImage, aspect-ratio tests, object-fit contain; visual check pending |
| AC6-04 WebP .92 / 1600 px | LOCAL PASS | image.test.ts verifies codec arguments/dimensions |
| AC6-05 >500 KB rejected | LOCAL PASS | Client hard cap, SQL constraints, bounded server validator tests |
| AC6-06 draft does not upload | LOCAL PASS | composer.test.ts checks no network call until submit and scoped recovery |
| AC6-07 pending reuse | LOCAL PASS | Upload coordinator and transaction-failure/idempotency tests |
| AC6-08 expired cleanup | PARTIAL | Expiry/outbox/ack tests pass; actual deployed scheduler and R2 deletion not run |
| AC6-09 scope enforcement | LOCAL PASS | Direct grants, forged class, Student and Monitor active/ended English membership, assignment revocation tests; live gateway tests pending |
| AC6-10 private revision | LOCAL PASS | Author/Teacher access, peer/Monitor/Admin rejection, public old image until approval |
| AC6-11 hard-delete lifecycle | PARTIAL | Durable purge, stale acknowledgements and System tombstone tests pass; physical R2 removal not run |
| AC6-12 secrets outside frontend | LOCAL PASS | Secret names/values consumed only in server adapter; no R2 credential configuration in frontend |
| AC6-13 URL not persisted | LOCAL PASS | SQL stores keys/IDs; IndexedDB stores Blob/binding/retry state; signed URL is transient |
| AC6-14 text still works on R2 failure | LOCAL PASS | Failed removal still permits text payload; baseline text flows pass under migration 10 |

## Self-review and fixes

- Verified author-only media mutation, same-class binding, revision/correction binding, pending expiration, failed finalize rollback and idempotent image-bearing retries.
- Verified correction-round-two inheritance and terminal System soft deletion preserve image references, while Admin can still hard-delete via FEAT-002 rules.
- Fixed a composer race: removing a pending image now blocks submission/selection until cancellation settles; a stale response after closing cannot clear a new composer. Text-only fallback remains available on cancellation failure.
- Fixed a test-only clock flake in FEAT-005: the overdue helper used two clock_timestamp calls, occasionally violating the exact 72-hour constraint by 1 ms. Both now use the same statement timestamp; no product timeout rule changed.
- Existing active-image history stays retained. Only unreferenced superseded drafts can be queued early. No archive gate is bypassed for year-end purge because that action does not exist in this phase.
- No new permission for Admin daily operations, no new ranking/duplicate formula, no original multi-MB upload, no public bucket, no synthetic System user.

Self-review result: **local checks passed; live/browser release gates remain open**. Sol independently reviewed RC1 and requested P1. RC2 self-checks passed; independent RC2 re-review is still pending.

## Known risks and release gates

1. Run the concrete live checklist in `DEPLOYMENT.md` before release, especially Deno import/type compatibility and browser PUT signing with Content-Length/CORS.
2. Browser-native HEIC support varies. Unsupported decode returns a conversion message, never uploads the original. Real EXIF orientation and alpha behavior need device coverage.
3. WebP server validation is structural/header/checksum validation, not complete compressed-frame decoding. The UI can still reject corrupt image display. It does not serve uploads as executable content.
4. GET URLs are bearer capabilities valid up to 60 seconds; already-issued URLs cannot be recalled by a metadata permission change. New issuance always rechecks scope.
5. Physical deletion can lag during outages. The durable outbox and staging-only lifecycle backstop must be configured and monitored. The 24-hour bound is for reuse authorization; it is not a claim of exact-time physical deletion during downtime.
6. Local IndexedDB can be unavailable or evicted. The composer reports that persistence failed and keeps the in-memory text/image state for retry. Clear local drafts on shared-device browser maintenance; drafts are scoped by account/class, not encrypted against local device access.
7. Tests serialize PGlite calls; production parallel transaction/load testing remains outstanding. SQL locks, unique constraints and claim tokens are present, but this is not a claim of load testing.

## Deviations

No intentional business-rule changes. Implementation uses a 500,000-byte conservative hard cap, two-phase staging/immutable objects and a durable cleanup outbox. Real-runtime acceptance is incomplete as explicitly listed above; status must not be promoted to release-approved on the strength of local tests alone.

## Files changed

See `evidence/changed-files.json` for the full baseline comparison, including generated build and function ZIPs. Source changes are also provided in `SOURCE_CHANGES.patch`.

Created: migration 10; media composer/draft/upload/compression modules; HomeworkImage component; media Edge endpoints/shared adapter; media tests and local preview fixture; verification script; deploy templates and review documentation.

Modified: HomeworkPage, HomeworkCard, HomeworkCorrectionPanel, HomeworkAdminOversight, homework API types/client; Edge packaging script; FEAT-005 fixture opt-in upgrade and test clock helper.

Deleted source files: **NONE**. Old hashed build assets were replaced by the current build.
