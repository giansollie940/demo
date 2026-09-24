# FEAT-008 — Admin Storage Health — IMPLEMENTATION PLAN

Baseline: `SO-TU-HOC-FEAT-006-RC2`, verified green locally before any change
(9/9 checks PASS: media-database, media-ui, database, legacy-database,
feat004-database, static, ui, typecheck, build).

Spec: `MEDIA_STORAGE_SUITE_FINAL_SPEC_V2.md` §3, DEC-076 → DEC-079.

---

## 1. Decisions taken inside the spec's freedom

The spec leaves measurement and enforcement mechanics to implementation. These
are the choices, with the reason each one is safe.

### D1 — Capacity is configuration, never a constant

`homework_storage_capacity(provider, configured_bytes, …)` with rows for
`database` and `r2`. Seeded **NULL**.

A NULL capacity means *unknown*, and unknown must never be treated as 0% or as
100%. With NULL capacity the provider reports `level='unconfigured'`, no
percentage, and **no protection mode**. Deriving a threshold from a guess would
either hide a real emergency or lock a healthy deployment out of its own app.
The dashboard states loudly that the deployment has not configured it yet.

### D2 — Protection state is derived, never stored

`STORAGE_PROTECTION_MODE` is computed from the latest usage snapshot against
configured capacity, every time it is asked. There is no boolean to get stuck
on, no toggle to forget, and the spec's rule "không cho tắt protection mode thủ
công khi usage vẫn >=95%" is then true by construction rather than by guarding
an update path.

### D3 — Two independent R2 numbers, neither one blocking

| Source | What it is | Always available? |
|---|---|---|
| metadata aggregate | `sum(size_bytes)` over `homework_attachments` by status | yes, computed in-database |
| provider report | totals pushed by the Edge Function from the R2/Cloudflare API | only when configured |

Percent uses the provider report when present, else the metadata aggregate.

The metadata aggregate is what the app believes it stored; it can undercount
objects R2 holds but the app does not know about. That is a real limitation and
is stated in the report — but it means storage health degrades gracefully
instead of going blind when the Cloudflare API is unreachable, which matters
precisely when storage is in trouble.

### D4 — Enforcement wraps, never rewrites, FEAT-006

Both approved entry points are renamed and re-exported behind a thin guard,
exactly the pattern FEAT-004/005/006 already use:

```
public.homework_api    → homework_private.api_v6    (body untouched)
public.homework_media  → homework_private.media_v6  (body untouched)
```

The new `public.homework_api` / `public.homework_media` check protection, then
delegate. Sol can diff the old bodies and see they are byte-identical, and the
FEAT-006 read-authorization logic that RC1 got wrong is not re-opened.

### D5 — Blocking uses a resource error, not a permission error

`errcode '53100'` (`disk_full`). F8-RB-004 requires that a blocked action does
not masquerade as a permission error; `42501` is what this codebase raises for
permission. A distinct SQLSTATE lets the frontend map the message with no string
matching.

### D6 — Unliking stays allowed under protection

AC8-07 blocks *new* reactions. Removing a reaction deletes a row — it releases
space. Blocking it would trap users in a state they cannot undo and would make
the system fuller, not emptier.

### D7 — Cleanup reuses the FEAT-006 lifecycle, adds no purge path

`cleanup_pending` enqueues through `homework_private.media_enqueue`, the same
outbox FEAT-006 uses. FEAT-008 therefore cannot purge anything DEC-081 does not
already allow, and CR-005 ("storage pressure không tự động purge năm học") holds
because no year-scoped deletion exists in this feature at all.

---

## 2. Database — `database/upgrade/11-FEAT-008-STORAGE-HEALTH.sql`

Tables

- `homework_storage_capacity(provider pk, configured_bytes, note, updated_at, updated_by)`
- `homework_storage_usage(provider pk, total_bytes, active_bytes, pending_bytes,
  media_count, source, measured_at)` — one current row per provider
- `homework_storage_events(id, actor_id, event_type, before_data, after_data, created_at)`
  — system-wide audit; `homework_contribution_events.class_id` is NOT NULL and
  storage events have no class

Helpers

- `homework_private.storage_admin()` → `public.profiles`, raises `42501` unless
  the caller is an active, non-deleted admin
- `homework_private.storage_measure()` → writes both snapshots
  (`pg_database_size(current_database())`; attachment aggregate)
- `homework_private.storage_state()` → `jsonb` with per-provider percent/level
  and the two derived flags `protection_mode`, `r2_upload_locked`
- `homework_private.storage_guard(p_action)` → raises `53100` when blocked

RPCs

- `public.homework_storage(p_action, p_data)` — authenticated, admin-gated inside
  - `status` · `refresh` · `set_capacity` · `cleanup_pending`
- `public.homework_storage_service(p_action, p_data)` — service_role
  - `record_usage` (provider push) · `state` (for the scheduled worker)

Guarded actions

| Entry point | Blocked when |
|---|---|
| `homework_api` `react` with `liked=true` | DB protection |
| `homework_api` `submit`/`correction_*` carrying `attachment_id` | DB protection or R2 lock |
| `homework_media` `prepare` | DB protection or R2 lock |

Never blocked: text notices, corrections, reports, hard-delete, audit writes,
`homework_storage*`, the FEAT-006 cleanup outbox.

## 3. Edge Function — `supabase/functions/storage-health/index.ts`

Admin-authenticated. Reads R2 usage with the existing `_shared/media-r2.ts`
credentials (server-side only, never returned to the browser), pushes totals via
`homework_storage_service('record_usage')`, returns the refreshed state. If R2
is unreachable it returns the database-side state with `r2.source='metadata'` —
a storage dashboard must not fail closed.

## 4. Frontend

- `src/features/storage/api.ts` — typed client; maps `53100` to the protection
  message
- `src/components/admin/AdminStorageHealth.vue` — DB card, R2 card, threshold
  banner, archive candidates by school year, protection status, refresh,
  cleanup pending
- `AdminPage.vue` — `validTabs` + `'storage'`; navigation entry `Dung lượng`
- Composer/reaction paths surface the protection message rather than a generic
  failure

## 5. Test matrix

Real Postgres (PGlite), `tests/feat-008/database.test.mjs`:

| AC | Test |
|---|---|
| AC8-01 | admin `status` returns both providers with percent |
| AC8-02 | student/monitor/teacher denied on every action |
| AC8-03 | 69/70/85/94 → normal/info/warning/warning; boundaries exact |
| AC8-04 | R2 95% blocks `prepare`, text `submit` still succeeds |
| AC8-05 | DB 95% sets `protection_mode` |
| AC8-06 | under protection: text submit, correction, report, hard-delete pass |
| AC8-07 | under protection: new reaction and image upload rejected `53100`; unlike passes |
| AC8-08 | audit rows still written under protection |
| AC8-09 | `cleanup_pending` works under protection and enqueues via the FEAT-006 outbox |
| AC8-10 | rejection carries `53100`, not `42501` |
| AC8-11 | no credential/secret appears in any RPC payload |
| AC8-12 | full FEAT-001→006 suites rerun |

Also: unknown capacity ⇒ no protection; repeat-apply of migration 11;
`api_v6`/`media_v6` bodies byte-identical to the FEAT-006 originals.

Frontend (`tests/feat-008/vitest.config.ts`): dashboard renders thresholds,
blocked action shows the protection message, non-admin cannot reach the tab.

## 6. Out of scope

Anything FEAT-007: archive generation, purge, viewer. FEAT-008 only measures,
warns and protects.
