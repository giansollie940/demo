# BUG-005 — IMPLEMENTATION REPORT

## Status

`IMPLEMENTED`

Implementation was performed by Sol under the user's explicit request to fix the task directly.

## Root cause addressed

Manager bootstrap state only contains registration detail for the operational/current week. The Owl read `auth.legacyState.registrations`, while the Approval page independently queried the selected week. Selecting Week 9 therefore did not provide Week 9 registration data to the Owl.

## Implementation

- Added bounded `useTeacherQueueWeeks()` query composition.
- Teacher Owl observes at most three week scopes: selected week, operational week, and the immediate next week whose status is `open`.
- It reuses the existing `week-data` query/source instead of preloading an entire school year.
- Selected-week query data is authoritative for the selected-week alert.
- If the selected week has no actionable work, the Owl checks the other monitored week snapshots and surfaces an urgent cross-week message with the week number.
- Actionability still uses `isTeacherQueueItem()` / existing manager-action semantics.
- Admin role isolation from BUG-003 is preserved.
- Registration Realtime invalidates the `week-data` prefix, so active monitored week queries refresh after INSERT/UPDATE/DELETE.

## TDD evidence

RED run: `36071547418`.

- selected Week 9 Teacher alert assertion failed on baseline.
- cross-week Week 9 alert while viewing Week 8 failed on baseline.

GREEN targeted run: `36072045133`.

- unit tests: 16/16 PASS
- BUG-001 regression: 23/23 PASS
- static regression: 14/14 PASS
- typecheck: PASS
- production build: PASS

Full FEAT-010 integrated verifier on run `36072151396`: PASS.

## Data / security impact

NONE.

No all-year detail preload, no new RPC, no database migration, and no Student/Admin permission change.
