# FEAT-007 RC4 → RC5 — fix report

**Sol RC4 result:** `REQUEST_CHANGES` — two blockers (P1 Critical, P2 High) and
one non-blocking security note. Everything Sol listed under "previously fixed
items remain fixed" is untouched.
**RC5 scope:** both blockers, the security note, and one test of my own that was
passing for the wrong reason and only showed up while checking Sol's finding. No
other business rule was touched, and **no frontend runtime file changed in RC5.**

Both findings were correct. Both were reproduced before anything was changed.

---

## P1 — the purge destroyed configuration the archive never carried

### Reproduced first

```
ngưỡng trước khi purge: {"seed_threshold":7,"pending_threshold":55,"reject_threshold":88}
purge: purged
ngưỡng sau khi purge: null
```

The `class_config` step deleted `homework_settings` and
`homework_backlog_state`. Neither is in `ENTITY_FILES`, `archive_counts()`,
`archive_fingerprint()` or the freeze. A class's tuned thresholds went to zero
copies in one irreversible step.

### What RC4 got wrong, and it was not a detail

RC4 found this itself and shipped it as a "known gap, flagged not fixed",
reasoning that it was a gap in what the archive *captures* rather than in what
the freeze *protects*. That reasoning is wrong on its own terms. FEAT-007's whole
premise is **archive the year, then delete it**; deleting something that was
never archived is not a gap in coverage, it is the safety model failing. Flagging
it was better than hiding it, but flagging is not a substitute for not doing it.

### The rule in RC5 (DEC-101)

**The purge may only delete what the archive carries.** The `class_config` step
is gone; both tables survive. The step list drops from fourteen to thirteen.

Sol's Option A rather than Option B, for three reasons:

- both tables are keyed by `class_id`, not by year, and classes are never purged
  — so keeping them is consistent with what already happens, not an exception;
- they are a handful of small rows; deleting them reclaims nothing;
- archiving them properly at RC5 means a new `ENTITY_FILES` entry, a format
  version bump, Viewer work, a fingerprint change and new checksums — all inside
  the release whose subject is the freeze.

If a later release does want them purged, Option B is the path, and it has to be
all of it rather than an exception buried inside the purge. DEC-101 says so.

Same reproduction after the fix:

```
ngưỡng sau khi purge: {"seed_threshold":7,"pending_threshold":55,"reject_threshold":88}
```

The test sets a **non-default** value on every column, exactly as Sol asked, so a
row the dispatcher lazily recreates at its defaults cannot make it pass.

---

## P2 — a frozen row could be re-parented out of the year

### Reproduced first

```
P2 — cả lớp → năm đang hoạt động: CHO PHÉP
P2 — ảnh mồ côi → năm đang hoạt động: CHO PHÉP
purge: purged
P2 — ảnh mồ côi sau purge: {"school_year_id":"…b0","status":"active"}
P2 — ảnh mồ côi có được xếp hàng xoá khỏi R2 không: false
   (ảnh của bài viết, để đối chứng): {"status":"deleting"}
```

The consequence is worse than a stray row, and worth stating plainly: an image
that **was** in the verified archive, moved to another year between two purge
steps, is never offered to the year-end sweep. It stays `active` in a live year,
its R2 object is never queued for deletion, and the storage the purge exists to
reclaim is never reclaimed. The control image, left alone, went to `deleting` as
it should.

Sol's own first example behaves differently and it is worth being exact about it:
re-parenting a `class_subjects` row is already refused — by FEAT-004's
`class_subject_catalog_guard` (`P0001 Không đổi liên kết môn lớp`), not by the
archive freeze. So that one example was closed by an unrelated rule; the shape
Sol identified was real everywhere else.

### One more instance of the same shape, found while fixing it

`classes` was excluded from the freeze in RC4 on the grounds that purge never
deletes a class. True — but a class is what attributes half the guarded tables to
a year. `update public.classes set school_year_id=…` was accepted, and it takes
the class's subjects out of the purge set with it; `delete from public.classes`
would destroy rows the archive represents. Same defect class, found because Sol
named the shape, so it is fixed here rather than left for RC6.

### The rule in RC5

```
INSERT → check the NEW year
DELETE → check the OLD year
UPDATE → check BOTH, and refuse if either is frozen
```

A frozen row cannot leave its year; a frozen year cannot adopt one. The guard was
split into three pieces to make that readable:
`homework_private.archive_guard_year(jsonb)` resolves a row's year,
`homework_private.archive_frozen(uuid)` decides whether that year is closed to
this caller, and `archive_guard()` applies them to whichever sides exist for the
operation. `classes` gets `archive_guard_class()`, which refuses only the two
operations that matter — changing `school_year_id`, and `DELETE` — so renaming or
deactivating a class of a packed-away year still works.

Same reproduction after the fix:

```
P2 — cả lớp → năm đang hoạt động: từ chối (42501) Năm học đã đóng gói nên không chuyển lớp sang năm khác được.
P2 — ảnh mồ côi → năm đang hoạt động: từ chối (42501) Năm học đã đóng gói nên dữ liệu…
P2 — ảnh mồ côi sau purge: {"school_year_id":"…0002","status":"deleting"}
P2 — ảnh mồ côi có được xếp hàng xoá khỏi R2 không: true
```

### Sol's five required tests

