# ASTRA HANDOFF — DB-HISTORY-12-13-14

## Contract

Task: `DB-HISTORY-12-13-14`

Status: `FINAL`

Use the FINAL SPEC supplied for this task. Do not change business rules.

## Implementation branch

`db/history-12-13-14`

Branch base / current main:

`3fb6cc43cc141110b0fec5230cdb1c2ac673b89d`

Do not implement directly on `main`.

## Current remote migration history

Exactly 10 versions are currently recorded:

1. `20260815085954_v8301_rls_login_fix`
2. `20260831075330_grant_authenticated_avatar_path_select`
3. `20260831162435_allow_animated_gif_avatars`
4. `20260831162906_revoke_anon_avatar_rpc_execute`
5. `20260831170455_avatar_visibility_by_class_relationship`
6. `20260921060255_verify002_add_device_use_policy_signals_realtime`
7. `20260921060825_verify002_device_slot_key_search_path`
8. `20260923114552_storage_change_signals`
9. `20260924040615_sec_sql_hardening_001_trigger_acl`
10. `20260924040619_sec_sql_hardening_002_anon_helpers`

Do not modify, rename or revert these 10 history entries.

## Production preflight already verified read-only

### FEAT-007

RLS is enabled on:

- `homework_archives`
- `homework_archive_media`
- `homework_archive_steps`
- `homework_archive_events`

Production functions currently present:

- `homework_private.archive_admin()`
- `homework_private.archive_blockers(uuid)`
- `homework_private.archive_counts(uuid)`
- `homework_private.archive_fingerprint(uuid)`
- `homework_private.archive_frozen(uuid)`
- `homework_private.archive_guard()`
- `homework_private.archive_guard_class()`
- `homework_private.archive_guard_years(jsonb)`
- `homework_private.archive_readonly(uuid)`
- `homework_private.archive_release(uuid)`
- `public.homework_archive(text,jsonb)`
- `public.homework_archive_export(uuid,text,text,integer)`
- `public.homework_api(text,jsonb)`
- `public.homework_media(text,jsonb)`

Current `pg_get_functiondef` MD5 fingerprints:

- archive_admin: `e1054a15b9ac7d48cedcb5ca983de924`
- archive_blockers: `77cc2b946f47c3204cc850f26def8a42`
- archive_counts: `a1b3a7b2682fde1131b74ee0cace29da`
- archive_fingerprint: `6d7ab39498c54641d6c8ccad7257471e`
- archive_frozen: `4f3605644911fa76a96e8b88bde8aab6`
- archive_guard: `db186eca57f5f40e228a14fa4775fcfe`
- archive_guard_class: `48eece60d054708e2d87c0bef1cabe82`
- archive_guard_years: `21d1e3f027948bf14d770eb03a303426`
- archive_readonly: `447eaf1500e109de07b2f4603e9222fe`
- archive_release: `3328cad48029b81b503d83d99b652619`
- public.homework_archive: `a8d706aecb43dc621d6510daf508df29`
- public.homework_archive_export: `825e7f97cb4de8d8c02d640a54b587c7`
- public.homework_api: `dbe5279fff42dd68c4815479e27bd880`
- public.homework_media: `ef342bc53e48fb5c918e89bc17e72848`

### FEAT-010

RLS is enabled on:

- `device_use_lock_intervals`
- `device_use_session_overrides`
- `device_use_policy_signals`

Current SELECT policies:

- `device_use_lock_intervals_select_v010` → authenticated
- `device_use_session_overrides_select_v010` → authenticated
- `device_use_policy_signals_select_v010` → authenticated

`public.device_use_policy(...)` is present and SECURITY DEFINER.

### RC9

`public.device_use_year_freeze_guard_rc9()` exists and is SECURITY DEFINER.

Production function fingerprint:

`9265449d7f6ec4fc1b4cd9062ddcdbc3`

Exactly two `trg_00_device_use_year_freeze` triggers use this function:

- `device_use_lock_intervals`
- `device_use_session_overrides`

## Canonical repository sources to inspect

- `database/upgrade/12-APPLY-ON-PRODUCTION.sql`
- `database/upgrade/12-FEAT-007-ARCHIVE-PURGE.sql`
- `database/upgrade/13-FEAT-010-DEVICE-USE-LOCK.sql`
- `database/upgrade/14-FEAT-010-RC9-CASCADE-FREEZE-FIX.sql`

Important: upgrade 12 historically went through RC1 → cleanup → approved RC6. Do not blindly copy the destructive reset section into a canonical migration.

## Required implementation

1. Inspect the actual repository and current production state before writing.
2. Generate exactly three migration filenames using current Supabase CLI:
   - `supabase migration new feat_007_archive_purge_history`
   - `supabase migration new feat_010_device_use_lock_history`
   - `supabase migration new feat_010_rc9_cascade_freeze_fix_history`
3. Populate canonical mutation SQL only.
4. Verify semantic equivalence against production.
5. If upgrade 12 cannot be represented safely from the current migration chain, return `BLOCKED`.
6. Before repair, migration list must show the current 10 aligned plus exactly three local-only versions.
7. Only after equivalence passes, run history-only:
   - `supabase migration repair <A> --status applied`
   - `supabase migration repair <B> --status applied`
   - `supabase migration repair <C> --status applied`
8. Final target: 13/13 Local = Remote.
9. Re-run production fingerprints/ACL/RLS/trigger verification and prove no object changed.
10. Produce Implementation Report + test evidence.

## Prohibited

Do not run:

- `supabase db push`
- `supabase db reset`
- `supabase migration up`
- production execution of SQL from upgrade 12/13/14
- direct SQL writes to `supabase_migrations.schema_migrations`
- destructive cleanup as a fallback

No production app deployment is part of this task.
