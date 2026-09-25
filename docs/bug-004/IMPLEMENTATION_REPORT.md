# BUG-004 — IMPLEMENTATION REPORT

## Status

`IMPLEMENTED`

Implementation was performed by Sol under the user's explicit request to fix the task directly.

## Root cause addressed

The app previously treated a call to `subscribeRealtime()` as equivalent to a healthy subscription. It set a local subscribed flag without waiting for Supabase status `SUBSCRIBED` and ignored lifecycle failures such as `CHANNEL_ERROR`, `TIMED_OUT`, and `CLOSED`.

This allowed an app session to remain stale until an unrelated focus/refetch event recovered the query.

## Implementation

- Added `src/realtime/realtime-supervisor.ts`.
- Connection is considered healthy only after `SUBSCRIBED`.
- Failure statuses invalidate the local generation, remove the old channel, and reconnect with bounded backoff.
- Stale callbacks from an older channel are ignored by a generation token.
- Foreground/focus recovery performs a one-shot catch-up invalidation of active `device-policy` and `week-data` queries.
- No periodic policy polling was introduced.
- `public/supabase-service.js` now awaits channel cleanup before creating the replacement channel.
- Existing `device_use_policy_signals` remains the event source; no RLS/schema/publication change was made.

## TDD evidence

RED run: `36071547418`.

- realtime supervisor module did not exist, so lifecycle tests failed as expected.

GREEN targeted run: `36072045133`.

- realtime supervisor: 3/3 PASS
- Owl/BUG-005 unit file: 13/13 PASS
- total unit: 16/16 PASS
- BUG-001 regression: 23/23 PASS
- static regression: 14/14 PASS
- typecheck: PASS
- production build: PASS

Full FEAT-010 integrated verifier on run `36072151396`: PASS.

## Security / data impact

NONE.

No database migration, RLS change, RPC behavior change, auth change, or production data mutation.

## Remaining evidence

Real two-browser active-screen UAT is still required by AC-004-001/002. Automated tests verify lifecycle/reconnect behavior but do not substitute for a real Supabase Realtime delivery between two authenticated browser sessions.
