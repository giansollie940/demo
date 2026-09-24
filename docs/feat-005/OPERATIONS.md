# FEAT-005 deployment and verification notes (not executed)

Do not deploy while the Implementation Report is BLOCKED or before independent review and human release authorization.

## Intended sequence after approval

1. Verify production/source still match the captured baseline. Back up and confirm recovery for notices, tombstones and existing child data. Use a staging copy with representative data first.
2. Apply database/upgrade/09-FEAT-005-OWNERSHIP-CORRECTION.sql once, after 05–08. The migration is a single transaction; preflight/schema/cron errors roll it back. Existing immutable tombstones receive a constant default attribution column without UPDATEs to historical rows.
3. Inspect new constraints, function grants, private schema access and scheduler registration. Native PostgreSQL concurrent resubmit/timeout and hard-delete/restore tests are required before release.
4. Deploy the modified homework-review Edge Function together with the UI. It accepts correction_decide through the same authenticated RPC and applies the existing duplicate/review pipeline after approval. A direct RPC approval leaves a material edit pending for the usual AI retry; it cannot self-publish.
5. Smoke-test assigned Teacher, Author, Monitor, ordinary Student, Admin and cross-class denial. Verify private reporter data never enters Student/Monitor/Admin daily payloads.

## Scheduler

The existing named job homework-backlog-feat001 is updated to `* * * * *` when pg_cron is installed. It calls the server-only public.homework_maintenance function. Existing backlog work remains chained. No client-side timer is responsible for mutation.

Eligibility is exactly requested_at + interval '72 hours'. At/after that boundary, author mutation synchronously resolves timeout rather than accepting a late resubmission. The stored resubmission timestamp is captured after acquiring the shared class lock, at the same boundary check. Physical background removal occurs at the next successful cron tick (normally within a minute; outages delay execution). It never expires awaiting_teacher or closed corrections.

If a staging environment lacks pg_cron, invoke homework_maintenance using a trusted scheduler/service role. Client roles cannot call maintenance or private helpers. Do not create a System user/account.

## Recovery

Before migration commit, any failure rolls back the transaction. After records have been created, prefer a reviewed forward fix. Do not simply drop new correction/report tables or restore old dispatcher permissions; that would lose history and reopen ownership bypasses. For a full rollback, restore a verified backup and coordinate application/Edge versions. No destructive rollback script is supplied or executed.

## Reproduction commands (PowerShell)

```powershell
npm ci --ignore-scripts
node scripts/inspect-feat005-baseline.mjs
node scripts/verify-feat005.mjs
node tests/feat-005/browser.mjs
python scripts/feat005_manifest.py
```

The browser script currently uses locally installed Chrome at C:/Program Files/Google/Chrome/Application/chrome.exe. Adjust that test-only executable path for other hosts. The preview server binds only 127.0.0.1:4175. It has synthetic actors and must never be deployed.

## NOT RUN in this implementation session

- Production/staging migration and live data backfill verification.
- Native PostgreSQL multi-session concurrency tests (PGlite is single-session).
- Actual pg_cron worker firing and scheduler outage recovery.
- Deployed Supabase Auth/PostgREST/Deno Edge end-to-end tests and live AI provider calls.
- Independent review by Sol.

These are distinct from the executed local SQL, UI, browser, regression, typecheck and build checks.
