# FEAT-007 RC3 → RC4 — fix report

**Sol RC3 result:** `REQUEST_CHANGES` — one P1 (Critical). RC1 P2 (media
verification) and RC2 P1 (begin-time fingerprint) were marked RESOLVED and are
untouched here.
**RC4 scope:** that P1, plus both non-blocking observations. No other business
rule was touched, and **no frontend runtime file changed in RC4.**

The finding was correct. It was reproduced before anything was changed.

---

## P1 — the dataset could still change *during* the multi-step purge

### Reproduced first

```
chèn được bài "C" sau purge_begin: true
sau khi purge xong, bài "C" còn lại: 0
```

Archive verified and downloaded. `purge_begin` recomputes the fingerprint,
matches, and flips the archive to `purging`. Two `purge_step` calls commit. A
plain `insert into public.homework_notices …` from the SQL editor then lands, and
the later `notices` step deletes it along with A and B. Notice C existed for a
few seconds, was never in the ZIP, and is now gone from both sides with nothing
recording that it ever existed.

### Why RC3's protections could not cover it

DEC-096's freeze and DEC-097's fingerprint are both correct, and both stop at
`purge_begin`:

- the freeze was implemented **only** in `public.homework_api` and
  `public.homework_media`. A direct SQL or service-role write never passes
  through either, so the dispatcher guard cannot see it at all;
- the fingerprint cannot be re-checked during the purge, because the purge is
  *supposed* to change the dataset. Sol's review says this explicitly, and it is
  right.

So the interval `purge_begin → purged` had no owner. Sol's Option A.

### The rule in RC4

The guard moved off the dispatchers and onto the tables.
`homework_private.archive_guard()` is a `before insert or update or delete`
row-level trigger on **sixteen** year-owned tables. It resolves the row's school
year, and while that year is `archiving` or `archived_read_only` it raises
`42501` — whatever the caller, whatever the path.

```
begin ──────── complete ──────── purge_begin ──────── purged
   fingerprint      fingerprint          table-level freeze
```

Two narrow exceptions, both audited in the source:

1. **the purge itself.** `purge_step` calls
   `set_config('homework.archive_purge', <archive id>, true)`. The guard accepts
   the token only if it names an archive that belongs to *this* year and is
   actually `purging`. `set_config(…, true)` is transaction-local, so it dies
   with the step that set it;
2. **the end of the FEAT-006 media lifecycle.** The worker deletes an attachment
   row once R2 confirms the object is gone. That row is already `deleting` and
   cannot introduce anything the archive lacks. Refusing it would strand
   attachment rows for ever and leave storage health counting bytes that no
   longer exist in the bucket.

Same reproduction after the fix:

```
chèn được bài "C" sau purge_begin: false
ERROR 42501: Năm học đã đóng gói nên dữ liệu của năm đó không thay đổi được nữa
             (homework_notices.insert).
```

One implementation note worth recording, because it cost a run to find: the
`deleting` exception reads `data->>'status'`, not `old.status`. Postgres does not
guarantee that the left side of `AND` short-circuits for record field access, so
naming a column that only one table has fails on every *other* table the trigger
is attached to.

### Four tables are deliberately not guarded

| Table | Why not |
|---|---|
| `profiles`, `classes` | purge never deletes them, so a late write cannot be destroyed — and freezing them would stop an Admin renaming a student who also studies in the current year |
| `homework_settings`, `homework_backlog_state` | the FEAT-001/002 dispatcher creates these lazily on **every** call, `load` and `inbox` included. Guarding them makes an archived year unreadable, which is the one thing RB-711 requires it to stay |

**A gap this exposes, flagged rather than fixed.** `homework_settings` and
`homework_backlog_state` are purged but never archived, so tuned per-class
thresholds are lost at purge. That is a gap in what the archive *captures*, not a
hole in what the freeze *protects*. Widening the archive format is not this
release's job, so it is recorded in DEC-100 for the reviewer to rule on rather
than absorbed quietly.

### Sol's six required tests, plus one

| # | Sol requirement | Test |
|---|---|---|
| 1 | INSERT after `purge_begin` rejected | `a direct INSERT after purge_begin is refused, not silently purged` — and the purge still finishes cleanly afterwards |
| 2 | count-preserving UPDATE rejected | `a count-preserving UPDATE after purge_begin is refused too` — on notices, and on a table the step list has not reached yet |
| 3 | service-role path covered, not only `homework_api` | `the guard is on the table, so the service role is refused as well` — `set role service_role`, no JWT, no dispatcher |
| 4 | internal `purge_step` still succeeds | `the freeze does not block the purge itself, and a resumed purge still works` |
| 5 | interrupted purge resumes without weakening the guard | same test: a step is left `running`, the purge resumes to `purged`, and the bypass is confirmed not to have outlived its transaction |
| 6 | a purged year cannot return to writable | `a purged year cannot drift back to writable` — the year is promoted to `archived_read_only`, `begin` refuses it, and `archive_release` called directly refuses to unfreeze it |
| — | the freeze must not break what it is not aimed at | `the freeze leaves other years, and reading the archived year, alone` — the neighbouring year stays writable, and `load` / `inbox` / media `read` still work on the archived one |
| — | the worker must still close out purged media | `the freeze still lets the FEAT-006 worker finish removing purged media` |
| — | the bypass must not be forgeable | `the bypass cannot be forged: it must name a purging archive of this year` *(added during mutation testing — see below)* |

FEAT-007 archive SQL: **30 (RC2) → 34 (RC3) → 42 (RC4)**.

### Mutation-verified

