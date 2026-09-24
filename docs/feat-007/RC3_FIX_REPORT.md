# FEAT-007 RC2 → RC3 — fix report

**Sol RC2 result:** `REQUEST_CHANGES` — one P1. RC1 P2 (media verification) was
marked RESOLVED and is untouched here.
**RC3 scope:** that P1, plus one correction to how RC2 described the two dialog
fixes (§3). No other business rule was touched.

The finding was correct. It was reproduced before anything was changed.

---

## P1 — a mid-build change was absorbed into the fingerprint instead of caught

### Reproduced first

```
ZIP chứa title = "Bài tập"
complete → verified
purge_begin → purging
DB còn lại: 0 bài
=> "B — chỉ có trên cloud" đã bị xoá; ZIP chỉ có "Bài tập"
```

`begin` → the browser exports `homework_notices.json` (title "A") → the SQL
editor updates that row to "B" → `complete`. RC2 hashed the dataset *at
`complete`*, so it hashed "B", stored that, and called the archive verified. The
purge later recomputed the same "B" hash, matched, and deleted the row. The only
surviving copy said "A".

### What RC2 got wrong

RC2's own DEC-097 claimed the fingerprint covers SQL-editor and service-role
changes. It did — but only over `complete → purge_begin`. The interval that
actually matters for whether the ZIP is a faithful copy is
`begin → export → complete`, and nothing covered it. Counts did not help: an
update moves no count, which is exactly the case the count check was already
known to miss.

### The rule in RC3

The dataset is fingerprinted at three points, and each one has to agree with the
last (DEC-097, rewritten):

```
begin       →  begin_fingerprint = fingerprint(year)   (before the browser reads anything)
               …browser exports rows, downloads media…
complete    →  refuse unless fingerprint(year) == begin_fingerprint
               dataset_fingerprint = begin_fingerprint
               …verified, year stays frozen…
purge_begin →  refuse unless fingerprint(year) == dataset_fingerprint
```

Taking the hash **before** the browser reads a single row is the whole fix.
`complete` now fails with `dataset_changed_during_archive`, and — as with every
other failure path — releases the freeze unless another building or verified
archive of that year still needs it.

Same reproduction after the fix:

```
ZIP chứa title = "Bài tập"
complete → failed dataset_changed_during_archive
=> purge không mở được. Trạng thái năm học: active
```

### Sol's five required tests

| Test | Sol requirement |
|---|---|
| an update during the build fails the archive, even with counts unchanged | 1 |
| the same holds for an entity other than notices (a renamed student) | 2 |
| an undisturbed run verifies, and stores the fingerprint it started from | 3 |
| an update after verification still blocks the purge *(RC2 test, retained)* | 4 |
| a run failed by the fingerprint check releases the freeze, unless another archive holds it | 5 |

Requirement 2 is worth a note. The first attempt renamed a `class_subjects` row
and the archive verified anyway — which looked like a hole in the fingerprint and
was not. FEAT-004's `class_subject_catalog_guard` rewrites `name`, `short_name`
and `icon` from the catalog on **every** update, so the rename never reached the
table. The test now renames a profile instead, and the reason is recorded in the
test so nobody re-derives it later.

### Mutation-verified

| Mutation | Failing tests |
|---|---|
| drop the complete-time fingerprint comparison | 3 |
| stop recording a fingerprint at `begin` | 31 |
| store the complete-time hash instead of the begin one | **0** |
| both of the last two together — i.e. exactly RC2's behaviour | 3 |

The third one deserves an honest word rather than a quiet omission. When the
`complete` check passes, the begin hash and the current hash are equal by
definition, so assigning either produces the same row. That assignment is
defensive and clarifying, not load-bearing; the **check** is what carries the
guarantee. Reverting both together reproduces RC2 exactly and is caught.

---

## 2. Verification

`node scripts/verify-feat007.mjs` — **16/16 PASS, 301 tests, 0 FAIL** (RC2: 292).

| Suite | RC2 | RC3 |
|---|---:|---:|
| FEAT-007 archive SQL | 30 | **34** |
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
| **Total** | **292** | **301** |

Typecheck PASS, production build PASS.

---

## 3. Correction: RC2 overstated the two dialog fixes

RC2's fix report called them "two production crashes". That was wrong, and the
owner caught it by sending a screenshot of the page working normally.

What actually happens, measured by running the broken and fixed components side
by side:

```
[BROKEN] console: Cannot access 'touched' before initialization
[BROKEN] page renders: true | dialog opens: true | inputs: 3

[FIXED ] console: (none)
[FIXED ] page renders: true | dialog opens: true | inputs: 3
```

Identical except for the console line. Vue catches the error inside the
watcher's own invocation; a production build only logs it, so `setup()` carries
on and the component mounts. The immediate run of the watcher is lost, but `open`
starts `false`, and the next change of `props.open` re-runs it with the binding
initialised.

So it is a latent bug — a console error today, and a silently uninitialised form
the first time anything renders one of these dialogs with `open` already `true` —
not an outage. DEC-099 now says this, with the measurement.

Two things went wrong in how RC2 reached the earlier claim, and both are the
kind this project has been careful about elsewhere:

1. the first experiment ran a **dev** build of Vue, which rethrows an unhandled
   setup error and kills the parent render. That result was carried over to
   production without checking that the two behave differently;
2. the second experiment measured "did the dialog render" with `open: false`,
   against a template whose root is `v-if="open"`. It was always going to report
   "not rendered", with or without the bug — a test passing for the wrong reason,
   used to support a conclusion.

The fixes themselves stand: the ordering is wrong, the static scanner earns its
place (it found the second instance), and both dialogs have mounting tests. Only
the severity was misreported.

---

## 4. Changed files, RC2 → RC3

| File | Change |
|---|---|
| `database/upgrade/12-FEAT-007-ARCHIVE-PURGE.sql` | `begin_fingerprint` column; `begin` records it; `complete` refuses unless unchanged and stores the begin value |
| `tests/feat-007/database.test.mjs` | Sol's four new regression tests |
| `docs/feat-007/FEAT-007_DECISIONS_UPDATE.md` | DEC-097 rewritten for the three-stage guarantee; DEC-099 severity corrected with the measurement |
| `docs/feat-007/RC3_FIX_REPORT.md` | new |
| docs, `START-HERE-FEAT-007.md`, `RELEASE.json`, `SHA256SUMS.txt` | updated |

No frontend runtime file changed in RC3. The RC1 P2 media-verification work Sol
marked RESOLVED is untouched.

## 5. Still release-verification gates

Unchanged from RC2, with one addition specific to this fix: `archive_fingerprint`
now runs **three** times per archive (begin, complete, purge) instead of two, and
each run is a full scan of the year's tables. On a year with tens of thousands of
rows, confirm the duration is acceptable before relying on it in a maintenance
window.
