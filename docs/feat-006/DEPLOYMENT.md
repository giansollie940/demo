# FEAT-006 — Deployment and acceptance runbook

Status: REVIEW CANDIDATE. No remote migration, bucket, secret, schedule or deployment was changed in this task. Independent Sol review and the owner's release decision are still required. FEAT-008 and FEAT-007 are separate subsequent phases.

## RC1 → RC2 upgrade

Sol P1 is fixed only in the media read RPC; the shared visibility helper is unchanged. If RC1 migration 10 is already applied, run `deploy/feat-006/rc1-monitor-read-fix.sql` after review instead of rerunning migration 10. The function-only patch is repeatable and preserves populated media metadata. A fresh FEAT-005 RC2 baseline uses the corrected migration 10 directly. Never execute the historical function under `tests/feat-006/fixtures/`: it is test-only input used to reproduce the old vulnerability.

## Baseline and order

Use the supplied FEAT-005 RC2 project as the baseline. Back up the target database and verify that migrations 01–09, especially the RC2 System actor correction workflow, are present. Do not rerun earlier migrations blindly. Apply `database/upgrade/10-FEAT-006-HOMEWORK-MEDIA.sql` once in a transaction. It adds empty media tables and nullable correction columns; existing notice content, deletion attribution and tombstones are not rewritten. The source keeps the project's numbered SQL migration convention (no CLI was available in the implementation environment).

After SQL, deploy `homework-media` and `homework-media-cleanup`, then the frontend build. The full package also retains the existing functions. `node scripts/package-edge-functions.mjs` generates the self-contained deployment ZIPs. `deploy/feat-006/config-fragment.toml` supplies the two function settings: gateway JWT verification is disabled **only** for these handlers, since the first validates the user with existing `requireActor`/Auth and executes user-scoped RPCs, and the second validates a dedicated server secret. Do not weaken other functions or SQL grants.

Before live use, run Deno typechecking and serve/deploy tests with the actual Supabase runtime. Frontend TypeScript checks do not cover Deno imports. The adapter pins `aws4fetch@1.0.20`; runtime resolution and real R2 signing remain a release gate.

## Private R2 configuration

Create a bucket for homework images with public development URLs and public custom domains disabled. Use an R2 token scoped to that bucket with object read/write/delete capability. Store these **only** as Edge secrets:

- `R2_ACCOUNT_ID`
- `R2_HOMEWORK_BUCKET`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `MEDIA_MAINTENANCE_SECRET`: cryptographically random, at least 32 characters, dedicated to cleanup.

Existing Supabase server credentials and `ALLOWED_ORIGINS` continue to use the established configuration. Never add R2 credentials or the cleanup secret to `VITE_*`, frontend files or logs.

Apply `deploy/feat-006/r2-cors.json`, replacing/adding only the actual trusted frontend origins. PUT signs Content-Type and Content-Length; the browser sets Content-Length from the compressed Blob. Verify this with each supported browser against R2 before release. Upload URLs last at most 120 seconds and target only `pending/<class>/<attachment>/upload.webp`; final objects are server-written at `homework/<class>/<attachment>/image.webp`. Immutable promotion validates byte count, WebP container/frame dimensions and SHA-256, then uses conditional creation and readback. It is a bounded format check, not a full server-side image decoder.

Signed URLs are bearer capabilities until expiration. GET URLs last 60 seconds and are refreshed after a fresh permission check. Revocation prevents new URLs immediately; an already issued URL can remain usable for that short lifetime. Signed URLs are not persisted in PostgreSQL or IndexedDB. Application responses and final object cache policy use `no-store`.

