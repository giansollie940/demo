# FEAT-007 — School Year Archive & Purge — IMPLEMENTATION REPORT

**Package:** `SO-TU-HOC-FEAT-007-RC6`
**Status:** `APPROVED` at the Sol implementation-review gate — not deployed, no
migration run anywhere. The release decision is the Product Owner's.
**RC1 → RC2:** two Sol P1s fixed — a verified archive could go stale and purge
newer data, and the download confirmation did not verify the images. Both were
reproduced before the change; see `RC2_FIX_REPORT.md`. Two production crashes are
fixed in the same package, at a severity RC2 overstated and RC3 corrects.
**RC2 → RC3:** one Sol P1 fixed — the dataset was fingerprinted at `complete`, so
a count-preserving change made *during* the build was absorbed into the recorded
value instead of caught. Reproduced before the change; see `RC3_FIX_REPORT.md`.
**RC3 → RC4:** one Sol P1 fixed — the read-only freeze lived only in the two
public dispatchers, so a direct SQL or service-role write landing between two
`purge_step` calls was deleted by a later step without ever being in the verified
archive. The freeze now lives on the tables. Reproduced before the change; see
`RC4_FIX_REPORT.md`.
**RC4 → RC5:** two Sol blockers fixed — the purge deleted class configuration the
archive never carried, and the table guard resolved an UPDATE's year from `NEW`
only, so a frozen row could be re-parented out of the year and escape the purge
(for an image, out of the R2 sweep too). Both reproduced before the change; see
`RC5_FIX_REPORT.md`.
**RC5 → RC6:** one Sol blocker fixed — the guard resolved a row's year from the
first ownership column it found, so a row with an active class and a frozen
notice (`homework_reports`, `homework_corrections`) passed the freeze and was
then deleted by the purge, and a NULL-valued high-priority key hid the real owner
underneath it. The guard now resolves *every* owner on both sides. Reproduced
before the change; see `RC6_FIX_REPORT.md`.
**Baseline:** `SO-TU-HOC-FEAT-008-RC3.1` (Sol: APPROVED at RC3), verified green
before the first change: 13/13 checks PASS.

---

## 1. The decision that shapes everything else

**The ZIP is built in the Admin's browser and never exists on the server.**

The alternative was an Edge Function streaming the archive back. It was rejected
because a school year's images can run to hundreds of megabytes and Supabase
Edge Functions have hard CPU, memory and wall-clock limits — a timeout halfway
through is precisely the incomplete archive RB-706 says must never be treated as
good. Building client-side also makes DEC-064 true by construction (no second
copy on R2) and matches the Viewer, which reads the same file locally.

That choice creates the central problem of this feature, and the rest of the
design is the answer to it:

> If the server never sees the ZIP, how can it know the archive is complete
> before it opens the purge gate?

It cannot check the file. It can check the *claims* against its own records, and
that is exactly what migration 12 does:

| Claim | How the server checks it without the file |
|---|---|
| "every image is in the archive" | `homework_archive_media` snapshots the inventory at `begin`. `complete` fails unless every row was reported. |
| "the images are intact" | The server stores `expected_checksum` from FEAT-006 and **never sends it to the client**. The browser hashes the bytes it downloaded and reports the result; the server compares. A client that skipped a file cannot guess the value. |
| "nothing changed while packing" | The dataset is hashed at `begin`, before the browser reads a row; `complete` refuses unless the hash is unchanged, and `purge_begin` checks it once more. Counts are a cheaper first line. See DEC-097. |
| "nothing slipped in while purging" | The fingerprint cannot cover that interval — purge is *meant* to change the dataset. Instead the year's tables refuse every write that is not the purge itself, whatever the caller, on both sides of an update and through every ownership reference on the row. See DEC-100. |
| "nothing the archive lacks is destroyed" | The purge deletes only entities the archive carries. `homework_settings` and `homework_backlog_state` are class-scoped, are not exported, and are therefore not purged. See DEC-101. |
| "the Admin actually has the file" | The Admin re-opens the saved ZIP in the Viewer, which recomputes the fingerprint (SHA-256 of `checksums.txt`) and posts it. It must equal what was recorded. |

