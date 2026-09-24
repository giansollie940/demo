# FEAT-007 — production is running RC1, not RC6

## What was found

A read-only check of the live database (`qhqqujozpqopahxscpks`, project `tu-hoc`)
on 2026-09-19 found FEAT-007 **already installed**, at **RC1** — the version Sol
rejected — not at the RC6 version just approved.

### How that was established, rather than guessed

`md5(prosrc)` of every FEAT-007 function on production, compared against the same
function bodies extracted from each RC package:

| Function | production length | RC1 | RC2 | RC6 |
|---|---:|:--:|:--:|:--:|
| `archive_admin` | 273 | **match** | match | match |
| `archive_blockers` | 1524 | **match** | match | match |
| `archive_counts` | 1962 | **match** | match | match |
| `archive_readonly` | 165 | **match** | differs | differs |
| `homework_archive` | 18094 | **match** | differs (20791) | differs (21931) |
| `homework_archive_export` | 6518 | **match** | match | match |

All six match RC1 byte-for-byte once line endings are normalised — the file was
applied from a CRLF copy, which is why every stored body is a few bytes longer
than the file in the repository. RC2 and RC6 disagree on the two functions the
later rounds changed, so the identification is not ambiguous.

Corroborating schema facts, each of which is an RC1 signature:

- `homework_archives` has **no** `begin_fingerprint` and no `dataset_fingerprint`
  column — those arrived in RC2/RC3;
- `homework_private` has exactly four `archive*` helpers. RC6 has nine
  (`archive_fingerprint`, `archive_release`, `archive_guard`, `archive_guard_class`,
  `archive_frozen`, `archive_guard_years` are all absent);
- **zero** `homework_archive_guard` triggers — the table-level freeze, which is
  the whole of RC4 and RC5, is not installed;
- `school_years.archive_state` allows only `('active','archived_read_only')`. RC6
  adds `'archiving'`, the state the run freeze uses.

The `archive-media` Edge Function is deployed and ACTIVE (version 1). Its source
is **identical** in RC1 and RC6, so it does not need redeploying.

### What that means, stated plainly

Every defect the five review rounds found is live:

| Found in | Defect now in production |
|---|---|
| RC1 P1 | a verified archive can go stale and the purge still deletes newer data |
| RC1 P2 | the download confirmation does not verify the images, so a ZIP missing a picture can unlock the purge |
| RC2 P1 | a change made *during* the build is absorbed into the fingerprint instead of caught |
| RC3 P1 | no table-level freeze: a direct SQL or service-role write between two purge steps is deleted without ever being in the ZIP |
| RC4 P1 | the purge deletes `homework_settings` and `homework_backlog_state`, which the archive never carries |
| RC4 P2 / RC5 P1 | a frozen row can be moved out of the year, or into the purge set through a second owner |

### What has not happened

Nothing has used it. Measured on the live database:

```
homework_archives        0 rows
homework_archive_events  0 rows
homework_archive_steps   0 rows
homework_archive_media   0 rows
school_years             1 row, archive_state = 'active'
```

No archive has ever been started, so no data has been lost and no year is frozen.
The exposure is forward-looking: **Quản trị → Kho lưu trữ** is live, it runs the
rejected code, and a purge cannot be undone.

---

## The upgrade

Two files, in this order, both in the Supabase SQL editor, nothing in between:

1. **`database/upgrade/12b-FEAT-007-RC1-TO-RC6-RESET.sql`** — removes RC1's
   FEAT-007 objects and puts the two dispatchers back where migration 11 left
   them.
2. **`database/upgrade/12-FEAT-007-ARCHIVE-PURGE.sql`** — the approved RC6 file,
   **unchanged**, exactly as Sol reviewed it.

### Why a reset instead of a delta

A hand-written delta would produce a schema that *resembles* the reviewed one.
Removing RC1 and running the reviewed file unchanged produces the reviewed one.
The only reason that is available is that the feature has never been used — with
a single archive row it would not be, because dropping the tables would destroy
the record of what was archived.

The reset refuses to run if either condition fails. Both refusals were tested:

```
A1 refuse khi đã có bản lưu trữ: Đã có 1 bản lưu trữ trong homework_archives…
A2 refuse khi năm học bị đóng băng: Có năm học đang ở trạng thái archived_read_only…
```

### Proof that the two files land on the approved schema

Two databases were built in the harness and their catalogs compared — one clean
plus RC6, one RC1 then reset then RC6:

