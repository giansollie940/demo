# FEAT-007 RC5 → RC6 — fix report

**Sol RC5 result:** `REQUEST_CHANGES` — one blocker (Critical). Both RC4
blockers were marked RESOLVED, the security note ACCEPTED, and everything under
"previously fixed items remain fixed" is untouched.
**RC6 scope:** that blocker. No other business rule was touched, and **no
frontend runtime file changed in RC6.**

The finding was correct. It was reproduced before anything was changed — all
five cases Sol described, plus what the purge then did to them.

---

## P1 — one owner per row, when a row can have several

### Reproduced first

```
1a reports        (class active + notice frozen): CHO PHÉP
2a corrections    (class active + notice frozen): CHO PHÉP
3a correction_rounds (attachment_id NULL, correction frozen): CHO PHÉP
4a media_history  (attachment active + notice frozen): CHO PHÉP
5a re-parent report onto the frozen notice:        CHO PHÉP
purge: purged
   report còn lại sau purge: 0
   correction còn lại sau purge: 0
   re-parented report còn lại sau purge: 0
```

Every write accepted after `purge_begin`; three of the rows then irreversibly
deleted by the purge, none of which was ever in the verified ZIP. That is the
exact invariant FEAT-007 exists to hold, failing.

### Two distinct defects behind it

**A priority list where there should have been a set.** `homework_reports` and
`homework_corrections` carry both `class_id` and `notice_id`. The archive, the
fingerprint and the purge all scope them by `notice_id`; the guard read
`class_id` because it came first. An active class with a frozen notice therefore
looked active to the freeze and frozen to the purge. The same disagreement exists
for `homework_notice_media` and `homework_media_history`, where the guard
preferred `attachment_id` while the rows die with their notice.

**`jsonb ? 'key'` is true for a NULL value.** `homework_correction_rounds`
gained a nullable `attachment_id` in FEAT-006. `to_jsonb(NEW)` carries that key
whatever its value, so the resolver took the branch, produced NULL, and never
reached `correction_id`. Every correction round with no image was attributed to
no year at all — invisible to the freeze on every table it touches.

I want to be exact about how this survived RC5: the RC5 fix was correct about
*which sides* to check and wrong about *what a side is*. Checking OLD and NEW
made the re-parenting case impossible in one direction while leaving it wide open
in the other, and the tests I wrote all used single-owner tables, so nothing
disagreed with me. Sol's framing — "one owner vs all purge-relevant owners" — is
the right way to say it.

### The rule in RC6

```
INSERT → every year the NEW row can be placed in
DELETE → every year the OLD row can be placed in
UPDATE → both sets, and refuse if ANY of them is frozen
```

`homework_private.archive_guard_years(jsonb)` returns that set. It resolves
`school_year_id`, `class_id`, `notice_id`, `candidate_id`, `duplicate_of`,
`attachment_id`, `english_group_id`, `correction_id` and `report_id`, and it uses
**no key-presence test at all** — each candidate is a scalar subquery keyed on
`p_row->>'…'`, so an absent or NULL column simply contributes nothing. There is
no priority left to get wrong, and Sol's NULL-masking case cannot recur by
construction rather than by a rule someone has to remember.

This is Sol's Option B rather than Option A. Option A — a per-table canonical
column — would also close the finding, and it is what the purge itself uses, but
it puts a second copy of the purge's scoping in the guard where the two can drift
apart. Option B cannot disagree with the purge, because it is a superset of it:
if a row is in *any* frozen year's reach, it is refused. The per-table map still
exists — as a **test**, not as production logic (see below).

`subject_id` is deliberately not resolved: `homework_notices` has a composite
foreign key on `(subject_id, class_id)`, so a notice's subject always belongs to
the notice's own class, which `class_id` already resolves.

Same reproduction after the fix:

```
1a reports        : từ chối (42501) Năm học đã đóng gói…
2a corrections    : từ chối (42501)
3a correction_rounds : từ chối (42501)
4a media_history  : từ chối (42501)
5a re-parent report onto the frozen notice: từ chối (42501)
purge: purged
   re-parented report còn lại sau purge: 1
```

### Sol's eight required tests

| # | Sol requirement | Test |
|---|---|---|
| 1 | frozen notice + active class → INSERT `homework_reports` denied | `a frozen notice under an active class is still a frozen row` |
| 2 | active report → `notice_id` moved to a frozen notice → denied | same test, third assertion, which also checks the row did not move |
| 3 | same two for `homework_corrections` | same test, second assertion |
| 4 | frozen correction + `attachment_id IS NULL` → denied | `a NULL key no longer hides the owner underneath it` |
| 5 | `homework_notice_media` / `homework_media_history` cannot be re-parented into the frozen set | `the link tables follow the notice, not only the image` — in both directions |
| 6 | active-year equivalents still work | `the active year and the purge are both unaffected` — the same three mixed-ownership writes, in a live year |
| 7 | internal purge/cascade still completes | same test: the purge runs to `purged` through both cascades |
| 8 | service-role path covered | `the service role is refused on a mixed-ownership row too`, with the guard's own message asserted |

