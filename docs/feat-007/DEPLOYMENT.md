# FEAT-007 — Deployment and acceptance runbook

Status: **APPROVED at the Sol implementation-review gate (RC6). Not deployed.**
No remote migration, secret, schedule or deployment has been changed. The release
decision is the Product Owner's, and the live gates at the end of this file have
not been run anywhere.

## Read this first if the database already has FEAT-007

A check on 2026-09-19 found the live database already running **RC1's** migration
12 — the version Sol rejected — with the archive tables still empty. If that is
the database you are deploying to, this file's "apply migration 12" step will
fail on its first `alter table`, and applying it is not what you want anyway:
follow `PRODUCTION_UPGRADE_RC1_TO_RC6.md`, which resets RC1 first and then runs
the approved file unchanged. Come back here afterwards.

## Baseline and order

Baseline is FEAT-008 with migration 11 applied. Verify migrations 01–11 are
present, then apply `database/upgrade/12-FEAT-007-ARCHIVE-PURGE.sql` **once**, in
a transaction.

The migration adds one column to `school_years`, four empty tables, four helpers,
two RPCs, and renames the two dispatchers behind the read-only guard:

```
public.homework_api    → homework_private.api_v8    (body unchanged)
public.homework_media  → homework_private.media_v8  (body unchanged)
```

It rewrites no data and changes no existing row. It is **not** re-runnable: it
creates tables and renames functions. Applying it twice fails on the first
`alter table` / `create table`, which is the intended behaviour for a numbered
migration — nothing is committed. The session is then in an aborted transaction
and needs a `rollback` before running anything else; the Supabase SQL editor does
that for you.

After SQL, deploy the `archive-media` Edge Function, then the frontend build.
`node scripts/package-edge-functions.mjs` regenerates the deployment ZIPs.

No new secret is required: `archive-media` reuses the FEAT-006 `R2_*` Edge
secrets. Never expose `R2_*` to `VITE_*`.

## Nothing changes until an Admin archives a year

Every year starts at `archive_state = 'active'`, and in that state migration 12
is inert: the guard passes every call straight through to the FEAT-008 wrapper.
The regression suites are re-run with migration 12 installed to prove exactly
that. So the safe deployment order is: apply the migration, deploy, confirm
**Quản trị → Kho lưu trữ** renders, and only then archive anything.

## Before the migration: one data-integrity check

Sol's RC6 review flags a pre-existing FEAT-001 weakness worth confirming on the
real database first. `homework_duplicate_reviews.candidate_id` references
`homework_notices` with no `on delete` action, so a review row whose candidate
lives in a *different* year would make the `notices` purge step fail on a foreign
key rather than delete anything — noisy, recoverable, not destructive. The app
cannot create such a row and migration 12's freeze refuses to create one
directly, but legacy data has never been checked. Run this read-only query
before the migration and again before the first purge:

```sql
select r.id as review_id, r.notice_id, r.candidate_id,
       n.school_year_id as review_year, c.school_year_id as candidate_year
from public.homework_duplicate_reviews r
join public.homework_notices n on n.id = r.notice_id
join public.homework_notices c on c.id = r.candidate_id
where n.school_year_id <> c.school_year_id;
```

Zero rows is the expected and normal result. If it returns anything, decide what
those rows mean **before** archiving either year — the two options are clearing
`candidate_id` on them, or purging the two years together.

The same applies to anything else that ended up cross-year in the past. A quick
sanity pass:

```sql
select 'notice vs class' as what, count(*) from public.homework_notices n
 join public.classes c on c.id = n.class_id where c.school_year_id <> n.school_year_id
union all
select 'attachment vs class', count(*) from public.homework_attachments m
 join public.classes c on c.id = m.class_id where c.school_year_id <> m.school_year_id
union all
select 'english group vs class', count(*) from public.english_groups g
 join public.classes c on c.id = g.class_id where c.school_year_id <> g.school_year_id;
```

All three counts should be zero. A non-zero count is not blocked by migration 12
— the freeze refuses *new* inconsistencies, it does not clean up old ones — but
it means a row can be attributed to two years at once, and the guard will then
refuse writes to it while either year is packed away.

## The workflow, and why each step exists

**1. Kiểm tra (preflight).** Counts per entity, total image bytes, and anything
that would make the archive incomplete. A year with pending uploads, images
queued for deletion, open correction requests or notices awaiting duplicate
review cannot start a run — those are states where "what belongs to this year" is
not yet settled. Clear them first (pending uploads are cleaned from
**Dung lượng**).

**2. Đóng gói và tải về.** The browser downloads every row and every image and
writes the ZIP straight to the file the Admin picks. Keep the tab open; on a
browser with the File System Access API the bytes go to disk as they are
produced, otherwise they are held in memory until the download starts.

The run is graded on the server and comes back `verified` or `failed`. It fails
if any image did not arrive, if any image's bytes do not hash to what the
database recorded, or if the year changed while the archive was being built. A
failed run cannot be argued with — archive again.

**3. Mở lại tệp đã lưu.** Open the saved ZIP in the Viewer at the bottom of the
screen. The Viewer verifies it locally and reports its fingerprint; the server
matches that against the archive it recorded. **Only this unlocks purge.** A
checkbox would let an interrupted download through, and purge does not undo.

