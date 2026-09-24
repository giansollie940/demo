# DB-HISTORY-12-13-14 — PRE-REPAIR EVIDENCE

## Branch

`db/history-12-13-14`

Base main:
`3fb6cc43cc141110b0fec5230cdb1c2ac673b89d`

Generated migration commit:
`a6b145b1a5cd3910906cd01457a8d1e6bdf30f5f`

## Supabase CLI generation

GitHub Actions run:
`36002868745`

Result: SUCCESS

Three migration filenames were created by current Supabase CLI with `migration new`, in the required order:

1. `20260924130155_feat_007_archive_purge_history.sql`
2. `20260924130159_feat_010_device_use_lock_history.sql`
3. `20260924130202_feat_010_rc9_cascade_freeze_fix_history.sql`

No timestamp was manually invented.

The generated files were then populated from the approved repository sources and byte-compared successfully:

- A == `database/upgrade/12-FEAT-007-ARCHIVE-PURGE.sql`
- B == `database/upgrade/13-FEAT-010-DEVICE-USE-LOCK.sql`
- C == `database/upgrade/14-FEAT-010-RC9-CASCADE-FREEZE-FIX.sql`

## Why migration A uses 12-FEAT-007-ARCHIVE-PURGE.sql

`database/upgrade/12-APPLY-ON-PRODUCTION.sql` is an operational recovery script for a production database that already had RC1. Its first transaction deliberately destroys the RC1 archive implementation and returns the database to the pre-FEAT-007 shape; its second part installs the approved RC6 implementation.

That RC1 cleanup is not a canonical forward migration from the current migration baseline and would be destructive if replayed in a fresh chain.

Therefore the canonical forward migration is the final approved RC6 install source:
`database/upgrade/12-FEAT-007-ARCHIVE-PURGE.sql`.

The production database was previously reconciled to that final RC6 state. No cleanup/reset section is included in the canonical migration.

## Current remote migration history

Remote history has exactly 10 entries before repair, ending in:

- `20260924040615_sec_sql_hardening_001_trigger_acl`
- `20260924040619_sec_sql_hardening_002_anon_helpers`

No unexpected remote-only migration was observed.

## Production equivalence preflight

Read-only checks confirmed:

### FEAT-007

- `school_years.archive_state` exists
- `homework_archives` exists
- `homework_archive_media` exists
- `homework_archive_steps` exists
- `homework_archive_events` exists
- RLS enabled on all four archive tables
- required archive private helpers exist
- `homework_archive(text,jsonb)` exists
- `homework_archive_export(uuid,text,text,integer)` exists
- archive-aware `homework_api(text,jsonb)` exists
- archive-aware `homework_media(text,jsonb)` exists

### FEAT-010

RLS enabled on:

- `device_use_lock_intervals`
- `device_use_session_overrides`
- `device_use_policy_signals`

Expected authenticated SELECT policies exist:

- `device_use_lock_intervals_select_v010`
- `device_use_session_overrides_select_v010`
- `device_use_policy_signals_select_v010`

`device_use_policy(...)` exists and is SECURITY DEFINER.

### RC9

- `device_use_year_freeze_guard_rc9()` exists and is SECURITY DEFINER
- exactly two `trg_00_device_use_year_freeze` triggers use it
- target tables:
  - `device_use_lock_intervals`
  - `device_use_session_overrides`

Production RC9 function fingerprint:
`9265449d7f6ec4fc1b4cd9062ddcdbc3`

## Safety

Not executed:

- migration A/B/C SQL on production
- `supabase db push`
- `supabase db reset`
- `supabase migration up`
- direct SQL writes to migration history
- production deployment

## Remaining operation

History-only repair must be executed from an authenticated Supabase CLI environment:

```text
supabase migration repair 20260924130155 --status applied
supabase migration repair 20260924130159 --status applied
supabase migration repair 20260924130202 --status applied
```

After repair, final target is 13/13 Local = Remote, followed by read-only post-repair verification.
