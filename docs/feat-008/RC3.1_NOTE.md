# FEAT-008 RC3 → RC3.1 — documentation note closed

**Sol RC3 result:** `APPROVED`. One non-blocking item, §8: a sentence in
`DEPLOYMENT.md` did not match the code.

**RC3.1 scope:** that sentence, and tests so it cannot drift again. **No runtime
source file changed** — not the migration, not an Edge Function, not a component.
Sol's approval of the RC3 implementation therefore still stands; §"Proof nothing
runtime changed" below makes that checkable in one command rather than on trust.

---

## The note was correct

`DEPLOYMENT.md` said:

> a snapshot older than 24 hours is flagged `stale` in the UI. **A stale
> snapshot never escalates into protection by itself** — silence is not evidence
> of health, but it is also not evidence of an emergency.

The code does not work that way. `storage_state()` sets `stale` when
`measured_at` is over 24 hours old, and then derives `level` from `percent`
without consulting it. Verified on the local Postgres harness:

```
percent 96   level critical   stale true   locked true
```

So an Admin following the runbook during an incident could have concluded the
lock they were looking at was impossible.

## The code is right; the sentence was wrong

Fixing this in the code would mean suspending protection whenever the refresh
job falls behind. That inverts the safety property: the last measurement is the
only evidence there is, and a monitoring job that stopped running is not a
reason to stop protecting. The failure Admin must never see is protection
disappearing because the cron died.

What I had meant to write is true but narrower, and is now stated separately:
staleness never *manufactures* protection. A provider that was never measured
has no percentage and no level, so it withholds nothing.

Two ages, two jobs — the runbook now says so explicitly, because conflating them
is what produced the wrong sentence:

| Flag | Age | Governs |
|---|---|---|
| `provider_stale` | 6 hours | which of the two R2 **numbers** is used (DEC-088) |
| `stale` | 24 hours | the **label** only (DEC-090) |

## Changes

| File | Change |
|---|---|
| `docs/feat-008/DEPLOYMENT.md` | the §"Scheduled refresh" paragraph rewritten to state what `stale` actually does, and to distinguish it from the six-hour rule |
| `docs/feat-008/FEAT-008_DECISIONS_UPDATE.md` | DEC-090 records the clarification and why the code is not being changed |
| `docs/feat-008/IMPLEMENTATION_REPORT.md` | counts, AC coverage, mutation table |
| `tests/feat-008/database.test.mjs` | two tests |
| `START-HERE-FEAT-008.md`, `RELEASE.json`, `SHA256SUMS.txt` | updated |

### Tests

- `RC3 — a measurement older than 24 hours is labelled stale but still protects`
  — 40-hour-old snapshot at 96% → `stale: true`, level `critical`, uploads
  locked.
- `RC3 — a provider that was never measured withholds nothing` — capacity set,
  no measurement ever → `percent: null`, level `unknown`, nothing withheld.

Mutation-verified: making the old sentence true (`when percent is null or stale
then 'unknown'`) fails 1 test.

This is the same failure shape as RC1, where DEC-084 described a fallback the
code did not implement. A documented claim that nothing tests is not a claim, it
is a hope, so both halves are now pinned.

## Verification

`node scripts/verify-feat008.mjs` — **13/13 PASS, 212 tests, 0 FAIL** (RC3: 210;
the two new tests are the whole difference).

Evidence regenerated in `docs/feat-008/evidence/`; `verification-results.json`
has 13 entries, all `exitCode: 0`. Typecheck PASS, production build PASS.

## Proof nothing runtime changed

Exactly eight files differ from RC3, and none of them runs anywhere:

```
docs/feat-008/RC3.1_NOTE.md              (new)
docs/feat-008/DEPLOYMENT.md
docs/feat-008/FEAT-008_DECISIONS_UPDATE.md
docs/feat-008/IMPLEMENTATION_REPORT.md
tests/feat-008/database.test.mjs
START-HERE-FEAT-008.md
RELEASE.json
SHA256SUMS.txt
```

plus the regenerated logs under `docs/feat-008/evidence/`. To check that without
trusting this document, extract both packages and compare the manifests:

```bash
diff <(grep -vE ' (docs/|tests/|START-HERE-FEAT-008.md|RELEASE.json)' RC3/SHA256SUMS.txt) \
     <(grep -vE ' (docs/|tests/|START-HERE-FEAT-008.md|RELEASE.json)' RC3.1/SHA256SUMS.txt)
```

It prints nothing for all 271 remaining files:
`database/upgrade/11-FEAT-008-STORAGE-HEALTH.sql`, `supabase/functions/**`,
`src/**`, `scripts/**` and the `dist/` build output are byte-identical — the
production build reproduced hash-for-hash from unchanged sources.

## Release gates unchanged

Live Cloudflare R2 (including `usage()` pagination), Deno runtime, live Supabase
`pg_database_size` versus the billed quota, cron wiring, the real FEAT-006
cleanup worker against R2, a fresh R2 re-measure after an actual provider-side
delete, and behaviour while crossing 95% under concurrent traffic. Production
release remains the owner's decision.
