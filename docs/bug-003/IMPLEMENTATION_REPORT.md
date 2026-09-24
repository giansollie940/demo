# BUG-003 — IMPLEMENTATION REPORT

## Status

`IMPLEMENTED`

Implementation was performed by Sol under the user's explicit one-task exception to the normal Astra implementation step.

## Root cause

`buildOwlContextMessages()` grouped `teacher` and `admin` into the same `manager` branch. Before route-specific Admin guidance was selected, the shared branch calculated the Teacher action queue and emitted:

`Tuần ... còn ... đăng ký cần giáo viên xử lý.`

That message was `urgent`, so Admin could also receive the Owl red-dot alert for Teacher workload.

## TDD evidence

RED run: GitHub Actions `36015290467`.

New regression tests failed on baseline exactly at the Admin assertions:

- Admin `/admin` still contained Teacher queue workload / urgent state.
- Admin Device Policy context still contained Teacher queue workload / urgent state.

Teacher same-state control test passed, confirming the fixture represented a valid Teacher queue.

## Implementation

Modified only the Owl context model:

- Admin now has an explicit role branch before Teacher queue calculation.
- Admin receives only Admin-general or Admin Device Policy read-only guidance in the legacy Owl path.
- Teacher retains the existing queue calculation and route-specific operational guidance.
- Homework remains handled by its existing early role-specific return.
- Student/Monitor branch is unchanged.

No CSS-only hiding was used.

## Regression adjustment

One BUG-001 regression test encoded the old, now-invalid expectation that Admin should have an urgent Teacher Review alert. It was updated to preserve Teacher urgency while asserting Admin remains non-urgent even on a stale `/review` path.

## GREEN verification

GitHub Actions run `36015526817`: SUCCESS.

- Owl unit: 9/9 PASS
- BUG-001 regression: 23/23 PASS
- Static tests: 14/14 PASS
- Typecheck: PASS
- Production build: PASS (`built in 4.83s`)

## Data / security impact

NONE.

No database, Auth, RLS, RPC, Edge Function, migration, or production data change.

## Self-review

- Admin no longer derives Owl messages from `pendingForTeacher()` / Teacher queue.
- Teacher behavior is preserved by test.
- Admin Device Policy guidance remains read-only.
- Admin stale Teacher route receives no Teacher workload alert.
- Homework early-return behavior remains covered by BUG-001 tests.
- Student/Monitor implementation was not changed.
