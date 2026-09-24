# DECISIONS UPDATE — FEAT-008 (implementation decisions)

These record choices the FINAL SPEC deliberately left to implementation. They do
not change any business rule. DEC-071 → DEC-081 remain ACTIVE and authoritative.

---

## DEC-082 — Unknown capacity is unknown, never 0% and never full
**STATUS:** ACTIVE

`homework_storage_capacity.configured_bytes` ships NULL for both providers. A
NULL capacity yields no percentage, level `unconfigured`, and no protection mode.

A guessed quota fails in both directions: too high hides a real emergency, too
low locks a healthy deployment out of its own app. The deployment must state its
capacity; until it does, FEAT-008 measures and reports but withholds nothing.

---

## DEC-083 — Protection mode is derived, never stored
**STATUS:** ACTIVE

There is no persisted protection flag. State is computed from the latest usage
snapshot against configured capacity on every read, so "Admin cannot switch
protection off while usage is still ≥95%" (DEC-078) holds by construction rather
than by guarding an update path.

---

## DEC-084 — R2 usage has two sources and the UI always says which
**STATUS:** ACTIVE

`metadata_bytes` is the application's own accounting; `provider_bytes` is what
Cloudflare R2 reports. Separate columns. The metadata aggregate cannot see
objects R2 holds that the application has no row for, and the dashboard says so.
Storage health degrades to a slightly optimistic number rather than going blank
when R2 is unreachable.

**Superseded in part by DEC-088**: RC1 implemented "percent uses the provider
figure when present", which let one old R2 answer drive the percentage for ever
and contradicted the fallback this decision describes. DEC-088 states the
selection rule that actually delivers it.

---

## DEC-085 — A capacity hold raises SQLSTATE 53100, not 42501
**STATUS:** ACTIVE

`53100` (disk_full) is a resource error; `42501` is what this codebase raises for
permission. F8-RB-004 is satisfied by the error class itself, and clients branch
on the code rather than on message text.

---

## DEC-086 — Only additive non-essential writes are withheld
**STATUS:** ACTIVE

Under protection, adding a heart and uploading a new image are withheld.
Removing a heart, clearing an image, and finishing or cancelling an upload
already in flight stay available: each releases space, and blocking them would
make the system fuller while trapping the user in a state they cannot undo.

---

## DEC-087 — FEAT-008 adds no deletion path
**STATUS:** ACTIVE

`cleanup_pending` enqueues through the FEAT-006 outbox and touches only pending
uploads past the 24-hour window (DEC-081 case 2). FEAT-008 can therefore not
purge anything DEC-081 does not already allow, and CR-005 holds because no
year-scoped deletion exists in this feature.

---

## DEC-088 — The effective usage figure, and what the source label means
**STATUS:** ACTIVE (refines DEC-084)

The number that drives thresholds and protection is:

```
effective = greatest(provider_bytes used only while under 6 hours old,
                     metadata_bytes)
```

1. **A provider reading counts only while recent.** Outside six hours it stops
   contributing but is still displayed with its timestamp, flagged
   `provider_stale`. It is neither trusted nor deleted.
2. **The application's accounting is a floor.** It includes pending uploads the
   provider has not seen, so a provider figure that predates them must never pull
   the total down. A storage guard that errs should err towards protecting.
`source` names the value that actually produced the percentage, so it reads
`metadata` whenever the floor won — including when a fresh provider reading
exists but is lower. The UI label must match the value used for protection.

**Withdrawn in RC3.** RC2 carried a third rule — *"cleanup invalidates the
reading"* — under which `cleanup_pending` cleared `provider_bytes` because the
bucket was about to shrink. It was wrong, and Sol's RC2 review was right to
block on it. See DEC-089.

---

## DEC-089 — Queued is not deleted
**STATUS:** ACTIVE (replaces point 3 of DEC-088 as written in RC2)

`homework_private.media_enqueue` sets the attachment to `deleting` and writes an
outbox job whose `safe_after` is at least three minutes in the future. The
object leaves R2 only when the worker runs and succeeds, which may be much
later, or never. So a cleanup request is a *promise* about the bucket, not a
measurement of it, and two rules follow:

1. **A queued cleanup never invalidates a provider reading.** The R2 figure is
   left exactly as it was; it ages out on its own after six hours, or Admin
   replaces it with a fresh measurement. Staying locked slightly longer than
   necessary is the safe direction — unlocking on a promise is not. This matters
   most for bytes the app cannot see at all: the provider figure is the only
   evidence that untracked objects exist, and one tracked pending attachment
   being queued says nothing about them.
2. **Bytes queued for purge still count as used.** `storage_measure()` sums
   every attachment row, `deleting` included, and reports the queued portion
   separately as `deleting_bytes`. Excluding them would have let the metadata
   floor fall the instant a cleanup was requested, which is the same unlock by a
   different route.

The rule in one line: **queuing a cleanup may schedule space to be freed, but
only a new measurement may report it as freed.**

---

## DEC-090 — `stale` labels a measurement; it never suspends protection
**STATUS:** ACTIVE (clarification, no code change)

Two different ages are tracked and they do different jobs:

| Flag | Age | What it governs |
|---|---|---|
| `provider_stale` | 6 hours | which of the two R2 **numbers** is used (DEC-088) |
| `stale` | 24 hours | the **label** only |

A snapshot older than 24 hours still produces a percentage, a level and
protection. A measurement taken 40 hours ago showing 96% keeps uploads locked
and is displayed with *"Số đo đã cũ hơn 24 giờ"* beside it. The last measurement
is the only evidence there is, and a monitoring job that stopped running is not
a reason to stop protecting — the failure Admin must never see is protection
disappearing because the cron died.

Staleness never manufactures protection either: a provider that was never
measured has no percentage and no level, so it withholds nothing.

Recorded because `DEPLOYMENT.md` previously asserted the opposite ("a stale
snapshot never escalates into protection by itself") and nothing tested the
claim — the same shape of defect as RC1, where DEC-084 described a fallback the
code did not implement. The runbook now matches the code, and two tests pin the
behaviour.