| # | Sol requirement | Test |
|---|---|---|
| 1 | frozen `class_subjects` → active-year class → denied | `a frozen row cannot be re-parented into an active year`, last assertion — with a note in the test that FEAT-004 refuses it first, so this assertion alone proves nothing about the freeze |
| 2 | frozen `homework_attachments` → active year → denied | same test, first assertion — the one that costs real money |
| 3 | child row keyed by `notice_id` → moved to an active notice → denied | same test, third assertion |
| 4 | active-year row remains mutable | `the active year is still fully mutable, and the purge still finishes` |
| 5 | internal purge path still works | same test — the purge runs to `purged` under the two-sided check, including the `media_enqueue` updates |
| — | a class-keyed row with no `school_year_id` of its own | same test, second assertion (`homework_contribution_events`) |
| — | the reverse direction | `a frozen year cannot adopt a row from an active one either` |
| — | the class itself | `the class itself cannot carry a frozen year out, or be deleted` — plus a rename that must still succeed |

---

## A test of mine that was passing for the wrong reason

Sol did not find this one; it surfaced while measuring the security note below,
and it is the more embarrassing of the two.

RC4's test `the guard is on the table, so the service role is refused as well`
asserted only SQLSTATE `42501`. The harness grants `service_role` **no table
privileges at all**, so what the test actually observed was
`permission denied for table homework_notice_reactions` — the guard was never
reached. The claim the test existed to make, that a table-level guard refuses a
caller the dispatchers cannot see, was untested.

Fixed by modelling what Supabase actually does (`grant all on all tables in
schema public to service_role`) and asserting the guard's own message rather than
a SQLSTATE that a missing grant produces too. It now passes for the right reason,
and the guard does refuse service_role.

This is the third time in this feature that "the test is green" and "the
behaviour is proven" came apart. The pattern each time was an assertion loose
enough that something other than the mechanism under test could satisfy it.

---

## Security note — what the purge token is worth, measured

Sol is right that RC4's wording ("cannot be presented by anything else") was
wrong. Rather than just soften it, here is the measurement, against a
`service_role` session with the grants Supabase gives it by default:

| Attempt | Result |
|---|---|
| ordinary write during a purge | refused, `42501`, by this guard |
| `alter table … disable trigger` | refused — not the table owner |
| `set session_replication_role='replica'` | refused |
| `set_config('homework.archive_purge', <the live archive id>)` then write | **goes through** |

So the token is not caller-bound, and the archive id is not a secret. It tells
the guard "this write is the purge" without proving it. It stops what it was
built to stop — ordinary and accidental drift, a job that happens to write during
a purge window — and does not stop a caller that has read the source and means to
get past it.

Making it caller-bound was considered and rejected: the obvious check
(`current_user` = the function owner) cannot work, because the guard is itself
`security definer` and therefore always sees the owner, and the alternatives
(making the trigger `security invoker`, or reading the `role` GUC) trade a
documented limit for a fragile one that breaks differently in each deployment.
DEC-100 now carries the table above, and the test
`what the purge token is and is not` pins it so the claim cannot quietly grow
back.

---

## Mutation-verified

Every mutation applied to `12-FEAT-007-ARCHIVE-PURGE.sql`, full 48-test archive
suite re-run each time.

| # | Mutation | Failing tests |
|---|---|---:|
| M1 | the guard never refuses | 6 |
| M2 | the bypass accepts any non-empty token, from anyone | 1 |
| M3 | `purge_step` stops presenting the bypass | 19 |
| M4 | a completed purge no longer promotes the year | 1 |
| M5 | the guard also refuses the FEAT-006 worker's close-out delete | 1 |
| M6 | `archive_release` forgets `'purged'` | **0** |
| M7 | M4 and M6 together | 1 |
| **M8** | **the UPDATE guard resolves NEW only — exactly RC4** | **1** |
| **M9** | **the `classes` guard never refuses** | **1** |
| **M10** | **the purge deletes class configuration again — exactly RC4** | **1** |

M6 remains the one honest zero, for the reason RC4 recorded: `archive_release`
only writes `active` `where archive_state='archiving'`, and a completed purge has
already promoted the year to `archived_read_only`, so that branch is unreachable
while the promotion stands. M7 removes both and is caught, which is what shows
the pair is load-bearing.

---

## Verification

`node scripts/verify-feat007.mjs` — **16/16 PASS, 315 tests, 0 FAIL** (RC4: 309).

| Suite | RC4 | RC5 |
|---|---:|---:|
| FEAT-007 archive SQL | 42 | **48** |
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
| **Total** | **309** | **315** |

Typecheck PASS, production build PASS.

The three suites re-run **on migration 12** are again the ones that matter: the
guard now does a second ownership resolution on every UPDATE across sixteen
tables, plus a new trigger on `classes`, and FEAT-005/006/008 pass unchanged.

---

## Changed files, RC4 → RC5

| File | Change |
|---|---|
| `database/upgrade/12-FEAT-007-ARCHIVE-PURGE.sql` | `class_config` purge step removed; guard split into `archive_guard_year` / `archive_frozen` / `archive_guard`; OLD+NEW resolution on UPDATE; new `archive_guard_class()` trigger on `classes` |
| `tests/feat-007/database.test.mjs` | Sol's P1 and P2 tests; the class-guard and reverse-direction tests; the purge-token boundary test; the service-role test fixed to assert the guard rather than a missing grant |
| `docs/feat-007/FEAT-007_DECISIONS_UPDATE.md` | DEC-100 revised (two-sided update rule, `classes` guard, the measured token boundary); DEC-101 added |
| `docs/feat-007/RC5_FIX_REPORT.md` | new |
| docs, `START-HERE-FEAT-007.md`, `RELEASE.json`, `SHA256SUMS.txt` | updated |

No frontend runtime file changed in RC5.

---

## Still release-verification gates

Unchanged from RC4, with one addition: an UPDATE on a row keyed by `class_id`,
`notice_id`, `attachment_id` or `correction_id` now costs **two** ownership
lookups instead of one, on every row, on sixteen tables — including in years that
are perfectly active, where both resolve to a year that is not frozen. The
harness cannot see the difference at its row counts. Measure it on a real class's
daily write volume before the migration goes to production.
