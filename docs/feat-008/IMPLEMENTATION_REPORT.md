# FEAT-008 — Admin Storage Health — IMPLEMENTATION REPORT

**Package:** `SO-TU-HOC-FEAT-008-RC3.1`
**Status:** `READY_FOR_RE_REVIEW` — not deployed, no migration run anywhere.
**RC1 → RC2:** one Sol P1 fixed (a stale R2 provider reading could drive the
percentage for ever). See `RC2_FIX_REPORT.md`.
**RC2 → RC3:** one Sol P1 fixed, introduced by RC2 itself — queuing a cleanup
cleared the authoritative R2 reading before the objects were deleted, which
could unlock uploads on a bucket still over 95%. See `RC3_FIX_REPORT.md`; that
finding was correct, is reproduced there before the change, and turned out to be
worse than reported.
**RC3 → RC3.1:** Sol APPROVED RC3 with one non-blocking documentation note.
Docs and tests only — **no runtime source file changed**, and `SHA256SUMS.txt`
proves it. See `RC3.1_NOTE.md`.
**Baseline:** `SO-TU-HOC-FEAT-006-RC2` (Sol: APPROVED), verified green locally
before the first change: 9/9 checks PASS.

---

## 1. What was built

| Layer | File |
|---|---|
| Migration | `database/upgrade/11-FEAT-008-STORAGE-HEALTH.sql` |
| Edge Function | `supabase/functions/storage-health/index.ts` |
| R2 usage read | `supabase/functions/_shared/media-r2.ts` (`usage()` added) |
| Client | `src/features/storage/api.ts` |
| Admin UI | `src/components/admin/AdminStorageHealth.vue`, tab `?tab=storage` |
| Tests | `tests/feat-008/` (database + dashboard), `FEAT008_UPGRADE` re-runs |
| Harness | `scripts/verify-feat008.mjs` |

No FEAT-001→006 source file was rewritten. The two FEAT-006 dispatchers are
renamed and re-exported behind a guard; a test asserts their bodies are still
byte-identical to migration 10 (§4).

---

## 2. The four decisions that shape this feature

### Capacity is configuration; unknown stays unknown

`homework_storage_capacity` ships with both providers **NULL**. A NULL capacity
produces no percentage, level `unconfigured`, and **no protection mode**.

Guessing a quota would fail in both directions: too high hides a real emergency,
too low locks a healthy deployment out of its own app. The dashboard says
plainly that the deployment has not set it, and why that is deliberate.

### Protection state is derived, never stored

There is no `protection_mode` column. `homework_private.storage_state()`
computes it from the latest snapshot against configured capacity on every read.
The spec's "Admin cannot switch protection off while usage is still ≥95%" is
therefore true by construction — there is nothing to switch.

### Two R2 numbers, and the dashboard says which one you are reading

`metadata_bytes` is the app's own accounting (`sum(size_bytes)` over
attachments); `provider_bytes` is what R2 itself reports through the Edge
Function. They are separate columns, so refreshing one never clobbers the other.

**Which one drives the number:** the provider reading counts only while it is
under six hours old, and `metadata_bytes` is always a floor under it, so
`effective = greatest(fresh_provider, metadata_bytes)`. `source` names the value
that actually produced the percentage. See DEC-088.

**Queued is not deleted (RC3).** `cleanup_pending` writes outbox jobs; the
objects leave R2 only when the worker runs. So it does not touch the provider
reading, and bytes in `deleting` still count towards `metadata_bytes`, reported
separately as `deleting_bytes`. Only a new measurement may report space as
freed. See DEC-089.

**Known limitation, stated rather than hidden:** the metadata aggregate cannot
see objects R2 holds that the application has no row for. The UI labels that
figure "ứng dụng tự cộng — có thể thiếu các tệp trong kho mà ứng dụng không còn
ghi nhận". The trade is deliberate: storage health degrades to a slightly
optimistic number instead of going blank when Cloudflare is unreachable, which
is precisely when it is needed.

### A capacity hold is a resource error, not a permission error

Every withheld action raises SQLSTATE **`53100` (disk_full)**. This codebase
raises `42501` for permission, so F8-RB-004 is satisfied by the error class
itself and the client branches on `code`, never on message text. The SQLSTATE is
now preserved through `homeworkRpc` and through the `homework-media` Edge
Function (both previously dropped it).

---

## 3. What is withheld, and what is not

| Withheld | Trigger |
|---|---|
| new heart (`liked=true`) | DB ≥95% |
| `prepare` a new image | DB ≥95% or R2 ≥95% |
| `submit`/`correction_*` carrying a non-null `attachment_id` | DB ≥95% or R2 ≥95% |

| Never withheld | Why |
|---|---|
| text notices, corrections, reports | educational critical writes (F8-RB-001) |
| **removing** a heart | deletes a row; blocking it makes the database fuller and traps the user |
| clearing an image (`attachment_id: null`) | same reason |
| `ticket`, `seal`, `read`, `cancel` | an upload already in flight can finish or be cleaned up instead of being stranded as a pending row nobody can resolve |
| audit and security logging | F8-RB-002 forbids disabling it |
| `homework_storage*`, FEAT-006 cleanup outbox | these are how Admin frees space |

`cleanup_pending` enqueues through `homework_private.media_enqueue` — the
FEAT-006 outbox. FEAT-008 adds **no deletion path of its own**, so it cannot
purge anything DEC-081 does not already allow, and CR-005 holds because no
year-scoped deletion exists in this feature at all.

---

## 4. Verification