The last row is the one worth dwelling on. The spec's wording (RB-708 item 3) is
"Admin đã tải ZIP xuống", which a checkbox would satisfy. A checkbox is a promise
about the past; EC-703 is precisely the case where that promise is false. Making
the Admin re-open the file turns the gate into evidence: the file exists, it is
readable, and it is *this* archive.

**What the server still cannot prove**, stated plainly: it never sees the bytes,
so it trusts the browser's arithmetic. A modified client could report values it
computed from something else. That is not a meaningful escalation — the actor
who would do it is the Admin, who can already purge — but it is the honest
boundary of the check, and `checksums.txt` is written in `sha256sum` format so an
Admin can verify the archive with a command-line tool instead of trusting this
application to grade its own work.

---

## 2. What was built

| Layer | File |
|---|---|
| Migration | `database/upgrade/12-FEAT-007-ARCHIVE-PURGE.sql` |
| Edge Function | `supabase/functions/archive-media/index.ts` |
| Format rules | `src/features/archive/format.ts` |
| ZIP writer | `src/features/archive/zip-sink.ts` |
| Archive run | `src/features/archive/builder.ts` |
| Viewer reader | `src/features/archive/reader.ts` |
| Client | `src/features/archive/api.ts` |
| Admin UI | `src/components/admin/AdminArchive.vue`, `ArchiveViewer.vue`, tab `?tab=archive` |
| Tests | `tests/feat-007/` (SQL + frontend), `FEAT007_UPGRADE` re-runs |
| Harness | `scripts/verify-feat007.mjs` |
| Dependency | `fflate` 0.8.3 (~8 KB, no transitive deps) |

No FEAT-001→008 source file was rewritten. The two dispatchers are renamed and
re-exported behind the read-only guard exactly as FEAT-008 did; a test asserts
their bodies are still byte-identical to migration 11, and that the FEAT-006 body
two wrappers down is still the FEAT-006 body.

### Why a new Edge Function instead of reusing FEAT-006 `read`

`homework_media('read')` authorises image by image against the notice it hangs
off, and deliberately refuses Admin for correction-round images — those are
private between author and teacher. An archive that quietly skipped them would be
incomplete, which RB-706 forbids. `archive-media` therefore reads the year's
inventory through the Admin-only `media_manifest` and signs those keys. R2
credentials stay in the function; the browser gets URLs that expire in five
minutes and are never written into the archive.

---

## 3. Purge: what is removed, what is kept, and why

Purge runs as thirteen checkpointed steps (`homework_archive_steps`). Every step
is scoped by the school year and is idempotent, so an interrupted run resumes
rather than restarting or being reported as finished (RB-713/EC-705/AC-722).

| Removed | Scope |
|---|---|
| reactions, reminders, duplicate reviews, reports, corrections (+ rounds) | via the year's notices |
| moderation events, notifications, contribution events | via the year's classes |
| notices (cascading notice media, media history, receipts) | `school_year_id` |
| English groups and memberships | `school_year_id` |
| class subjects | via the year's classes |
| R2 objects | queued through the FEAT-006 outbox |

| Kept | Why |
|---|---|
| `profiles`, `classes` | people and classes carry across years; RB-714 does not list them, and deleting a class would orphan the profiles that reference it |
| `homework_settings`, `homework_backlog_state` | class-scoped, not year-scoped, and the archive does not carry them — so the purge does not delete them either (DEC-101, added in RC5) |
| `grade_subject_catalog`, `homework_catalog_events` | shared across years (RB-714/EC-706) |
| `homework_archives` and its inventory | the light index, which is the point of RB-710 |
| **FEAT-002 tombstones** | see DEC-091 below |

### DEC-091 — tombstones survive, and so do the rows they point at

FEAT-002 installs `homework_tombstone_immutable`, a statement-level trigger that
refuses every `update`, `delete` and `truncate` on `homework_tombstones`. The
purge hit it on the first end-to-end run.

Dropping that trigger would be changing a FEAT-002 business rule, which this
spec says must be returned as `BLOCKED` rather than implemented. It is also the
wrong call on the merits: the tombstone is the permanent record that a specific
notice was hard-deleted and redacted, it contains no content, and "Must Not
Break" lists FEAT-002 hard-delete/tombstone explicitly.

