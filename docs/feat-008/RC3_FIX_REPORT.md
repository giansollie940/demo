# FEAT-008 RC2 → RC3 — fix report

**Sol RC2 result:** `REQUEST_CHANGES` — one P1, newly introduced by RC2.
**RC3 scope:** that P1 and nothing else. No other business rule, permission or
FEAT-006 path was touched. RC1's P1 stays fixed and its tests stay green.

---

## The finding was correct, I reproduced it, and it was worse than reported

RC2 added this to `homework_storage('cleanup_pending')`:

```sql
if queued>0 then
 update public.homework_storage_usage set provider_bytes=null,provider_measured_at=null where provider='r2';
end if;
```

I wrote that rule myself — it was not in the spec and not requested by RC1. The
reasoning behind it ("the bucket is about to shrink, so the R2 answer is already
wrong") confuses a scheduled deletion with a completed one. `media_enqueue` sets
the attachment to `deleting` and writes an outbox job with `safe_after` at least
three minutes ahead; the object is removed only when the worker runs and
succeeds.

Reproduced on the local Postgres harness before changing anything: one pending
attachment past its window, capacity 1 000 000, a fresh R2 answer of 960 000.

```
before cleanup: percent 96  source provider  locked true
after  cleanup: queued 1 | attachment status deleting | outbox not yet safe to delete: true
                percent 0  source metadata  provider_bytes null  LOCKED = false
```

Sol predicted the percentage would fall to ~39%. It fell to **0%**, because a
second RC2 decision compounded the first: `storage_measure()` excluded
`deleting` rows from `metadata_bytes`, so the queued attachment left the app's
own accounting at the same moment the provider evidence was destroyed. Nothing
was left holding the lock. A single expired 300 KB thumbnail could open uploads
on a bucket that was 96% full.

The untracked-objects case Sol raised is the sharpest version of it. Of the
960 000 bytes R2 reported, the app had rows for 300 000. The other 660 000 are
objects the application cannot see, and the provider reading was the only
evidence they existed. Clearing it because one *tracked* object was queued threw
that evidence away.

---

## The rule in RC3

**Queuing a cleanup may schedule space to be freed, but only a new measurement
may report it as freed.** (DEC-089; point 3 of DEC-088 as written in RC2 is
withdrawn.)

Two changes, both in `database/upgrade/11-FEAT-008-STORAGE-HEALTH.sql`:

**1. `cleanup_pending` leaves the provider reading alone.** The invalidation
block is gone. The R2 figure expires on its own after six hours (DEC-088 rule 1)
or is replaced when Admin presses **Hỏi kho ảnh** after the worker has run.

**2. `storage_measure()` counts bytes that are queued for purge.** The r2
aggregate now sums every attachment row rather than `active`/`pending` only, and
reports the queued portion separately in a new `deleting_bytes` column.
`media_count` still counts only `active` and `pending`, because that figure
answers "how many images does the app have", not "how full is the bucket".

Both were needed. Fixing only the first would still have let the metadata floor
collapse on the next measure; fixing only the second would still have destroyed
the evidence about untracked objects.

After the fix, the same reproduction:

```
after cleanup: queued 1 | attachment status deleting | outbox not yet safe to delete: true
               percent 96  source provider  provider_bytes 960000  LOCKED = true
```

### Why not refresh R2 automatically after cleanup

That was option 2 in Sol's review. It would put a network call to Cloudflare
inside an Admin RPC, and — worse — it would measure the bucket three minutes
*before* `safe_after`, so the answer would still include the object and would
simply overwrite a correct reading with an equally locked one. The honest
sequence is: queue, let the worker run, then measure. The UI now says exactly
that instead of leaving Admin to guess why the number did not move.

---

## Frontend

| File | Change |
|---|---|
| `src/features/storage/api.ts` | `deleting_bytes` on `StorageProvider` |
| `src/components/admin/AdminStorageHealth.vue` | R2 card shows **Đang chờ xoá**; when it is non-zero the source line explains that queued bytes still count; the cleanup confirmation and its result message say the figure will not move until the background worker has run and R2 has been asked again |

The result message matters more than it looks. Without it, an Admin who presses
cleanup during an incident sees the percentage stay at 96% and reasonably
concludes the button is broken — and the natural next move is to start deleting
things that are not safe to delete.

---

## Regression tests

Sol asked for four. There are five; the fifth covers the compounding half of the
bug that the four would not have caught on their own.

| Test | Sol requirement |
|---|---|
| `a queued cleanup does not unlock uploads before the provider says the bytes are gone` — fresh provider 96%, metadata 40%, cleanup queued → `provider_bytes` intact, percent 96, `source: provider`, locked | 1 |
| `the object is still in the bucket while the job waits, and the evidence is kept that whole time` — attachment `deleting`, outbox `safe_after` in the future, provider reading retained, `deleting_bytes` 300 000 | 2 |
| `only a fresh provider measurement can lift the lock` — R2 re-measured at 40% after cleanup → unlocked, `source: provider` | 3 |
| `queuing one tracked attachment cannot clear protection earned by untracked bytes` — 660 000 of the 960 000 bytes have no app row; total stays 960 000 and the level stays `critical` | 4 |
| `with no provider reading at all, bytes queued for purge still count as used` — metadata-only deployment at 96%, cleanup queued → `deleting_bytes` 300 000, `pending_bytes` 0, `metadata_bytes` unchanged, still locked | the compounding defect |

Plus two UI tests: the "đang chờ xoá" figure is shown and explained, and the
post-cleanup message tells Admin the number will not move yet.

**The offending RC2 test is gone.** `RC1 P1 — cleanup drops the provider reading
it just invalidated` asserted the unsafe behaviour; it has been deleted, not
adjusted, and the five tests above take its place.

### Mutation-verified

Each part of the fix was reverted in turn, the suite re-run, and the source
restored:

| Mutation | Failing tests |
|---|---|
| restore the RC2 invalidation block in `cleanup_pending` | 3 |
| exclude `deleting` rows from `metadata_bytes` again | 2 |
| report `deleting_bytes` as 0 | 2 |
| remove the "queued is not deleted" line from the R2 source label | 1 (UI) |
| shorten the post-cleanup message back to "Đã xếp N ảnh chờ vào hàng xoá." | 1 (UI) |

The four RC1 mutations (RC1 preference rule, six-hour window, metadata floor,
stale-provider notice) were re-run and still fail 4/3/2/1 as before. The RC2
mutation "stop invalidating the provider reading on cleanup" is retired: that
behaviour was the defect.

---

## Verification

`node scripts/verify-feat008.mjs` — **13/13 PASS, 210 tests, 0 FAIL** (RC2: 204).

| Suite | RC2 | RC3 |
|---|---:|---:|
| FEAT-008 storage SQL | 14 | **18** |
| FEAT-008 dashboard UI | 7 | **9** |
| FEAT-006 SQL | 13 | 13 |
| FEAT-006 SQL on migration 11 | 13 | 13 |
| FEAT-005 SQL on migration 11 | 13 | 13 |
| FEAT-006 frontend | 10 | 10 |
| FEAT-005 under migration 10 | 13 | 13 |
| FEAT-001/002 legacy SQL | 43 | 43 |
| FEAT-004 SQL | 6 | 6 |
| Static frontend regression | 8 | 8 |
| Existing FEAT-001–005 frontend | 64 | 64 |
| **Total** | **204** | **210** |

Typecheck PASS, production build PASS. Evidence regenerated in
`docs/feat-008/evidence/`; `verification-results.json` has 13 entries, all
`exitCode: 0`.

## Changed files, RC2 → RC3

| File | Change |
|---|---|
| `database/upgrade/11-FEAT-008-STORAGE-HEALTH.sql` | invalidation removed from `cleanup_pending`; `storage_measure()` counts `deleting` bytes; `deleting_bytes` column on `homework_storage_usage`; exposed by `storage_state()` |
| `src/features/storage/api.ts` | `deleting_bytes` on `StorageProvider` |
| `src/components/admin/AdminStorageHealth.vue` | "Đang chờ xoá" row, the explanation beside it, the cleanup dialog and result wording |
| `tests/feat-008/database.test.mjs` | unsafe test deleted; five RC2 P1 regression tests added |
| `tests/feat-008/dashboard.test.ts` | two UI tests; `deleting_bytes` in the shared fixture; `appDialog` mocked so the cleanup button can be driven |
| docs, `RELEASE.json`, `SHA256SUMS.txt` | updated |

The FEAT-006 byte-identity test still passes, so the wrapped dispatchers remain
untouched.

## Still release-verification gates, not code-review evidence

Unchanged: live Cloudflare R2 (including `usage()` pagination), Deno runtime,
live Supabase `pg_database_size` versus the billed quota, cron wiring, and
behaviour while crossing 95% under concurrent traffic.

One specific to this fix: the outbox worker has never been run against a real
bucket in this work. The tests prove the lock is held while a job is pending and
released by a fresh measurement; they do not prove the worker deletes the object
or that the subsequent R2 reading drops. Confirm that end to end on staging
before relying on the cleanup button during an actual incident.