`node scripts/verify-feat008.mjs` — **13/13 PASS, 212 tests, 0 FAIL.**

| Suite | Result |
|---|---:|
| FEAT-008 storage SQL | 20 PASS |
| FEAT-008 dashboard UI | 9 PASS |
| FEAT-006 SQL | 13 PASS |
| **FEAT-006 SQL re-run on migration 11** | **13 PASS** |
| **FEAT-005 SQL re-run on migration 11** | **13 PASS** |
| FEAT-006 frontend | 10 PASS |
| FEAT-005 under migration 10 | 13 PASS |
| FEAT-001/002 legacy SQL | 43 PASS |
| FEAT-004 SQL | 6 PASS |
| Static frontend regression | 8 PASS |
| Existing FEAT-001–005 frontend | 64 PASS |
| **Total** | **212 PASS / 0 FAIL** |
| Typecheck | PASS |
| Production build | PASS |

Evidence: `docs/feat-008/evidence/*.log` and `verification-results.json`.

### AC coverage

| AC | Where |
|---|---|
| AC8-01 | `storage-database` test 1 |
| AC8-02 | test 1 — all four non-admin roles × all four actions, plus the service surface |
| AC8-03 | test 2 — 50/69/70/84/85/94/95/99 boundaries, plus unconfigured |
| AC8-04 | test 3 |
| AC8-05, AC8-06, AC8-07, AC8-10 | test 4 |
| AC8-08 | test 5 |
| AC8-09 | test 6 |
| AC8-11 | test 7 |
| DEC-088 effective value | four `RC1 P1 —` tests + one dashboard test |
| DEC-089 queued ≠ deleted | five `RC2 P1 —` tests + two dashboard tests |
| DEC-090 `stale` labels, never suspends | two `RC3 —` tests |
| AC8-12 | `media-database-on-11`, `database-on-11`, plus the seven inherited suites |

### AC8-12 in its strongest form

`FEAT008_UPGRADE=1` re-runs the existing FEAT-005 and FEAT-006 corpora **with
migration 11 installed**. Both pass unchanged. That is the real claim worth
making: *installing FEAT-008 changes no behaviour until an Admin configures a
capacity.*

### The guards were mutation-tested, not just exercised

A passing test proves nothing until you have watched it fail. Each of these was
introduced into the source, the suite re-run, and the source restored:

| Mutation | Result |
|---|---|
| remove the heart guard | 1 fail |
| remove the `prepare` guard | 2 fail |
| treat unconfigured capacity as critical | 5 fail |
| widen the cleanup sweep to `active` media | 1 fail |
| drop the expiry window from the cleanup sweep | 1 fail |
| raise `42501` instead of `53100` | 2 fail |
| restore the RC1 provider-preference rule | 4 fail |
| drop the six-hour freshness window | 3 fail |
| drop the metadata floor | 2 fail |
| restore the RC2 cleanup invalidation | 3 fail |
| exclude `deleting` rows from `metadata_bytes` again | 2 fail |
| report `deleting_bytes` as 0 | 2 fail |
| remove the stale-provider notice from the dashboard | 1 fail |
| remove the "queued is not deleted" line from the R2 source label | 1 fail |
| shorten the post-cleanup message back to the bare count | 1 fail |
| exempt a >24h stale snapshot from protection | 1 fail |
| render an unconfigured provider as 0% | 1 fail |
| replace the protection banner with a permission message | 1 fail |
| drop the "may undercount" caveat from the metadata source label | 1 fail |

Two of these caught tests that were passing for the wrong reason. The first
version of AC8-09 did not actually protect active media: the live attachment had
a future `expires_at` and a live `grant_until` from sealing, so widening the
sweep to `status='active'` still passed. The test now ages **both** rows and
clears `grant_until`, leaving the status filter as the only thing standing
between a published image and the purge queue.

### A byte-identity check on the wrapped functions

`tests/feat-008/database.test.mjs` builds one database at migration 10 and one
at migration 11 and asserts `pg_get_functiondef` bodies for `api_v6`/`media_v6`
match `homework_api`/`homework_media` exactly. If anyone edits the FEAT-006
logic while "just adding a guard" — including the RC1 read-authorization bug Sol
caught — that test fails.

---

## 5. Not verified here — release gates

These need a live environment and must not be represented as done:

- live Cloudflare R2 `ListObjectsV2` behaviour, pagination and permissions for
  the `usage()` reader (implemented and bounded, never executed against R2);
- Deno runtime/type compatibility of `supabase/functions/storage-health`;
- real `pg_database_size` values on Supabase, and whether the configured plan
  quota corresponds to that figure or to a larger billed volume — **the operator
  must confirm this when setting capacity**;
- scheduled refresh (cron) wiring;
- behaviour of a deployment that crosses 95% while requests are in flight;
- load behaviour of `usage()` on a bucket larger than 20 × 1000 objects (it
  returns `partial` and is correctly not used as authoritative, but that path
  has not run against R2);
- the six-hour freshness window has only been exercised against planted
  timestamps in the harness. Confirm the scheduled refresh actually runs well
  inside six hours, or R2 readings will routinely age out and the dashboard will
  sit on the metadata figure;
- the outbox worker has never run against a real bucket in this work. The tests
  prove the lock is held while a purge job is pending and released by a fresh
  measurement; they do not prove the worker deletes the object or that the next
  R2 reading drops. Confirm that end to end before relying on the cleanup button
  during an incident.

---

## 6. Out of scope

Everything FEAT-007: archive generation, checksums, viewer, purge. FEAT-008 only
measures, warns and protects. Per DEC-079 it never purges a school year.
