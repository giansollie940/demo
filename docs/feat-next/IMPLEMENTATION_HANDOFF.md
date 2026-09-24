# FEAT-011 / FEAT-012 / FEAT-009 and Owl Device Policy — Implementation Handoff

Date: 2026-09-23. Source basis: `SO-TU-HOC-VERIFY-002-INTEGRATED-FULL`.

## Delivered

- FEAT-011: Device Policy appears inside Teacher Schedule as a tab, with shared `DevicePolicyIcon` and the existing Teacher policy screen. Admin has a Schedule section with a read-only Device Policy tab. Separate sidebar items are removed. `/device-policy` redirects to `/schedule?tab=device`; the legacy `/admin?tab=device` selection redirects to `/admin?tab=schedule&scheduleTab=device`. No Device Policy backend permission was changed.
- Owl fix: while the Teacher Device tab is active, the existing mascot reads the authorized class/week policy query and describes locked and session-override slot counts. It avoids invented counts before that query succeeds. Admin Owl gives read-only guidance without fetching an unspecified class. The first mascot click on the Device tab shows this page guidance.
- FEAT-012: Admin Storage loads on open, polls the cached `storageStatus()` snapshot every 45 seconds while visible and authenticated, refreshes on focus, and preserves its last valid reading after an error. Existing action handlers still refetch after cleanup/capacity changes. Automatic polling never invokes the expensive R2 provider measurement; the separate manual action remains available.
- FEAT-009: opt-in `VITE_OWL_MASCOT_V2_ENABLED=true` enables V2 for Admin only. The default/rollback state is the original Owl. V2 separates its controller/state from its Vue renderer, supports nine gaze directions, nine reaction values, a single-bubble priority queue and cooldown, pointer and target gaze, reduced-motion behavior, and asset-error isolation. Pointer coordinates stay in memory only.

## Verification performed

- `node scripts/verify-feat010.mjs` after adding FEAT-012 tests: **18/18 checks PASS; 417/417 test invocations PASS** (415 previous invocations and two new mounted-component tests). This count includes repeated migration configurations, not 417 unique tests. The timestamped command-level record is `docs/feat-010/evidence/verification-results.json`; per-command logs are alongside it.
- `node --test tests/verify-002/*.test.mjs`: **5/5 PASS** (updated the navigation expectation for FEAT-011).
- `npx vitest run --configLoader runner tests/unit/owl-mascot-v2.test.ts`: **6/6 PASS**, including pilot flag, direction, queue/cooldown, target gaze, and truthful Device Policy wording.
- Current full runner includes FEAT-010 UI **22/22 PASS**, Storage UI **11/11 PASS**, general UI **64/64 PASS**, typecheck and production build PASS.
- Six frozen RC9 testfix files retain their original SHA-256 values from `docs/verify-002/evidence/frozen-testfix.json`. Both migrations 15 and 16 remain byte-identical to the integrated baseline. No database migration was added.

## Remaining verification and rollout boundaries

- Browser UI evidence with authenticated Teacher/Admin sessions and mobile/desktop views: **NOT RUN** in this workspace. Cloud browser opening the local integrated bundle returned `ERR_BLOCKED_BY_CLIENT`. Review tab transition, Device Policy actions, actual mascot rendering, and Storage refresh with real sessions before rollout.
- VERIFY-002 concurrency gates V-011/V-012 and two-browser realtime gate V-013 remain **OPEN / NOT RUN**; source tests do not prove those runtime conditions. See `VERIFY-002_GATE_HANDOFF.md`.
- The earlier RC9 mutation suite evidence is retained unchanged and is **not a new integrated mutation run or independent Sol verification**.
- No production release, database mutation or deployment was performed. V2 remains off by default; set `VITE_OWL_MASCOT_V2_ENABLED=true` only for the Admin pilot, then rebuild. Clearing the flag and rebuilding restores the existing mascot.

## Package correction

The original ZIP placed source under `next-iteration-work/` and omitted a manifest. This handoff uses a **flat source ZIP** with `package.json`, `SOURCE_MANIFEST.json` and regenerated legacy `SHA256SUMS.txt` at its root. The legacy checksum list covers every packaged source other than itself and `SOURCE_MANIFEST.json` (which records the legacy file); this prevents a checksum cycle. `python3 scripts/build-feat-next-package.py --verify-zip <zip-path>` checks both inventories and every byte. Generated `dist`, dependency links and local build metadata are excluded. `docs/feat-next/GATE_STATUS.md` records the current browser and runtime gates without changing their status.
