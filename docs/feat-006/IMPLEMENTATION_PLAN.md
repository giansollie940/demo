# FEAT-006 Implementation Plan

**Goal:** One private, compressed image per homework notice/correction revision, with recoverable uploads and durable cleanup.
**Architecture:** Keep Supabase as the authorization/source of truth. Pending uploads land in private R2 staging keys; the Edge function validates a bounded WebP and copies the verified bytes to a server-only immutable key. A PostgreSQL transaction attaches that key to the notice/revision. Durable outbox retries cover canceled, expired and hard-deleted objects, including late writes through outstanding PUT grants.
**Tech Stack:** Vue 3, TypeScript, IndexedDB, Canvas, Supabase SQL/RPC/Edge, R2 S3 API, PGlite, Vitest.
**Spec:** MEDIA_STORAGE_SUITE_FINAL_SPEC_V2.md and MEDIA_STORAGE_SUITE_DECISIONS_UPDATE.md (DEC-081 resolves CR-006).

## Constraints
- Only FEAT-006. FEAT-008 and FEAT-007 require previous-phase independent approval.
- One image, WebP, longest side 1600 px, initial quality .92, floor .85, hard limit 500,000 bytes; do not enlarge small images to reach target.
- No original upload, no public bucket, no client secrets, no stored signed URLs.
- Pending expires after 24 hours. Soft deletion retains images; legitimate hard deletion queues purge atomically with tombstone.
- Existing class/English visibility and author ownership remain authoritative. Private correction images are limited to author and assigned Teacher.
- Every R2 key is recorded before it can be written. Read URLs expire after 60 seconds. Staging PUT grants expire after 120 seconds.

## Tasks and verification
1. **Database lifecycle** (`database/upgrade/10-FEAT-006-HOMEWORK-MEDIA.sql`, `tests/feat-006/database.test.mjs`). Write failing permission/atomicity tests first. Add private metadata, references/history, RLS, user RPC, privileged sealing and cleanup RPC. Wrap existing homework API without bypassing FEAT-005. Verify cross-owner/class, correction confidentiality/approval, stale tokens, rollback, soft-delete/restore, hard-delete/outbox and expired pending.
2. **Object adapter** (`supabase/functions/homework-media/`, `_shared/media-*.js`, tests/feat-006/storage.test.mjs). Test bounded validation, checksum, immutable promotion and failures with an in-memory object adapter. Authenticate user JWT before metadata RPC and sign operations only after authorization. Worker uses a dedicated server secret and durable SQL jobs; retry never drops failed jobs.
3. **Composer and image viewing** (`src/features/homework/media*.ts`, `HomeworkImage*.vue`, HomeworkPage/Card/CorrectionPanel/AdminOversight). Test compression decisions and upload retry coordinator. Persist form + compressed Blob in IndexedDB scoped to user/class/notice/correction. Upload only on submit; expose explicit text-only fallback. Refresh signed reads and prevent stale scope results.
4. **Regression and handoff** (`docs/feat-006/`, scripts/verify-feat006.mjs). Run existing FEAT-005 gates against the new migration as well as media tests, typecheck/build, browser verification where available. Record unrun live R2/production checks explicitly. Package source, SQL, Edge bundles, deploy/CORS/worker instructions and evidence for independent review. Do not deploy.

## Retention and races
- Active and historical notice references and correction-round references protect media from replacement cleanup.
- Published history references retain the image until notice hard deletion; private correction history is not exposed via Admin oversight.
- Cancellation revokes future metadata authorization immediately. Outbox deletes now, then repeats after outstanding PUT/finalization grants have expired plus a request grace period, so a late upload cannot recreate an untracked object.
- Finalization is verified server-side before the application transaction. A failed application transaction leaves the verified pending object reusable by its author for the remaining 24-hour window.
- SQL class locks are shared with existing homework operations; no network request is held inside a DB transaction.
