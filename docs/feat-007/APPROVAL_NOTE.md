# FEAT-007 — approval note

**Sol RC6 result: `APPROVED`** at the implementation-review gate. DEC-100 and
DEC-101 RATIFIED; DEC-091 through DEC-099 unchanged. The Media & Storage suite is
now code-review complete: FEAT-006 APPROVED, FEAT-008 APPROVED, FEAT-007
APPROVED.

The approved artefact is **`SO-TU-HOC-FEAT-007-RC6-FULL.zip`**, SHA-256
`529f86e45ca2dce303e5f2cab0914b393fb1fc7352f43f8266cfe61586dd9b5d`, which Sol
verified at 596/596 entries. That file is not being re-cut: an approval is tied to
a hash, and re-packaging to change a status line would throw the hash away for
nothing.

This note records what changed in the working copy *after* that package, all of
it documentation:

| File | Change |
|---|---|
| `RELEASE.json` | `status` → `APPROVED_NOT_DEPLOYED`; `review_gate` recorded |
| `START-HERE-FEAT-007.md`, `docs/feat-007/IMPLEMENTATION_REPORT.md` | status line |
| `docs/feat-007/FEAT-007_DECISIONS_UPDATE.md` | DEC-100 and DEC-101 marked RATIFIED |
| `docs/feat-007/DEPLOYMENT.md` | Sol §10's pre-migration integrity check; two smoke tests added; the rollback corrected |
| `docs/feat-007/APPROVAL_NOTE.md` | this file |

**No runtime file changed** — `src/`, `public/`, `supabase/`,
`database/upgrade/12-FEAT-007-ARCHIVE-PURGE.sql` and `tests/` are byte-identical
to the approved package. To check that rather than take my word for it, extract
the RC6 ZIP next to this tree and compare:

```bash
diff -rq SO-TU-HOC-FEAT-007-RC6/src ./src
diff -rq SO-TU-HOC-FEAT-007-RC6/supabase ./supabase
diff -rq SO-TU-HOC-FEAT-007-RC6/database ./database
diff -rq SO-TU-HOC-FEAT-007-RC6/tests ./tests
```

## The two documentation fixes worth reading

**1. Sol's §10 non-blocking item, turned into something runnable.**
`homework_duplicate_reviews.candidate_id` references `homework_notices` with no
`on delete` action. A review row whose candidate lives in another year would make
the `notices` purge step fail on a foreign key — noisy and recoverable, not
destructive — and nothing has ever checked whether legacy rows like that exist.
`DEPLOYMENT.md` now opens with the read-only query that answers it, plus a second
one for the same shape of drift between a row's `class_id` and its
`school_year_id`. Both were run against the harness: zero rows, as expected.

**2. The rollback was wrong, and had been since RC4.** It restored the two
dispatchers and said nothing about the sixteen guard triggers, `classes`'
narrow guard, or the four helper functions. Rolling back by that recipe would
have left the freeze installed — harmless while every year is `active`, since the
guard returns before doing anything, but not a rollback. `DEPLOYMENT.md` now has
the block that removes them, with the warning that it must not be run while an
archive is `building`, `verified` or `purging`.

Both SQL blocks were executed against the pglite harness rather than eyeballed:
the queries return, the rollback drops all 17 triggers and all 4 functions, and
the app still serves `load` and `submit` afterwards.

## What has *not* happened

No migration has been applied anywhere. No Edge Function has been deployed. No
frontend build has been published. `production_deployed` and
`production_migration_run` are both still `false` in `RELEASE.json`, and the
eleven live gates at the end of `DEPLOYMENT.md` — a real R2 run, the Deno
runtime, File System Access on the target browser, purge performance on a large
year, and the cost of the multi-owner guard on ordinary daily writes — have not
been run in any environment.