CORS must be configured even with signed URLs; see [Cloudflare's CORS documentation](https://developers.cloudflare.com/r2/buckets/cors/). Keep the bucket private; CORS is not an authorization boundary.

## Pending expiration and cleanup

Enable pg_cron, pg_net and Vault. Create the two named Vault secrets documented in `deploy/feat-006/schedule-cleanup.sql`; apply that template only after deploying the cleanup endpoint. The same secret must be in Vault and the Edge environment. The schedule invokes cleanup every minute, independently of browsers. This follows [Supabase's scheduling approach](https://supabase.com/docs/guides/functions/schedule-functions), using a dedicated server bearer secret instead of a user identity.

Pending reuse is rejected after exactly 24 hours. Physical removal occurs on the next successful worker pass and can be delayed during an R2 outage. Cancel attempts cleanup immediately; failures remain queued. An early deletion is followed by a final sweep after any outstanding upload/promotion grant plus a three-minute grace period. Metadata is retained until the final successful sweep. Sealed active uploads queue staging-only cleanup; legitimate notice hard-delete transactionally queues a full purge, so loss of R2 connectivity does not lose deletion work.

Configure a **staging-only** R2 lifecycle expiration for prefix `pending/` after two days as a backstop for very late client writes. Never configure age-based expiration on `homework/` or the whole bucket: active/soft-deleted/history images must be preserved. Staging is disposable transport; final objects remain protected by SQL references and the outbox. Confirm the prefix in the dashboard before enabling. Year-end purge is not implemented and must await FEAT-007 VERIFIED archive plus Admin confirmation.

Monitor failed Edge invocations and PostgreSQL `homework_media_outbox` (attempts, next_attempt_at, last_error) with a trusted operator connection. Cron dispatch success does not prove HTTP success. The worker is idempotent, uses claim tokens, and retries claimed-but-unacknowledged jobs after five minutes. No user-facing storage health module is included in this phase.

## Required live smoke tests (NOT RUN in this environment)

1. Deno checks and function startup; unauthenticated/expired JWT denied; forged user/class/attachment denied. User credentials must not invoke the service sealing/cleanup RPC. Invalid cleanup secret rejected.
2. Desktop and mobile: JPEG with rotated EXIF, PNG alpha, WebP and actual HEIC/HEIF. Unsupported HEIC must show a clear conversion message and must never upload the original. Check aspect, orientation, long-side limit, output size, text wrapping and image enlargement.
3. Choose image then reload before submit: restore the local draft; no R2 write until explicit submit. Force finalize validation failure after upload, retry and verify no second upload. Verify Content-Length/Type signatures, CORS, expired PUT, and GET refresh.
4. Two classes and English groups: peer visibility exactly follows the existing container scope. Assignment revocation denies fresh signed GET. Pending image is author-only; correction image is author/assigned Teacher only, including direct requests by Admin.
5. Save correction draft, resubmit, reject into round two, approve or terminal System delete. Old public image remains until approval. Restore uses the same object. Existing AI/duplicate handling remains in force.
6. Cancel, expiration, replacement, late PUT, cleanup outage/retry, hard-delete and System-deleted notice hard-delete. Confirm object bytes really disappear on successful purge and tombstone attribution stays intact. Confirm preserved historical references are not purged.
7. Disable R2 access: image flow shows retry/text-only option; text posting still works. Check no keys/secrets/URL query strings in client diagnostics or stored application data.

## Local verification and limitations

`npm ci` then `node scripts/verify-feat006.mjs` runs local PGlite database and Vue component regressions, frontend typecheck and build. `node tests/feat-006/preview-server.mjs` supplies a local fixture for manual browser review at `http://127.0.0.1:4176/tests/feat-006/preview.html`; it uses fixture identities and in-memory storage, not actual Auth or R2. Do not deploy that test server. Browser automation in this session returned `ERR_BLOCKED_BY_CLIENT`; no browser pass is claimed.

Rollback frontend/functions to RC2 if necessary but retain media tables, references and cleanup capability. Do not drop populated media tables or objects as a rollback shortcut. New media can remain hidden until the fix is reviewed. Restoring a database backup must be coordinated with object retention to avoid losing the metadata for existing files.
