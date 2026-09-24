# DB-HISTORY-12-13-14 — IMPLEMENTATION REPORT

## Status

IMPLEMENTED AND HISTORY RECONCILED

## Branch

`db/history-12-13-14`

Base main:
`3fb6cc43cc141110b0fec5230cdb1c2ac673b89d`

Generated migration commit:
`a6b145b1a5cd3910906cd01457a8d1e6bdf30f5f`

## Canonical migrations

Generated with Supabase CLI `migration new`:

1. `20260924130155_feat_007_archive_purge_history.sql`
2. `20260924130159_feat_010_device_use_lock_history.sql`
3. `20260924130202_feat_010_rc9_cascade_freeze_fix_history.sql`

Source mapping:

- A = `database/upgrade/12-FEAT-007-ARCHIVE-PURGE.sql`
- B = `database/upgrade/13-FEAT-010-DEVICE-USE-LOCK.sql`
- C = `database/upgrade/14-FEAT-010-RC9-CASCADE-FREEZE-FIX.sql`

The generation workflow byte-compared each canonical migration against its approved source and passed.

## FEAT-007 canonicalization decision

`12-APPLY-ON-PRODUCTION.sql` contains a production-only RC1 teardown followed by the approved RC6 installation.

That teardown is not part of the forward schema transition from the repository migration baseline and would be destructive in a fresh replay. Therefore the canonical migration records the approved RC6 forward installation only, using `12-FEAT-007-ARCHIVE-PURGE.sql`.

## Production history repair

The user executed history-only Supabase CLI repair for:

- `20260924130155`
- `20260924130159`
- `20260924130202`

Final CLI migration list reported 13/13 Local = Remote.

Supabase remote history was independently re-read after repair and contains exactly the same 13 versions.

## Production state after repair

Post-repair read-only verification confirms the database object state is unchanged from pre-repair evidence.

### FEAT-007

Present and unchanged:

- `school_years.archive_state`
- `homework_archives`
- `homework_archive_media`
- `homework_archive_steps`
- `homework_archive_events`
- archive private helper functions
- `homework_archive(text,jsonb)`
- `homework_archive_export(uuid,text,text,integer)`
- archive-aware `homework_api`
- archive-aware `homework_media`

RLS remains enabled on all four archive tables.

All recorded archive function-definition MD5 fingerprints match the pre-repair fingerprints exactly.

### FEAT-010

RLS remains enabled on:

- `device_use_lock_intervals`
- `device_use_session_overrides`
- `device_use_policy_signals`

Expected authenticated SELECT policies remain present.

Direct table privileges remain:

- anon: no SELECT/INSERT/UPDATE/DELETE
- authenticated: SELECT only
- service_role: SELECT only

`device_use_policy(text,jsonb)` remains callable by authenticated and service_role, not by PUBLIC/anon.

### RC9

`device_use_year_freeze_guard_rc9()` definition fingerprint remains:

`9265449d7f6ec4fc1b4cd9062ddcdbc3`

Exactly two freeze triggers remain attached:

- device_use_lock_intervals → trigger MD5 `969fa82d9e112b28b08e74e436eb3bb5`
- device_use_session_overrides → trigger MD5 `f5b0fe3d71f5015e9e77b1c95d06697c`

RC9 trigger function EXECUTE remains revoked from PUBLIC, anon, authenticated and service_role.

## Safety

Not executed:

- upgrade 12 SQL on production
- upgrade 13 SQL on production
- upgrade 14 SQL on production
- `supabase db push`
- `supabase db reset`
- `supabase migration up`
- direct SQL mutation of `supabase_migrations.schema_migrations`

No application behavior, RLS semantics or business rule was changed by this task.
