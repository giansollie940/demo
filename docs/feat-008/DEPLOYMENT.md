# FEAT-008 — Deployment and acceptance runbook

Status: REVIEW CANDIDATE. No remote migration, secret, schedule or deployment was
changed in this task. Independent Sol review and the owner's release decision are
still required. FEAT-007 remains a separate later phase.

## Baseline and order

Baseline is FEAT-006 RC2 with migration 10 applied (including the RC2 monitor
read correction). Verify migrations 01–10 are present, then apply
`database/upgrade/11-FEAT-008-STORAGE-HEALTH.sql` **once**, in a transaction.

The migration adds three empty tables, four helpers, two RPCs, and renames the
two FEAT-006 dispatchers behind a guard:

```
public.homework_api    → homework_private.api_v6    (body unchanged)
public.homework_media  → homework_private.media_v6  (body unchanged)
```

It rewrites no data and changes no existing row. It is **not** re-runnable: it
creates tables and renames functions. Applying it twice fails on the first
`create table` with `42P07`, which is the intended behaviour for a numbered
migration — nothing is committed. The session is then in an aborted transaction
and needs a `rollback` before running anything else; the Supabase SQL editor
does that for you. Verified in the local Postgres harness: after a rejected
second apply, `homework_storage('status')` still works normally.

After SQL, deploy the `storage-health` Edge Function, then the frontend build.
`node scripts/package-edge-functions.mjs` regenerates all deployment ZIPs (15 after FEAT-007 adds `archive-media`).

## Nothing is withheld until you configure capacity

This is the most important operational fact in the feature. Both providers ship
with `configured_bytes = NULL`, which means:

- no percentage is shown;
- level reads `unconfigured`;
- **no threshold, no warning and no protection mode**.

So the safe deployment order is: apply the migration, deploy, confirm the
dashboard renders, and only then set capacities. Nothing can lock up in between.

Set capacity in **Quản trị → Dung lượng → Đặt dung lượng**, in GB, from the plan
actually in force for this deployment. Both figures are audited in
`homework_storage_events`.

⚠️ Confirm what the Supabase figure should be. `pg_database_size` measures the
logical database. Depending on plan, the quota you are billed against may be a
larger disk volume including WAL and overhead. Set the capacity that matches the
number you are actually limited by, or the 95% trigger will fire at the wrong
moment. This has not been validated against a live Supabase project.

## Measuring

Two buttons, deliberately distinct:

- **Đo trong CSDL** — `pg_database_size` plus the attachment aggregate. Runs
  entirely in Postgres, needs no credentials, always available.
- **Hỏi kho ảnh** — calls the `storage-health` Edge Function, which reads R2
  with the existing `R2_*` Edge secrets and pushes the total back. Admin-only.

No new secret is required: `storage-health` reuses the FEAT-006 R2 credentials
and the standard Supabase server config. Never expose `R2_*` to `VITE_*`.

If R2 cannot be read, or the bucket needs more than 20 × 1000-object pages, the
dashboard keeps the in-database figure and labels its source. That is
intentional — a storage dashboard must not go blank exactly when storage is in
trouble.

**Which number drives protection.** An R2 answer counts only while it is under
six hours old; after that it is still shown, flagged as too old, but stops
contributing. The application's own accounting is always a floor under it, so a
provider figure can never suppress a lock the app can already justify.

**Queued is not deleted.** **Dọn ảnh chờ quá hạn** only writes purge jobs; the
objects leave R2 minutes later, when the background worker runs, and it can
fail. So cleanup deliberately changes nothing about the measurement: the R2
answer is kept, and bytes waiting to be purged still count as used (shown as
*Đang chờ xoá*). Expect the percentage **not** to move when you press it. Once
the worker has run, press **Hỏi kho ảnh** — a fresh authoritative measurement is
the only thing that lowers the figure or lifts the lock.

⚠️ Schedule the refresh comfortably inside six hours. If it runs less often, R2
readings will routinely age out and the dashboard will sit on the metadata
figure — correct, but less accurate than it could be.

### Scheduled refresh (recommended, not wired here)

