# FEAT-010 RC8 → RC9 FULL — integration report

## Status

**ARTIFACT COMPLETE — FULL RUNTIME VERIFICATION PENDING**

RC9 integrates the SOL-reviewed PATCH-R2 source correction for R-009/R-010 into the full RC8 source tree. No Device Lock business rule or frontend source changed.

## Source correction

`database/upgrade/14-FEAT-010-RC9-CASCADE-FREEZE-FIX.sql` preserves all of these simultaneously:

- active-year parent `DELETE classes` may cascade FEAT-010 child history when FEAT-004 allows the class delete;
- direct child DELETE still requires a writable year;
- archived/frozen parent class deletion remains FEAT-007's responsibility;
- INSERT/UPDATE checks NEW owner;
- UPDATE changing `class_id` additionally checks OLD owner.

This is the same R2 SQL source that SOL marked R-010 **RESOLVED IN SOURCE** and R-009 direction acceptable.

## Runtime regression integrated

`tests/feat-010/database.test.mjs` now executes real database paths for:

1. active-year empty class delete;
2. active-year parent delete with interval + override + signal, asserting all cascade away;
3. direct frozen child DELETE rejected;
4. frozen OLD → active NEW UPDATE rejected;
5. active OLD → frozen NEW UPDATE rejected;
6. active OLD → active NEW positive control;
7. combined FEAT-007 + FEAT-010 archived parent delete, asserting FEAT-007 error wins.

`tests/feat-010/mutations.mjs` adds:

- M51 — remove parent-missing DELETE bypass;
- M52 — remove OLD-side UPDATE check.

The fixture installs migration 13 followed by migration 14, matching the RC8→RC9 production upgrade path. Existing M1…M50 still target migration 13; M51/M52 explicitly target migration 14.

## Verification performed in this packaging environment

- RC8 FULL source successfully extracted: 649 files.
- Modified JS files parse with `node --check`: PASS.
- RC9 mutation definitions apply to migration 14 source exactly once: verified by packaging checks.
- Package SHA manifest/integrity: verified after packaging (see `docs/feat-010/evidence/rc9-integration-static.log`).

## Verification not performed here

The delivered RC8 source intentionally excludes `node_modules`. Network access in the packaging runtime could not restore npm dependencies, so PGlite/Vitest/vue-tsc/Vite could not be rerun locally. A session-local PostgreSQL test harness was prepared, but remote SQL execution was not authorized; production was not modified.

Therefore the RC8 evidence below is **baseline only**, not an RC9 pass claim:

- 18/18 verification checks PASS;
- 404 tests / 0 fail;
- FEAT-010 database 61 PASS;
- FEAT-010 frontend 22 PASS;
- legacy/FEAT-001…008 321 PASS;
- typecheck PASS;
- production build PASS;
- mutation 50/50 caught.

Before APPROVED/deploy, rerun `node scripts/verify-feat010.mjs` and `node scripts/mutate-feat010.mjs` with dependencies restored. Expected RC9 mutation bar is **52/52 caught**.

## Release gates unchanged

- true two-connection PostgreSQL Lock vs registration write;
- true two-connection policy vs `archive_begin`;
- realtime two-browser check;
- add `device_use_policy_signals` to `supabase_realtime`;
- FEAT-007 RC6 must precede FEAT-010 production rollout.

## Production impact

None. No RC9 migration was run on production and no production data was used as a test fixture.
