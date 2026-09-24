# FEAT-007 RC1 → RC2 — fix report

**Sol RC1 result:** `REQUEST_CHANGES` — two P1s.
**RC2 scope:** those two, plus two production crashes the owner hit while RC1 was
in review (§3). No other business rule was touched.

Both findings were correct. Both were reproduced on the harness before anything
was changed.

---

## P1 — a verified archive could go stale and then purge newer data

### Reproduced first

```
archive: verified
row changed after verification: "Tiêu đề đã sửa sau khi đóng gói"
counts unchanged: 1 notice(s)
purge accepted the stale archive: true purged
notices left: 0
```

An `update` keeps the row count identical, so the count comparison RC1 relied on
saw nothing. The edited title existed only in the cloud, and the purge deleted it
while the ZIP held the old one.

### What RC1 got wrong

RC1 treated "the counts at `begin` match the counts at `complete`" as if it meant
"the archive is a copy of the year". It does not. It says nothing about updates,
and nothing at all about the window between verification and purge — which has no
upper bound.

### The rule in RC2

**A year cannot change between being archived and being purged, and if it changed
anyway the purge is refused.** Two mechanisms, because either alone leaves a hole:

**1. A write freeze that starts with the run.** `begin` sets
`school_years.archive_state='archiving'`, which withholds writes exactly as
`archived_read_only` does. It starts at `begin`, not after verification, because
an archive taken from a year that is still being written to is out of date before
it finishes.

Consequences, all deliberate:

- **The active school year can no longer be archived.** Freezing the year that is
  still being taught would break the school day. The end-of-year sequence is to
  switch the active year first, which is what an Admin does anyway.
- A failed or abandoned run **releases** the freeze, so a year is never stranded.
  A new `abandon` action ends a run whose tab was closed.
- The freeze is *not* released while a verified, unpurged archive still needs it.
- `set_read_only` (RB-711) is unchanged and still the explicit Admin step; it is
  now idempotent and promotes the temporary freeze to the permanent state.

**2. A dataset fingerprint, checked at the gate.** The freeze covers the
application; it does not cover the SQL editor, a service-role job, or a future
code path. So `complete` records
`homework_private.archive_fingerprint(year)` — SHA-256 over the per-row MD5s of
every row the archive represents, combined in a fixed order — and `purge_begin`
recomputes it and refuses if it differs, in the same statement that flips the
archive to `purging`.

Counts remain as a second, cheaper line of defence during the run.

After the fix, the reproduction above ends with the purge refused and every row
still in place.

### Sol's four required tests, plus four more

| Test | Sol requirement |
|---|---|
| an update that changes no row count still blocks the purge | 1 |
| data added after verification blocks the purge, and re-archiving clears it | 2 |
| the older of two verified archives cannot purge data only the newer one holds | 3 |
| the year is frozen for the whole run and stays frozen until it is purged | 4 |
| the year still being taught cannot be archived at all | the new lifecycle |
| a failed run releases the freeze instead of stranding the year | the new lifecycle |
| a failed second run does not lift the freeze a verified archive is holding | the new lifecycle |
| releasing the freeze by hand closes the purge gate | the residual path |

---

## P2 — the download confirmation did not verify the images

### Reproduced first

```
media member present: false
opened.verified   = true
checks that failed = 0
```

A saved ZIP with an image deleted still reported itself verified, and that
verdict is what `confirm_download` posts to unlock purge. After the purge, that
image would not exist anywhere.

### What RC1 got wrong

The reader verified text members on open and left images to be checked when
someone clicked them. That is a sensible rule for *display* and the wrong rule
for a *verdict*. Worse, RC1's own test wrote the defect down as if it were the
design: *"the archive looks fine until the picture itself is asked for."*

### The rule in RC2

`openArchive` verifies **every member listed in `checksums.txt`**, images
included, before returning. Images are inflated one at a time and released, so
peak memory stays at roughly one picture — Sol's own suggested shape. Display
stays lazy; the verdict does not.

The Viewer reports progress while it hashes (`Đang kiểm tra ảnh trong gói… n/N`),
says how many images it checked, and only emits a verified result when every
member passed. `AdminArchive` still refuses to call `confirmDownload` on anything
else.