Point a scheduled invocation at `storage-health` the same way FEAT-006 schedules
`homework-media-cleanup` (pg_cron + pg_net + a Vault secret). Until that exists,
a snapshot older than 24 hours is flagged `stale` in the UI.

**What `stale` does, exactly.** It is a display flag and nothing else. An old
snapshot still produces a percentage, still produces a level, and still drives
protection: a measurement taken 40 hours ago showing 96% keeps uploads locked,
and the UI adds *"Số đo đã cũ hơn 24 giờ"* beside it. That is deliberate. The
last measurement is the only evidence there is, and a monitoring job that stopped
running is not a reason to stop protecting — the failure Admin must never see is
protection evaporating because the cron died.

What staleness does **not** do is manufacture protection. A provider that was
never measured has no percentage and no level, so it withholds nothing. Silence
is not evidence of health, but it is not evidence of an emergency either.

(Do not confuse this with the separate six-hour rule above, which governs only
which of the two R2 *numbers* is used. `stale` at 24 hours governs only the
label.)

## What happens at each threshold

| Level | Effect |
|---|---|
| 70% | dashboard notice only; nothing withheld |
| 85% | warning banner suggesting archive/cleanup; nothing withheld |
| R2 ≥95% | new image uploads withheld; text notices, existing images, Admin cleanup unaffected |
| DB ≥95% | protection mode: new hearts and new images withheld; text notices, corrections, reports, hard-delete, audit and cleanup all continue |

Withheld actions raise SQLSTATE `53100` and surface as "Hệ thống đang ở chế độ
bảo vệ dung lượng", shown as a notice rather than a red failure. Protection
cannot be switched off while usage is still ≥95%: there is no stored flag to
switch. Lower usage — or raise the configured capacity if the plan changed — and
it clears on the next measurement.

## Freeing space

**Dọn ảnh chờ quá hạn** enqueues only pending uploads past the 24-hour window,
through the FEAT-006 outbox. Active, historical and correction images are never
candidates. It reports how many jobs it queued, not how much space it freed —
nothing is freed until the worker confirms each delete. Year-end archive and purge are FEAT-007 and do not exist yet; per
DEC-079 storage pressure never purges a school year automatically.

## Required live smoke tests (NOT RUN in this environment)

1. Deno check and startup of `storage-health`; non-admin JWT denied (403);
   anonymous denied; no `R2_*` value in any response or log.
2. `Đo trong CSDL` on a real Supabase project: compare `pg_database_size` with
   the figure the Supabase dashboard reports and decide which one capacity
   should be set against.
3. `Hỏi kho ảnh` against the real bucket: correct total, correct pagination
   past 1000 objects, and the `partial` path on a bucket over 20 000 objects.
4. Set capacity so DB crosses 95% on a staging project: confirm a new heart and
   a new image are withheld with the capacity message, and that posting a text
   notice, requesting a correction, filing a report, hard-deleting and running
   cleanup all still succeed.
5. Same for R2 ≥95%: only image upload withheld.
6. Lower usage or raise capacity; confirm protection clears without any manual
   toggle.
7. Confirm audit rows continue to be written throughout, in both
   `homework_contribution_events` and `homework_storage_events`.
8. Regression: the FEAT-006 image flow end to end on a healthy deployment.

## Rollback

FEAT-008 stores no business data. To remove it, restore the two dispatchers:

```sql
begin;
drop function public.homework_api(text,jsonb);
drop function public.homework_media(text,jsonb);
alter function homework_private.api_v6(text,jsonb) rename to homework_api;
alter function homework_private.homework_api(text,jsonb) set schema public;
alter function homework_private.media_v6(text,jsonb) rename to homework_media;
alter function homework_private.homework_media(text,jsonb) set schema public;
grant execute on function public.homework_api(text,jsonb),public.homework_media(text,jsonb) to authenticated;
commit;
```

This rollback was executed in the local Postgres harness: `homework_api` works
afterwards and no longer contains the guard.

Drop the three `homework_storage_*` tables and the four `storage_*` helpers only
if you also want to discard the capacity configuration and the storage audit
trail; leaving them costs a few kilobytes and keeps the history.