So FEAT-007 keeps tombstones — and therefore keeps the `class_subjects` and
`english_groups` rows a surviving tombstone still references, rather than
leaving a permanent record pointing at nothing. In the tested scenario that is
one subject row out of the year's config. A test asserts no surviving tombstone
is left dangling.

This is a deliberate narrowing of RB-714's "class-specific subject/config data",
forced by a hard constraint from an earlier feature, and it is recorded here
rather than buried so the reviewer can overrule it if the intent was different.

### Media deletion is queued last, and only through FEAT-006

FEAT-007 adds no deletion path of its own. The final step enqueues the year's
attachments through `homework_private.media_enqueue`, so the objects leave R2
only when the FEAT-006 worker confirms each delete — the same "queued is not
deleted" rule FEAT-008 RC3 settled. It runs *last* on purpose: the worker drops
an attachment row only once nothing references it, so queuing before the notices
are gone would make the first worker pass defer every job.

---

## 4. Verification

`node scripts/verify-feat007.mjs` — **16/16 PASS, 321 tests, 0 FAIL.**

| Suite | Result |
|---|---:|
| FEAT-007 archive SQL | 54 PASS |
| FEAT-007 archive/viewer frontend | 33 PASS |
| FEAT-008 storage SQL | 20 PASS |
| **FEAT-008 SQL re-run on migration 12** | **20 PASS** |
| FEAT-008 dashboard UI | 9 PASS |
| FEAT-006 SQL | 13 PASS |
| **FEAT-006 SQL re-run on migration 12** | **13 PASS** |
| **FEAT-005 SQL re-run on migration 12** | **13 PASS** |
| FEAT-006 frontend | 10 PASS |
| FEAT-005 under migration 10 | 13 PASS |
| FEAT-001/002 legacy SQL | 43 PASS |
| FEAT-004 SQL | 6 PASS |
| Static frontend regression | 10 PASS |
| Existing FEAT-001–005 frontend | 64 PASS |
| **Total** | **321 PASS / 0 FAIL** |
| Typecheck | PASS |
| Production build | PASS |

Evidence: `docs/feat-007/evidence/*.log` and `verification-results.json`.

### AC-726 in its strongest form

`FEAT007_UPGRADE=1` re-runs the FEAT-005, FEAT-006 and FEAT-008 corpora **with
migration 12 installed**. All pass unchanged. The claim worth making is that
*installing FEAT-007 changes no behaviour until an Admin archives a year* — both
layers of the guard are inert while `archive_state='active'`: the dispatcher
check passes through, and `archive_frozen()` returns false for every year that is
not packed away. That matters more since RC4 than it did in RC3, because sixteen
tables the other features write to every day now carry a row-level trigger, and
`classes` carries a narrow one.

### AC coverage

| AC | Where |
|---|---|
| AC-701 | `archive-database` test 1 (counts, media bytes, blockers) |
| AC-702 | test 2 — four non-admin roles × eleven actions, plus the export surface and an anonymous call |
| AC-703, AC-704, AC-729 | SQL test 3 and frontend tests 1–2 |
| AC-705, AC-706 | SQL tests 4–5, frontend test 10 |
| AC-707, AC-708 | SQL test 9, frontend test 2 |
| AC-709 | frontend test 1 |
| AC-710, AC-711 | SQL test 11 |
| AC-712, AC-713 | SQL test 12, frontend test 6 |
| AC-714, AC-715 | frontend tests 4, 13 |
| AC-716, AC-717 | frontend tests 4, 12 |
| AC-718 | frontend test 13 |
| AC-719 | frontend tests 8, 16 |
| AC-720 | frontend tests 5, 6, 15 |
| AC-721 | SQL test 13 |
| AC-722 | SQL test 14 |
| AC-723 | SQL test 10 |
| AC-724, AC-725 | no code path exists; §6 |
| AC-726 | `storage-database-on-12`, `media-database-on-12`, `database-on-12` |
| AC-727, AC-728 | frontend test 4 |
| AC-730 | frontend test 12 (progress phases), SQL test 14 (step state) |
| EC-701…EC-714 | tests 4, 5, 7, 14, 15, 16, plus SQL tests 1, 11, 16, 19 |

### The guards were mutation-tested, not just exercised

