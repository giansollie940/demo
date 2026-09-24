# DECISIONS UPDATE — FEAT-007 (implementation)

DEC-062 … DEC-070 are unchanged and remain ACTIVE. The decisions below are the
ones the implementation had to settle, and one of them narrows the spec.

---

## DEC-091 — FEAT-002 tombstones survive purge, and so do the rows they reference
**STATUS:** ACTIVE (narrows RB-714)

FEAT-002 installs a statement-level trigger, `homework_tombstone_immutable`, that
refuses every `update`, `delete` and `truncate` on `homework_tombstones`. There is
no privileged path around it, by design: the tombstone is the permanent record
that a specific notice was hard-deleted and redacted.

Dropping or weakening that trigger would change a FEAT-002 business rule, which
the FEAT-007 spec says must be returned as `BLOCKED` rather than implemented, and
"Must Not Break" names FEAT-002 hard-delete/tombstone explicitly. A tombstone also
carries no content — ids, timestamps, actor and reason — so keeping it is
consistent with "chỉ giữ archive index nhẹ".

Therefore:

1. purge does not delete tombstones;
2. purge does not delete the `class_subjects` or `english_groups` rows a
   surviving tombstone still points at, because a permanent record must not be
   left referencing a deleted row;
3. tombstones are exported to the archive exactly as FEAT-002 wrote them, so
   EC-713's redaction is preserved rather than reconstructed.

This narrows RB-714's "class-specific subject/config data" by however many
subject or group rows the year's tombstones reference. It is recorded rather
than silently implemented so the reviewer can overrule it if the intent differs.

---

## DEC-092 — The archive is built in the browser; the server grades the claims
**STATUS:** ACTIVE (implements DEC-063/DEC-064/DEC-066)

The ZIP is produced client-side and never exists on the server. An Edge Function
streaming it was rejected: a year's images can exceed the function's CPU, memory
and wall-clock limits, and a timeout halfway through is exactly the incomplete
archive RB-706 forbids treating as good.

Because the server never sees the file, it verifies claims instead:

- `homework_archive_media` snapshots the required inventory at `begin`;
- `expected_checksum` is stored server-side and **never sent to the client**; the
  browser hashes the bytes it downloaded and reports the result, and the server
  compares;
- entity counts are re-taken at `complete`, so a year that changed mid-run fails;
- the run ends as `verified` or `failed`; there is no action that marks an
  archive verified by hand.

Stated limit: the server trusts the browser's arithmetic. `checksums.txt` is
written in `sha256sum` format so an Admin can verify the archive independently.

---

## DEC-093 — "Đã tải xuống" is proven by re-opening the file, not by a checkbox
**STATUS:** ACTIVE (implements RB-708 item 3)

The Admin re-opens the saved ZIP in the Archive Viewer. The Viewer verifies it
locally and posts its fingerprint — SHA-256 of `checksums.txt`, which changes if
anything in the archive changes — and the server matches it against the recorded
value before opening the purge gate.

A checkbox is a promise about the past, and EC-703 (an interrupted download) is
exactly the case where that promise is false while the box is ticked. Re-opening
the file proves the file exists, is readable, and is this archive.

---

## DEC-094 — Archive media is signed by its own Edge Function
**STATUS:** ACTIVE

FEAT-006 `homework_media('read')` authorises image by image against the notice it
belongs to, and deliberately refuses Admin for correction-round images. An
archive that skipped those would be incomplete, so FEAT-007 adds `archive-media`,
which serves the Admin-only year inventory and signs those object keys. FEAT-006's
authorisation is not widened.

---

## DEC-095 — Purge queues images last, through the FEAT-006 outbox
**STATUS:** ACTIVE (consistent with DEC-089)

FEAT-007 adds no deletion path of its own. The final purge step enqueues the
year's attachments through `homework_private.media_enqueue`, so objects leave R2
only when the worker confirms each delete. It runs last because the worker drops
an attachment row only once nothing references it: queuing before the notices are
gone would make the first worker pass defer every job.