### The map lives in a test, so it cannot rot quietly

`every purge step scopes by a column the resolver actually resolves` does three
things:

- reads the guarded tables **out of `pg_trigger`** and compares that set against
  a map of the purge steps' scoping, so a table added to the guard without a
  purge scope — or a purge step added without a guard — fails;
- asks the resolver, column by column, what it does with a NULL value, and
  requires the empty set rather than a throw or a bogus year;
- asks it again with real ids and requires the archived year.

That is Sol's Option A, kept as an assertion about Option B rather than as a
second implementation.

### Mutation-verified

Full 54-test archive suite re-run against each mutation.

| # | Mutation | Failing tests |
|---|---|---:|
| M1 | the guard never refuses | 10 |
| M2 | the bypass accepts any non-empty token, from anyone | 1 |
| M3 | `purge_step` stops presenting the bypass | 20 |
| M4 | a completed purge no longer promotes the year | 1 |
| M5 | the guard also refuses the FEAT-006 worker's close-out delete | 1 |
| M6 | `archive_release` forgets `'purged'` | **0** |
| M7 | M4 and M6 together | 1 |
| M8 | the UPDATE guard looks at NEW only (RC4) | 1 |
| M9 | the `classes` guard never refuses | 1 |
| M10 | the purge deletes class configuration again (RC4) | 1 |
| **M11** | **restore RC5's priority-first, NULL-masking resolver** | **4** |
| **M12** | **keep every key, but let a present-but-NULL `attachment_id` win** | **1** |

M11 is the mutation Sol asked for: restoring the current-at-RC5 behaviour fails
four tests. M12 is narrower and worth having separately — it isolates the
NULL-masking half of the defect from the priority half, so a future change that
fixes only one of them is still caught.

M6 remains the one honest zero, for the reason recorded since RC4:
`archive_release` only writes `active` `where archive_state='archiving'`, and a
completed purge has already promoted the year to `archived_read_only`, so that
branch is unreachable while the promotion stands. M7 removes both and is caught.

---

## Verification

`node scripts/verify-feat007.mjs` — **16/16 PASS, 321 tests, 0 FAIL** (RC5: 315).

| Suite | RC5 | RC6 |
|---|---:|---:|
| FEAT-007 archive SQL | 48 | **54** |
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
| **Total** | **315** | **321** |

Typecheck PASS, production build PASS.

The migration-12 re-runs carry more weight at RC6 than at any earlier RC: the
resolver now issues up to nine candidate lookups per row per side, on every
insert, update and delete across sixteen tables, including in years that are
perfectly active. FEAT-005, FEAT-006 and FEAT-008 pass unchanged on migration 12,
which is the evidence that nothing legitimate is caught by the wider net.

---

## Changed files, RC5 → RC6

| File | Change |
|---|---|
| `database/upgrade/12-FEAT-007-ARCHIVE-PURGE.sql` | `archive_guard_year` → `archive_guard_years`, returning every resolvable owner with no key-presence test; `archive_guard()` unions both sides and refuses if any year is frozen |
| `tests/feat-007/database.test.mjs` | Sol's eight cases, plus the `pg_trigger` ↔ purge-scope completeness test |
| `docs/feat-007/FEAT-007_DECISIONS_UPDATE.md` | DEC-100 revised: the resolution rule, the two defects it replaces, and why Option B over Option A |
| `docs/feat-007/RC6_FIX_REPORT.md` | new |
| docs, `START-HERE-FEAT-007.md`, `RELEASE.json`, `SHA256SUMS.txt` | updated |

No frontend runtime file changed in RC6.

---

## Still release-verification gates

Unchanged from RC5, with the cost note sharpened. Per affected row the guard now
runs up to nine scalar subqueries per side, all on primary keys, plus one
`school_years` lookup per distinct candidate year. Most rows resolve one or two
candidates; `homework_moderation_events` is the widest at four. The harness
cannot see the difference at its row counts, and the three migration-12 suites
only prove correctness, not cost. Measure a real class's daily write volume, and
the purge of a year with tens of thousands of rows, before this migration runs in
production.

One adjacent weakness noticed while resolving `candidate_id` and `duplicate_of`,
**flagged not fixed**, because it predates FEAT-007 and closing it means changing
a FEAT-001 foreign key: `homework_duplicate_reviews.candidate_id` references
`homework_notices` with no `on delete` action. A cross-year candidate row would
make the `notices` purge step fail on a foreign-key violation rather than delete
anything — noisy, not destructive. The app cannot create one (duplicate detection
runs within a class), and RC6's resolver now refuses to create one directly, so
the situation is unreachable going forward. Recorded so it is not rediscovered as
a mystery.