**4. Khoá năm học (chỉ xem)** — optional but recommended before purge. The year
becomes readable and nothing else: no new notices, hearts, reports, corrections
or images. Existing images stay viewable.

**5. Xoá dữ liệu cloud.** Requires a verified archive, a confirmed file, a
non-empty reason, the irreversibility acknowledgement, and a year that is not the
active one. It then runs step by step and can be resumed if interrupted.

⚠️ **Keep at least two copies, in two places.** The system cannot verify a second
copy and does not try; this is the one part of the gate that rests entirely on
the Admin. After purge, the ZIP is the only copy of the detail.

⚠️ **The archive is sensitive.** It contains student data and audit history.
Store it somewhere permitted and do not share it publicly. V1 does not encrypt
the ZIP.

## What purge removes and what it keeps

Removed: notices and everything hanging off them (reactions, reminders, reports,
corrections and rounds, duplicate reviews, notice media, media history),
class-scoped audit, moderation events and notifications, English groups and
memberships, class subjects, class settings and backlog state, and the year's R2
objects.

Kept, deliberately:

- **profiles and classes** — people and classes carry over between years;
- **the shared grade subject catalog** — other years use it;
- **the archive index** — that is the point of it;
- **FEAT-002 tombstones**, and the subject/group rows a surviving tombstone
  references. FEAT-002 makes the tombstone permanent and undeletable; FEAT-007
  does not override another feature's rule, so those few referenced rows stay
  too. See DEC-091.

Images are queued through the FEAT-006 outbox, not deleted directly, so they
leave R2 when the background worker confirms each delete. Expect storage figures
to drop **after** the worker has run, not at the moment purge finishes — press
**Hỏi kho ảnh** in Dung lượng afterwards.

## Required live smoke tests (NOT RUN in this environment)

1. Deno check and startup of `archive-media`; non-admin JWT denied; anonymous
   denied; no `R2_*` value in any response or log.
2. A real archive of a small year end to end: open the ZIP, confirm every image
   renders in the Viewer, confirm `checksums.txt` verifies with `sha256sum -c`.
3. The same on a year with more than 50 images, to exercise manifest paging and
   signed-URL expiry across a long run.
4. Deliberately break one image in R2 and confirm the run comes back `failed`
   rather than `verified`.
5. Confirm the purge button stays hidden until the saved file is re-opened, and
   that re-opening a *different* ZIP is refused.
6. Archive a year, set it read-only, and walk every screen as student, monitor,
   teacher and admin: reading works, writing is refused with the capacity-style
   notice rather than an error page.
7. Purge a non-active year; confirm another year's data and the shared catalog
   are untouched, the index survives, and storage health drops once the media
   worker has run.
8. Interrupt a purge (close the tab mid-run) and confirm **Tiếp tục xoá** resumes
   from the recorded step.
9. Confirm the active school year cannot be purged.
10. **Cost of the freeze on ordinary days.** With every year still `active`, run a
    normal teaching day's write volume and compare timings against the same
    workload before migration 12. The guard resolves up to nine candidate owners
    per row per side on sixteen tables, and the harness's row counts cannot show
    what that costs. Then time one purge of a year with tens of thousands of
    rows, where every deleted row also fires the trigger.
11. Re-run the two integrity queries at the top of this file on production data.

## Rollback

FEAT-007 stores no business data of its own. To remove it, restore the two
dispatchers:

```sql
begin;
drop function public.homework_api(text,jsonb);
drop function public.homework_media(text,jsonb);
alter function homework_private.api_v8(text,jsonb) rename to homework_api;
alter function homework_private.homework_api(text,jsonb) set schema public;
alter function homework_private.media_v8(text,jsonb) rename to homework_media;
alter function homework_private.homework_media(text,jsonb) set schema public;
grant execute on function public.homework_api(text,jsonb),public.homework_media(text,jsonb) to authenticated;
commit;
```

The dispatchers are only half of it since RC4. The freeze lives in triggers, so a
rollback that leaves them behind leaves the freeze behind — harmless while every
year is `active`, because the guard returns before doing anything, but not a
rollback. To remove it as well:

```sql
begin;
do $$declare t text;begin
 foreach t in array array[
  'homework_notices','homework_notice_reactions','homework_notice_reminders','homework_duplicate_reviews',
  'homework_reports','homework_corrections','homework_correction_rounds','homework_moderation_events',
  'homework_notifications','homework_contribution_events','homework_notice_media','homework_media_history',
  'homework_attachments','english_groups','english_group_members','class_subjects']
 loop execute format('drop trigger if exists homework_archive_guard on public.%I',t);end loop;
end$$;
drop trigger if exists homework_archive_guard_class on public.classes;
drop function if exists homework_private.archive_guard();
drop function if exists homework_private.archive_guard_class();
drop function if exists homework_private.archive_frozen(uuid);
drop function if exists homework_private.archive_guard_years(jsonb);
commit;
```

Do this only with no archive in `building`, `verified` or `purging`: an
interrupted purge that loses its freeze mid-run is exactly the situation the
freeze exists to prevent.

Drop the four `homework_archive*` tables and the remaining `archive_*` helpers
only if you also want to discard the archive index and its audit trail; leaving them costs a
few kilobytes and keeps the history of what was archived and purged.
`school_years.archive_state` can stay — it defaults to `active` and nothing reads
it once the guard is gone.

**Rollback does not un-purge anything.** Once a purge has run, the ZIP is the
data.
