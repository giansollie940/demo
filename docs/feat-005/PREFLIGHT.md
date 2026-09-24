# FEAT-005 preflight

Inspected 2026-09-14/15, Asia/Ho_Chi_Minh. All remote database operations were SELECT/catalog reads only.

## Source actually present

Initial workspace contained the supplied BUG-002-BANNER-REVIEW-V2.zip, PROJECT_CONTEXT.txt, DECISIONS.txt, WORKFLOW.txt and two SYSTEM_ACTOR_RESOLVED documents. It had no source checkout, no docs/feat-005 and no Git commit. Source was extracted under tu-hoc-bug-002 after archive paths were checked. No draft migration/test from the earlier ChatGPT session was present.

The archive already implements FEAT-001 through FEAT-004. Relevant migrations are database/upgrade/05 through 08. Frontend is Vue 3 + TypeScript + Vite. Existing tests use PGlite and Vue's virtual renderer. A legacy Supabase service supplies RPC/Edge access.

The supplied resolved documents were copied byte-for-byte into this directory and read before implementation. FEAT-004 multi-class/catalog rules supersede the old root document's single-class description. The user's high effort setting overrides the older medium recommendation.

## Live schema, read-only

Identified Supabase project tu-hoc, ref qhqqujozpqopahxscpks, PostgreSQL 17.6. Existing homework tables include notices, duplicate_reviews, reactions, reminders, notifications, contribution_events, tombstones, settings and catalog/class/group data. No FEAT-005 reports/corrections or deletion actor type columns existed.

All **19** relevant public/homework_private function definitions match the supplied source baseline exactly after normalizing line endings. See evidence/live-functions-before.json and evidence/baseline-function-comparison.json. This includes the public dispatcher, AI finalizer, maintenance and hard-delete contract. Migration history listed only five unrelated registered migrations, so source/schema matching—not migration-history names—was used to establish the deployed homework baseline.

Observed runtime contracts:

- Public homework_api delegates to private api_v3 through the FEAT-004 class/catalog dispatcher.
- All homework tables are protected through default-deny RLS and explicit client privilege revokes; privileged RPCs enforce actor/class scope.
- Old submit/delete code permits Teacher/Monitor override on another learner's notice. This is superseded by FEAT-005 ownership.
- Existing hard_delete requires deleted_by to be a human UUID and tombstones have a non-null soft_deleted_by. This must be refined for System attribution.
- Profiles contain student_code, full_name, role, class_id, active and deleted_at; reporter code is sourced from student_code, without exposing email.
- pg_cron is installed. The active job homework-backlog-feat001 currently calls public.homework_maintenance every ten minutes. Migration 09 proposes updating that existing named job to every minute, atomically with the new function. It has **not** been run remotely.
- A final read-only inventory found 1 notice, 0 currently deleted notices and 2 existing tombstones. Invalid legacy human deletion/tombstone attribution counts were both 0. No notice content or user identity was exported for these counts.

## Local validation boundaries

PGlite runs real PostgreSQL SQL/constraints/functions with isolated synthetic profiles and classes. It proves SQL behavior and role grants but does not simulate a multi-session native PostgreSQL lock race or a running pg_cron worker. Browser verification uses real Vue UI, headless Chrome, the migrated PGlite database and actual duplicate logic with a deterministic local AI provider. Live Supabase Auth, deployed Deno Edge runtime, live Groq and production scheduling are not exercised.

No production migration/deployment, data mutation, push, merge, or commit occurred.