| Test | Sol requirement |
|---|---|
| a saved file missing an image never reaches `confirm_download` | 1 |
| a saved file with a swapped image never reaches `confirm_download` | 2 |
| an intact saved file does confirm, and only then | 3 |
| images are inflated one at a time, never all at once (peak concurrency 1) | 4 |
| every member listed in `checksums.txt` gets a verdict | coverage |
| verification reports progress | usability of a long run |

The RC1 test that asserted the unsafe behaviour has been rewritten: it now
asserts `verified === false` up front *and* that display still refuses.

---

## 3. Two production crashes fixed in the same package

While RC1 was in review the owner hit `Cannot access 'o' before initialization`
in the deployed build. Reproduced and fixed:

```
ERROR: Cannot access 'touched' before initialization
```

`AdminUserDialog.vue` had `watch(..., {immediate:true})` whose callback's first
statement was `touched.value=false`, with `const touched=ref(false)` thirteen
lines below. An immediate watcher runs during `setup()`, so the binding was still
in its temporal dead zone and the dialog died on open.

Neither `vue-tsc` nor the production build catches this — TypeScript does not
track TDZ across a callback boundary — so a static check was added
(`tests/immediate-watcher-tdz.test.mjs`) that scans every SFC for an immediate
`watch`/`watchEffect` reading a `const`/`let` declared below it.

**It immediately found a second one**: `StudentAccountDialog.vue`, same shape,
same crash. Both are fixed, both dialogs now have a mounting regression test, and
the scanner has a test of its own so a check that never fires cannot pass for a
check that works.

---

## 4. Verification

`node scripts/verify-feat007.mjs` — **16/16 PASS, 292 tests, 0 FAIL** (RC1: 276).

| Suite | RC1 | RC2 |
|---|---:|---:|
| FEAT-007 archive SQL | 21 | **30** |
| FEAT-007 archive/viewer frontend | 23 | **33** |
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
| Static frontend regression | 8 | **10** |
| Existing FEAT-001–005 frontend | 64 | 64 |
| **Total** | **276** | **292** |

Typecheck PASS, production build PASS.

### Mutation-verified

| Mutation | Failing tests |
|---|---|
| drop the dataset-fingerprint check | 3 |
| record a constant fingerprint | 12 |
| allow purging an unfrozen year | 1 |
| never freeze the year for the run | 14 |
| allow archiving the active year | 1 |
| the freeze state does not withhold writes | 2 |
| release the freeze with a verified archive waiting | 1 |
| media check always passes | 1 |
| a missing image is skipped instead of failed | 1 |
| skip media verification entirely | 5 |
| confirm even when verification failed | 2 |
| *(control: a no-op edit)* | 0, as expected |

Two mutations initially left the suite green — "allow archiving the active year"
and "release the freeze with a verified archive waiting" — because no test
covered either. Both now have one.

## 5. Changed files, RC1 → RC2

| File | Change |
|---|---|
| `database/upgrade/12-FEAT-007-ARCHIVE-PURGE.sql` | `archiving` state; `archive_fingerprint()`; `archive_release()`; `begin` refuses the active year and freezes; `complete` records the fingerprint and releases on failure; `purge_begin` requires the freeze and re-checks the fingerprint; new `abandon` action |
| `src/features/archive/reader.ts` | every member verified on open, images one at a time; `onProgress`; `inflateMember` test seam |
| `src/components/admin/ArchiveViewer.vue` | verification progress; the message names how many images were checked |
| `src/components/admin/AdminUserDialog.vue`, `StudentAccountDialog.vue` | TDZ crash fixed |
| `tests/immediate-watcher-tdz.test.mjs` | new static check (+ a test of the check) |
| `tests/feat-007/*` | the RC1 P1/P2 regression tests, dialog mount tests, lifecycle updates |
| docs, `RELEASE.json`, `SHA256SUMS.txt` | updated |

## 6. Still release-verification gates

Unchanged from RC1, plus one specific to this fix: the freeze and the fingerprint
have only been exercised on the local harness. On a real deployment, confirm that
switching the active school year before archiving is workable for the operator,
and that the fingerprint's full-table scan is acceptable on a year with tens of
thousands of rows — it runs twice per archive (once at `complete`, once at
`purge_begin`), not per step.