Each of these was introduced into the source, the suite re-run, and the source
restored. A guard whose removal leaves the suite green is not a tested guard.

| Mutation | Result |
|---|---|
| drop the re-open-the-file gate | 1 fail |
| allow purging the active year | 1 fail |
| allow purging an unverified archive | 1 fail |
| `confirm_download` accepts a failed archive | 1 fail |
| accept an archive with unreported media | 1 fail |
| accept a mismatched media checksum | 1 fail |
| ignore the year changing mid-run | 1 fail |
| record an empty media inventory | 4 fail |
| leak `expected_checksum` to the client | 1 fail |
| start a run on a year with blockers | 1 fail |
| allow a blank format version | 1 fail |
| allow a purge with no reason | 1 fail |
| allow a purge without the irreversible acknowledgement | 1 fail |
| drop the Admin check on `homework_archive` | 3 fail |
| purge notices from every year | 1 fail |
| purge reactions from every year | 1 fail |
| purge subjects a surviving tombstone points at | 1 fail |
| purge stops queuing the year's images | 1 fail |
| drop the read-only year guard | 1 fail |
| read-only guard allows every action | 1 fail |
| the table-level freeze never refuses | 10 fail |
| the purge bypass accepts any token, from anyone | 1 fail |
| `purge_step` stops presenting the bypass | 20 fail |
| a completed purge no longer promotes the year | 1 fail |
| the freeze also blocks the FEAT-006 worker's close-out | 1 fail |
| `archive_release` forgets `'purged'`, with the promotion also removed | 1 fail |
| the UPDATE guard resolves NEW only (RC5) | 1 fail |
| the `classes` guard never refuses (RC5) | 1 fail |
| the purge deletes class configuration again (RC5) | 1 fail |
| the ownership resolver takes the first key only, as in RC5 (RC6) | 4 fail |
| a present-but-NULL key still masks the owner below it (RC6) | 1 fail |
| archive path check allows `..` | 1 fail |
| reader accepts any major format version | 1 fail |
| viewer skips the image checksum | 1 fail |
| viewer always reports verified | 1 fail |
| purge button ignores the download confirmation | 1 fail |
| builder tolerates a missing image | 1 fail |
| builder reports a constant instead of the hash | 2 fail |

**Three of these caught tests that were passing for the wrong reason**, and all
three are worth naming:

1. *"allow purging an unverified archive"* stayed green because the download gate
   caught the case next. Two guards, only one of them actually tested. The test
   now asserts **which** guard refused, by matching the message.
2. *"purge notices from every year"* stayed green because the neighbouring school
   year in the fixture was empty — an assertion that "the other year survives"
   proves nothing when the other year has nothing in it. The fixture now writes
   real rows into the second year (notice, reaction, audit event, subject,
   English group and membership, class settings, an attachment) and the test
   asserts each one individually.
3. *"archive path check allows `..`"* stayed green because every case in the test
   had a slash in it, and the structural rule caught those on its own. The
   dangerous inputs are the bare ones — `..`, `.`, `media/..` — which the
   character-class check happily accepts. Those are now in the list.

---

## 5. Not verified here — release gates

These need a live environment and must not be represented as done:

- a real archive run against Cloudflare R2: signed-URL expiry over a long run,
  throughput, and the `archive-media` pagination path past 50 objects;
- Deno runtime/type compatibility of `supabase/functions/archive-media`;
- File System Access API behaviour in the Admin's actual browser, and the Blob
  fallback on a browser without it — including what a multi-hundred-megabyte
  archive does to a tab on the fallback path;
- the FEAT-006 cleanup worker actually removing the purged year's objects from
  R2, and storage health dropping afterwards;
- purging a year with tens of thousands of rows: step duration and whether any
  step needs splitting further;
- the read-only guard against the live frontend, i.e. that every screen degrades
  to a readable state rather than showing errors.

---

## 6. Out of scope, by decision not by omission

- **AC-725 / DEC-067:** no restore-to-server path exists. Old data is read in the
  Viewer.
- **AC-724 / DEC-064:** the archive is never uploaded back to R2.
- Encrypted ZIP is not required in V1 (RB-719); the UI warns about
  confidentiality instead.
- Teacher/Student access to the Viewer: Admin-only.