Queued is not deleted here either — storage figures drop after the worker runs,
not when purge finishes.

---

## DEC-096 — A year is frozen for the archive run, and stays frozen until it is purged
**STATUS:** ACTIVE (added in RC2; answers Sol RC1 P1)

An archive authorises an irreversible purge, so the dataset it represents must be
the dataset that gets deleted. RC1 compared record counts at the start and end of
the run and nothing afterwards, which misses every update and the entire window
between verification and purge.

1. `begin` sets `school_years.archive_state='archiving'`, a run-scoped write
   freeze that withholds writes exactly as `archived_read_only` does.
2. **The active school year can no longer be archived.** Freezing the year that
   is still being taught would break the school day, so the operator switches the
   active year first — the real end-of-year sequence.
3. A failed or abandoned run releases the freeze; a new `abandon` action ends a
   run whose tab was closed. The freeze is not released while a verified,
   unpurged archive still needs it.
4. `set_read_only` (RB-711) is unchanged, idempotent, and promotes the temporary
   freeze to the permanent state.

## DEC-097 — The dataset is fingerprinted at three points, not one
**STATUS:** ACTIVE (revised in RC3 after Sol's RC2 review)

`homework_private.archive_fingerprint(year)` is SHA-256 over the per-row MD5s of
every row the archive represents, combined in a fixed order. It is taken and
checked three times:

```
begin      →  begin_fingerprint = fingerprint(year)      (before the browser reads anything)
             …browser exports rows and downloads media…
complete   →  refuse unless fingerprint(year) == begin_fingerprint
              dataset_fingerprint = begin_fingerprint
             …archive verified, year frozen…
purge_begin→  refuse unless fingerprint(year) == dataset_fingerprint
```

**Why three and not two.** RC2 hashed only at `complete`, which protects
`complete → purge_begin` but not `begin → complete`. A count-preserving update
made after the browser had exported a row but before `complete` was *absorbed
into the recorded value* rather than caught: the archive verified against a
dataset the ZIP never contained, and the purge then deleted it. Taking the hash
before the browser reads anything is what makes "the archive represents the
dataset it was built from" a checked fact instead of an assumption.

**What the fingerprint covers.** The year-owned dataset that purge deletes and
the archive carries. Shared reference rows — `grade_subject_catalog` — are
exported into `subjects.json` so the archive reads sensibly on its own, but they
are never purged and are deliberately outside the fingerprint; a change to the
catalog must not fail an unrelated year's archive.

**Which interval each mechanism owns.** The fingerprint owns
`begin → complete → purge_begin`. From `purge_begin` to `purged` the dataset is
*expected* to change as the steps run, so the fingerprint cannot be re-checked
there; that interval is held by the table-level freeze in DEC-100. Counts remain
a cheaper first line during the run.

A failure at either checkpoint marks the run `failed` and releases the freeze,
unless another building or verified archive of that year still needs it.

A refusal writes no audit row: raising rolls back its own insert. The refusal
reaches the Admin as the error, the archive keeps its previous status, and
nothing was touched.

## DEC-100 — The freeze is enforced by the tables, on both sides and every owner
**STATUS:** RATIFIED by Sol at RC6 (added in RC4; revised in RC5 and RC6)

DEC-096's freeze and DEC-097's fingerprint both protect the run *up to*
`purge_begin`. They cannot protect what happens after it: purge is thirteen
separate calls, each committing on its own, and the read-only guard lived only in
`public.homework_api` and `public.homework_media`. A direct SQL or service-role
write landing between two steps inserted a row that a later step deleted — a row
that was never in the verified archive, gone with no trace.

So the guard lives on the tables. While a year is `archiving` or
`archived_read_only`, `homework_private.archive_guard()` refuses every insert,
update and delete on the year's data, whatever the caller.

**Both sides of an update, and every owner on each side.** This took two
corrections.

RC4 resolved the row's year from `NEW` alone, which left one hole: a frozen row
could be *re-parented* into an active year and walk out of the purge set. For an
image that is worse than a stray row — moved out, it is never offered to the
year-end sweep, so its bytes stay in R2 for ever and the year's storage is never
reclaimed.

RC5 fixed that but still collapsed each side to a **single** owner, chosen by a
priority list. Two things went wrong with that. `homework_reports` and
`homework_corrections` carry both `class_id` and `notice_id`, and the archive,
the fingerprint and the purge all scope them by `notice_id` — so a row with an
active class and a frozen notice was attributed to the active class, allowed in,
and deleted by the purge a few steps later, having never been in the ZIP. And
`jsonb ? 'key'` is true for a key whose value is NULL, so the nullable
`homework_correction_rounds.attachment_id` resolved to NULL and hid the
`correction_id` beneath it, leaving such rows attributed to no year at all.

The rule is now:

```
INSERT → every year the NEW row can be placed in
DELETE → every year the OLD row can be placed in
UPDATE → both sets, and refuse if ANY of them is frozen
```

`homework_private.archive_guard_years(jsonb)` returns the set, resolving
`school_year_id`, `class_id`, `notice_id`, `candidate_id`, `duplicate_of`,
`attachment_id`, `english_group_id`, `correction_id` and `report_id`. It uses no
key-presence test at all, so an absent or NULL column contributes nothing rather
than masking the ones below it — there is no priority left to get wrong.
`subject_id` is deliberately absent: `homework_notices` has a composite foreign
key on `(subject_id, class_id)`, so a notice's subject is always in the notice's
own class, which `class_id` already resolves.

A frozen row cannot leave its year, a frozen year cannot adopt one, and a row
cannot reach into a frozen year through its second reference. The test
`every purge step scopes by a column the resolver actually resolves` compares the
set of guarded tables against the purge steps' own scoping, so a step added or
re-scoped later cannot quietly outrun the resolver.

Two narrow, audited exceptions:

1. **the purge itself.** `purge_step` sets a transaction-local
   `homework.archive_purge` naming its archive; the guard accepts it only if that
   archive belongs to this year and is actually `purging`, and it does not
   outlive the transaction that set it. **This is routing, not a security
   boundary** — see the measurement below.
2. **the end of the FEAT-006 media lifecycle.** The worker deletes an attachment
   row once R2 confirms the object is gone. That row is already `deleting` and
   cannot introduce anything the archive lacks — and refusing it would leave
   attachment rows, and the bytes storage health counts, for ever.

**`classes` gets a narrow guard of its own.** A class is what attributes half the
guarded tables to a year, so moving one out of a frozen year takes its subjects
with it, and deleting one destroys rows the archive represents.
`homework_private.archive_guard_class()` refuses exactly those two operations —
changing `school_year_id`, and `DELETE` — while the year is frozen. Renaming or
deactivating a class of a packed-away year is ordinary Admin work and still
works.

Three tables are deliberately **not** guarded:

- `profiles` — purge never deletes a profile, so a late write cannot be
  destroyed, and freezing them would stop an Admin renaming a student who also
  studies in the current year;
- `homework_settings` and `homework_backlog_state` — the FEAT-001/002 dispatcher
  creates these lazily on *every* call, `load` and `inbox` included. Guarding
  them would make an archived year unreadable, which is the one thing RB-711
  requires it to stay. Since RC5 the purge does not delete them either
  (DEC-101), so there is nothing here a late write could destroy.

A purged year is promoted to `archived_read_only` when the last step finishes,
and `homework_private.archive_release` refuses to unfreeze a year that has a
purged archive, so a later abandoned run cannot hand it back as writable.

**What the purge token is worth, measured.** RC4's wording said the token
"cannot be presented by anything else". That was wrong, and Sol was right to
challenge it. Measured against a `service_role` session with the table grants
Supabase gives it by default:

| Attempt | Result |
|---|---|
| ordinary write during a purge | refused, `42501`, by this guard |
| `alter table … disable trigger` | refused — not the table owner |
| `set session_replication_role='replica'` | refused |
| `set_config('homework.archive_purge', <the live archive id>)` then write | **goes through** |

The archive id is not a secret, so the token tells the guard "this write is the
purge" without proving it. It stops what it was built to stop — ordinary and
accidental drift, a job that happens to write during a purge window — and does
not stop a caller that has read the source and means to get past it. A caller
with that intent and that much access is outside what a trigger can decide, and
the content fingerprint is what speaks to it (DEC-097). The test
`what the purge token is and is not` records this so the claim cannot quietly
grow back.

## DEC-101 — The purge does not delete what the archive does not carry
**STATUS:** RATIFIED by Sol at RC6 (added in RC5, after the RC4 review)

RC4's purge deleted `homework_settings` and `homework_backlog_state`. Neither is
exported to the ZIP, counted, fingerprinted or frozen — so a class's tuned
`seed_threshold` / `pending_threshold` / `reject_threshold` were destroyed with no
copy anywhere. RC4's own report called this a known gap and shipped it; Sol
correctly refused that, because "archive the year, then delete it" is the whole
safety model and deleting what was never archived breaks it.

**The rule: the purge may only delete what the archive carries.** Anything else
stays. So the `class_config` step is gone, and both tables survive the purge.

This is Sol's Option A rather than Option B (archive them properly), for three
reasons: both tables are keyed by `class_id`, not by year, and classes are never
purged, so keeping them is consistent rather than an exception; they are a handful
of small rows, so nothing is reclaimed by deleting them; and widening the archive
format at RC5 would mean a new `ENTITY_FILES` entry, a format version bump, Viewer
work and a fingerprint change, all in the release whose subject is the freeze.

If a later release does want them purged, Option B is the path, and it has to be
all of it — export, counts, fingerprint, freeze, Viewer, checksums — not an
exception inside the purge.

## DEC-098 — The verdict that unlocks purge covers the images
**STATUS:** ACTIVE (added in RC2; answers Sol RC1 P1 #2)

`openArchive` verifies every member listed in `checksums.txt`, images included,
before returning a verdict. Images are inflated one at a time and released, so
peak memory stays at about one picture.

Lazy display is still lazy — an image is also re-checked when it is shown — but
`confirm_download` may only ever be sent a verdict that covered the whole file.
RC1 verified text only, which meant a saved ZIP missing an image still reported
itself verified, and that is what opened the purge gate.

## DEC-099 — An immediate watcher may not read a binding declared below it
**STATUS:** ACTIVE (added in RC2; a codebase rule, not a FEAT-007 rule)

`watch(..., {immediate:true})` and `watchEffect` run during `setup()`. Reading a
`const` or `let` declared further down the same script throws
"Cannot access X before initialization".

**Observed impact, measured rather than assumed.** Vue catches the error inside
the watcher's own invocation and, in a production build, only logs it — `setup()`
then continues and the component mounts normally. Comparing the broken and fixed
versions of `AdminUserDialog` side by side gives identical results except for the
console line: the page renders, the dialog opens, the form works. The immediate
run of the watcher is lost, but `open` starts `false`, and the next change of
`props.open` re-runs it with the binding initialised.

So this is a latent bug, not an outage: a console error today, and a broken form
the first time anything renders one of these dialogs with `open` already `true`
(a deep link to an edit screen, or a refactor) — which would show an
uninitialised form with no error shown to the user.

It shipped twice, in `AdminUserDialog.vue` and `StudentAccountDialog.vue`, and
neither `vue-tsc` nor the production build catches it, because TypeScript does
not track the temporal dead zone across a callback boundary.
`tests/immediate-watcher-tdz.test.mjs` now scans every SFC for the shape, and
both dialogs have a mounting test.