Every mutation was applied to `12-FEAT-007-ARCHIVE-PURGE.sql` and the full
42-test archive suite re-run.

| # | Mutation | Failing tests |
|---|---|---:|
| M1 | the guard never refuses — it returns the row instead of raising | 3 |
| M2 | the bypass accepts any non-empty token, from anyone | **0 → 1** |
| M3 | `purge_step` stops presenting the bypass | 16 |
| M4 | a completed purge no longer promotes the year to `archived_read_only` | 1 |
| M5 | the guard also refuses the FEAT-006 worker's close-out delete | 1 |
| M6 | `archive_release` stops treating `'purged'` as still holding the freeze | **0** |
| M7 | M4 and M6 together | 1 |

Two entries need an honest word rather than a quiet omission.

**M2 started at zero, and that was a defective test, not an equivalent mutant.**
Nothing in the suite ever presented a forged token, so widening the bypass to
"any non-empty string" changed no outcome. Worse, the assertion that was meant to
cover this — in the resume test — ended in `.catch(() => {})`, which cannot fail,
and inserted a reaction against a random notice id, which the guard correctly
declines to attribute to any year. It was a test passing for the wrong reason.
Both were fixed: the resume test now asserts directly that
`current_setting('homework.archive_purge', true)` is empty after the step, and a
new test presents a token naming (a) an archive that is not purging, (b) a
genuinely purging archive of a *different* year, and (c) an id that names
nothing. M2 now fails one test, which is the one that should catch it.

**M6 is genuinely equivalent on its own, given M4.** `archive_release` only ever
writes `archive_state='active'` `where archive_state='archiving'`, and a
completed purge has already promoted the year to `archived_read_only`, so the
`'purged'` entry in the status list is unreachable while the promotion stands. It
is defence in depth for the case where a purge is interrupted before the
promotion commits. M7 removes both and is caught, which is the proof that the
pair is load-bearing even though neither half is reachable alone.

---

## 2. Non-blocking observations

**#1 — `subjects.json` and the fingerprint's scope.** Accepted; this was a
documentation gap, not an implementation one. DEC-097 now says what the
fingerprint covers in as many words: the **year-owned dataset that purge deletes
and the archive carries**. Shared reference rows — `grade_subject_catalog` — are
exported into `subjects.json` so the archive reads sensibly on its own, are never
purged, and are deliberately outside the fingerprint, because a change to the
shared catalog must not fail an unrelated year's archive.

**#2 — a purge leaving the year in `archiving`.** Implemented. The last
`purge_step` now sets `archive_state='archived_read_only'`, and
`archive_release` refuses to unfreeze a year that has a purged archive, so an
abandoned later run cannot hand it back as writable. Both are covered by test 6
above and by mutations M4/M7.

---

## 3. Verification

`node scripts/verify-feat007.mjs` — **16/16 PASS, 309 tests, 0 FAIL** (RC3: 301).

| Suite | RC3 | RC4 |
|---|---:|---:|
| FEAT-007 archive SQL | 34 | **42** |
| FEAT-007 archive/viewer frontend | 33 | 33 |
| FEAT-008 storage SQL | 20 | 20 |
| FEAT-008 SQL on migration 12 | 20 | 20 |
| FEAT-008 dashboard UI | 9 | 9 |
| FEAT-006 SQL | 13 | 13 |
| FEAT-006 SQL on migration 12 | 13 | 13 |
| FEAT-005 SQL on migration 12 | 13 | 13 |
| FEAT-006 frontend | 10 | 10 |
| FEAT-005 under migration 10 | 13 | 13 |
| FEAT-001/002 legacy SQL | 43 | 43 |
| FEAT-004 SQL | 6 | 6 |
| Static frontend regression | 10 | 10 |
| Existing FEAT-001–005 frontend | 64 | 64 |
| **Total** | **301** | **309** |

Typecheck PASS, production build PASS.

The FEAT-005/006/008 suites re-run **on migration 12** are the ones that matter
for this change: sixteen new row-level triggers sit on tables those features
write to every day, and all three suites pass unchanged, which is the evidence
that the guard is inert while a year is `active`.

---

## 4. Changed files, RC3 → RC4

| File | Change |
|---|---|
| `database/upgrade/12-FEAT-007-ARCHIVE-PURGE.sql` | `homework_private.archive_guard()` + triggers on 16 tables; the transaction-local purge bypass; the FEAT-006 worker allowance; purge promotes the year to `archived_read_only`; `archive_release` refuses purged years |
| `tests/feat-007/database.test.mjs` | Sol's six tests, the worker close-out test, the bypass-forgery test; the vacuous assertion in the resume test replaced |
| `tests/feat-007/fixture.mjs` | `outOfBand(db, run)` — `session_replication_role='replica'`, to model a write that evades triggers |
| `docs/feat-007/FEAT-007_DECISIONS_UPDATE.md` | DEC-100 added; DEC-097 scope clarified and its interval ownership stated |
| `docs/feat-007/RC4_FIX_REPORT.md` | new |
| docs, `START-HERE-FEAT-007.md`, `RELEASE.json`, `SHA256SUMS.txt` | updated |

No frontend runtime file changed in RC4.

---

## 5. Still release-verification gates

Unchanged from RC3, with one addition specific to this fix: the guard runs a
`select archive_state from public.school_years` **per affected row** on sixteen
tables. Every current write path touches a handful of rows at a time, so this was
not measurable in the harness — but confirm the cost on a real year before
relying on it in a maintenance window, and re-measure the purge of a year with
tens of thousands of rows, where each deleted row now also fires the trigger.
