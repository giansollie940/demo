# VERIFY-002 — UAT ADDENDUM 2026-09-24

## User-reported authenticated checks

The user reports:

- login succeeds for the available application roles;
- the same account can be signed in successfully in two different browsers on the same computer.

These observations support authenticated login/session compatibility.

They do **not** by themselves prove Realtime invalidation, because no cross-browser state change was reported yet.

## New defect found during UAT

The user reports that Cú Thông Thái shows Teacher-oriented notes/reminders in the Admin interface.

Source investigation found a matching root cause in `buildOwlContextMessages()`: Admin and Teacher are currently grouped into one `manager` branch before Teacher queue reminders are generated.

Task created: `BUG-003 — Owl Admin Role Isolation`.

## VERIFY-002 review impact

Authenticated login: PASS by user UAT.

Two-browser simultaneous login for one account: PASS by user UAT.

Two-browser Realtime invalidation: NOT VERIFIED.

Owl Admin role isolation: FAIL / known defect.

Overall VERIFY-002 disposition after this UAT: `REQUEST_CHANGES`.

Re-review requires BUG-003 implementation and regression evidence. Realtime cross-browser behavior should also be exercised by making a state change in one browser and observing the second browser update without manual reload.
