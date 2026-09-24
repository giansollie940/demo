# FEAT-008 RC1 → RC2 — fix report

**Sol RC1 result:** `REQUEST_CHANGES` — one P1.
**RC2 scope:** that P1 and nothing else. No other business rule, permission or
FEAT-006 path was touched.

---

## The finding was correct, and I reproduced it before changing anything

RC1 `homework_private.storage_state()` computed

```sql
coalesce(u.provider_bytes,u.metadata_bytes) total_bytes
```

and labelled the source `provider` whenever `provider_bytes is not null`. Once
R2 had answered once, that answer drove the percentage for ever;
`storage_measure()` updates `metadata_bytes` and deliberately leaves
`provider_bytes` alone.

Reproduced on the local Postgres harness before touching the code:

| Scenario | RC1 result |
|---|---|
| provider 80% aged 30 days, metadata now 97% | `percent 80`, `source provider`, **upload NOT locked** |
| provider 97% aged 30 days, metadata now 50% | `percent 97`, `source provider`, **upload still locked** |

Both are wrong, and the first is the dangerous one: the system is over 95% by
its own accounting and does nothing about it.

It also contradicted DEC-084 as I wrote it — that decision says storage health
degrades to the metadata measurement when R2 is unreachable, and the code did
not do that. The documentation was right and the implementation did not match
it, which is the worst of the two ways round.

## What I got wrong in the RC1 tests

AC8-11 asserted that a later in-database refresh does not wipe `provider_bytes`.
That assertion is still correct and still passes — preserving the column is
right. What was missing is that **no RC1 test ever aged a provider reading**, so
nothing exercised the branch where freshness should matter. The suite was
complete against the AC list and blind to the dimension the AC list did not
mention.

---

## The rule in RC2

Three parts, each independently load-bearing:

**1. A provider reading counts only while it is recent — six hours.**

Outside that window it stops contributing; it is neither trusted nor deleted, so
Admin can still see the last R2 answer and its timestamp. Six hours is well
inside any sane refresh cadence and bounds how long a stale high reading could
hold a lock if nothing else changed.

**2. The application's own accounting is a floor, always.**

`total_bytes = greatest(fresh_provider, metadata_bytes)`. `metadata_bytes`
includes pending uploads R2 has not seen yet, so a provider figure that predates
them must not pull the total back down. `greatest()` ignores NULL, so a stale or
absent provider reading simply leaves metadata alone.

This is why the fix handles Sol's case 1 even inside the freshness window: if the
app can already justify 97%, no provider number suppresses it.

**3. Cleanup discards the reading it just invalidated.**

`cleanup_pending` queues objects for purge, so the bucket is about to shrink by
an amount no provider reading knows about. Rather than letting a now-wrong R2
figure hold a lock the app can no longer justify, the reading is cleared and the
source falls back to metadata. Invalidating a cache when you know it is wrong
beats waiting out a timer.

**Labelling.** `source` names the value that actually produced `percent`, so it
can read `metadata` even when a provider figure exists. A new `provider_stale`
flag distinguishes "aged out" from "never measured", and the dashboard says
*"Số của Cloudflare R2 đã quá cũ nên không còn được tính"* instead of quietly
continuing to show a number that is not driving anything.

### A case worth stating explicitly

Fresh provider 40%, metadata 96% → effective 96%, `source: 'metadata'`, locked.
The floor wins and the label is honest about it. This is the conservative
direction: those pending bytes are about to exist, and a storage guard that errs
should err towards protecting.

---

## Regression tests added

All five in `tests/feat-008/database.test.mjs`, plus one UI test.

| Test | Covers |
|---|---|
| stale provider 80% + fresh metadata 97% → critical, locked, `source: metadata` | Sol requirement 1 |
| stale provider 97% + fresh metadata 50% → 50%, unlocked, `source: metadata` | Sol requirement 2 |
| fresh provider 96% + metadata 40% → 96%, `source: provider`; fresh provider 40% + metadata 96% → 96%, `source: metadata` | Sol requirement 3 |
| four combinations asserting `total_bytes` equals the value `source` names | Sol requirement 4 (SQL) |
| dashboard renders the stale-provider notice and does not claim "nhà cung cấp báo về" | Sol requirement 4 (UI) |
| cleanup clears the provider reading and releases the lock | the new invalidation |

### Mutation-verified

Each part of the fix was removed in turn, the suite re-run, and the source
restored:

| Mutation | Failing tests |
|---|---|
| restore the exact RC1 rule (`coalesce(provider_bytes, …)` + unconditional `provider` label) | 4 |
| keep the floor but drop the six-hour window | 3 |
| keep the window but drop the metadata floor | 2 |
| stop invalidating the provider reading on cleanup | 1 |
| remove the stale-provider notice from the dashboard | 1 (UI) |

No part of the fix is decorative.

---

## Verification

`node scripts/verify-feat008.mjs` — **13/13 PASS, 204 tests, 0 FAIL** (RC1: 198).

| Suite | RC1 | RC2 |
|---|---:|---:|
| FEAT-008 storage SQL | 9 | **14** |
| FEAT-008 dashboard UI | 6 | **7** |
| FEAT-006 SQL | 13 | 13 |
| FEAT-006 SQL on migration 11 | 13 | 13 |
| FEAT-005 SQL on migration 11 | 13 | 13 |
| FEAT-006 frontend | 10 | 10 |
| FEAT-005 under migration 10 | 13 | 13 |
| FEAT-001/002 legacy SQL | 43 | 43 |
| FEAT-004 SQL | 6 | 6 |
| Static frontend regression | 8 | 8 |
| Existing FEAT-001–005 frontend | 64 | 64 |
| **Total** | **198** | **204** |

Typecheck PASS, production build PASS. Evidence regenerated in
`docs/feat-008/evidence/`.

## Changed files, RC1 → RC2

| File | Change |
|---|---|
| `database/upgrade/11-FEAT-008-STORAGE-HEALTH.sql` | effective value/source selection in `storage_state()`; `cleanup_pending` clears the provider reading |
| `src/features/storage/api.ts` | `provider_stale` on the provider type; comments on what `source` now means |
| `src/components/admin/AdminStorageHealth.vue` | stale-provider notice |
| `tests/feat-008/fixture.mjs` | `planR2()` helper to plant a reading of a chosen age |
| `tests/feat-008/database.test.mjs` | five P1 regression tests |
| `tests/feat-008/dashboard.test.ts` | stale-provider UI test; `provider_stale` in the shared fixture |
| docs, `RELEASE.json`, `SHA256SUMS.txt` | updated |

No source file was deleted. The FEAT-006 byte-identity test still passes, so the
wrapped dispatchers remain untouched.

## Still release-verification gates, not code-review evidence

Unchanged from RC1: live Cloudflare R2 (including `usage()` pagination), Deno
runtime, live Supabase `pg_database_size` versus the billed quota, cron wiring,
and behaviour while crossing 95% under concurrent traffic.

One addition specific to this fix: the six-hour window and the cleanup
invalidation have only been exercised against planted timestamps in the harness.
On a live deployment, confirm that the scheduled refresh actually runs well
inside six hours — otherwise R2 readings will routinely age out and the
dashboard will sit on the metadata figure, which is correct but less accurate
than it should be.