```
grants:      identical (82)
columns:     identical (308)
triggers:    identical (23)
functions:   identical (60)   ← compared by md5(prosrc), not by name
constraints: identical (176)

RESULT: upgraded database is catalog-identical to a clean RC6 install.
```

And the upgraded database was then driven through a full run:

```
nâng cấp RC1 → RC6: OK
đóng gói: verified | vân tay begin đã ghi: true
khoá bảng sau purge_begin: 42501 Năm học đã đóng gói nên dữ liệu của năm đó kh…
purge: purged | năm học: archived_read_only | ngưỡng giữ lại: 7
```

The last line is the two RC5 fixes working on the upgraded schema: the year is
promoted rather than left in `archiving`, and the tuned threshold `7` survives.

---

## The frontend also has to be redeployed

Four files differ between the RC1 build that is live and RC6:

| File | Why it matters |
|---|---|
| `src/features/archive/reader.ts` | RC1 P2. The saved-ZIP verdict must cover every image, not only the text files. Without this the purge gate can be unlocked by a ZIP with a missing picture — the database fix alone does not close it |
| `src/components/admin/ArchiveViewer.vue` | the progress and verdict wiring for the above |
| `src/components/admin/AdminUserDialog.vue` | the immediate-watcher TDZ fix (DEC-099) |
| `src/components/students/StudentAccountDialog.vue` | the same bug, second instance |

`public/` and `index.html` are unchanged, and so is the `archive-media` Edge
Function — its source is identical in RC1 and RC6.

**Do the frontend first, or at least in the same maintenance window.** The
database fixes and the reader fix guard different halves of the same gate.

---

## Order

1. Read-only: re-run the two integrity queries at the top of `DEPLOYMENT.md`.
2. Confirm on the live database that `homework_archives` is still empty and every
   `school_years.archive_state` is `'active'` — the reset checks this itself, but
   knowing beforehand is cheaper than reading an exception.
3. Deploy the RC6 frontend build.
4. Run `12b-FEAT-007-RC1-TO-RC6-RESET.sql`.
5. Run `12-FEAT-007-ARCHIVE-PURGE.sql` (RC6, unchanged).
6. Confirm **Quản trị → Kho lưu trữ** still renders and `Kiểm tra` returns counts.
7. Only then work through the live gates in `DEPLOYMENT.md` — on a test year
   first, never on a year anyone still needs.

Nothing in steps 3–5 touches teaching data: the archive tables are empty, and
migration 12 rewrites no rows.

## Rollback

`DEPLOYMENT.md` has the rollback, and it now includes dropping the guard
triggers, which the earlier version of that section missed. Rolling back leaves
the database without FEAT-007 at all — which, given that nothing has used it, is
a clean state rather than a degraded one.

---

## Open question for the owner

How did RC1 come to be applied? The answer changes what to do next. If it was
applied deliberately to try the feature, nothing else is implied. If it was
applied as part of a routine "run the migrations in the package" step, then the
same thing may have happened with an earlier FEAT-006 or FEAT-008 RC, and those
are worth the same fingerprint check this document used. That check is cheap and
read-only; say the word.

---

## Addendum, 2026-09-19 — FEAT-005, FEAT-006 and FEAT-008 checked, no drift

The owner confirmed RC1 was applied deliberately, to try the feature. The same
fingerprint check was then run against the rest of the suite. All read-only.

**Function bodies.** Every function each migration creates was extracted from the
repository file and its `md5` compared against `md5(prosrc)` on production,
matching by body rather than by name so the dispatcher renames
(`homework_api → api_v6 → api_v8`) do not confuse the comparison:

| Migration | Result |
|---|---|
| `09-FEAT-005-OWNERSHIP-CORRECTION.sql` | **12/12 match** |
| `10-FEAT-006-HOMEWORK-MEDIA.sql` | **8/8 match** |
| `11-FEAT-008-STORAGE-HEALTH.sql` | **8/8 match** |

**Schema objects.** Every table, index, trigger and added column those two
migrations create was checked for presence on production — eight tables, four
indexes, two triggers, two added columns. The query returned the *missing* ones,
and returned nothing.

**Column shapes.** The 78 columns of those nine tables were compared against the
same tables built by the harness through migration 11, including type, nullability
and default. 78 on each side, zero differences either way —
`homework_storage_usage.deleting_bytes`, which FEAT-008 RC3 added, is present with
the right default.

So FEAT-005, FEAT-006 and FEAT-008 on production are the approved versions, and
the RC1 installation was an isolated one-off. Only FEAT-007 needs the upgrade
above.
