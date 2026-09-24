# UIFIX-DEVICE-ICON-001 — Review handoff

STATUS: READY_FOR_REVIEW (source change); visual and runtime gates remain open.

## Files changed

- `src/components/icons/DevicePolicyIcon.vue`: the shared feature icon is now Tablet + Phone + Lock.
- `src/pages/DevicePolicyPage.vue`: replace the Schedule artwork at the leading Teacher header position with the shared icon at 30 px, in a responsive sun-tone frame. Existing status icons remain.
- `tests/verify-002/device-policy-icon.test.mjs`: assert the three shapes, Teacher header use, tab and Admin reuse, and separate lock/unlock indicators.
- `tests/bug-001/renderer.ts`: support Vue static content insertion in the existing lightweight test renderer so the larger shared SVG can mount in Admin UI tests. No frozen RC9 testfix file was modified.
- `scripts/build-feat-next-package.py`: regenerate and verify `SHA256SUMS.txt` along with `SOURCE_MANIFEST.json` for the full source ZIP.
- `docs/feat-next/GATE_STATUS.md` and `docs/feat-next/IMPLEMENTATION_HANDOFF.md`: document package integrity correction.

Before: the Teacher's leading header art was `PageArtwork name="schedule"`, a document/clock-like schedule illustration; the tab had a separate laptop/lock icon.

After: Teacher leading header, tab and Admin read-only header reuse the same Tablet + Phone + Lock component. The Teacher status indicators remain `Lock` and `LockOpen`.

Typecheck: PASS. Build: PASS. FEAT-010 integrated regression: PASS (18/18 groups, 417/417 test invocations; repeated migration configurations included). FEAT-010 UI: 22/22 PASS. VERIFY-002 static: 5/5 PASS. The first full run failed on unsupported static SVG insertion in the test renderer; after the renderer fix, the entire suite was run again and passed with exit code 0. Evidence: `docs/feat-010/evidence/verification-results.json` and adjacent logs.

Browser Teacher Device tab: NOT RUN. Mobile: NOT RUN. Screenshot: NOT AVAILABLE. The cloud browser rejected the local integrated build at `http://127.0.0.1:4173/` with `net::ERR_BLOCKED_BY_CLIENT`; no authenticated staging URL was provided. No screenshot has been presented as actual rendered evidence.

The VERIFY-002 gates V-011/V-012/V-013 remain OPEN. This icon change does not assert or close any runtime gate. Production release remains NOT APPROVED.
