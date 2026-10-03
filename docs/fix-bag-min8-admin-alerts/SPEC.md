# Bag minimum and Admin homework inbox

STATUS: FINAL
Risk: MEDIUM (authentication validation and notification delivery)
User approval: 2026-10-03, lower the minimum to 8 items and stop Admin homework alerts.

- Accept 8–20 items consistently in frontend, both bag Edge Functions and SQL input validation.
- Preserve catalogue encoding, exact sequence matching, weak-pattern rules, password reauthentication and rate limits. Existing secrets are not truncated or reset.
- Admin receives no homework inbox notifications, regardless of legacy alert preferences. Preserve existing notification rows but exclude them from Admin inbox results and hide the homework bell.
- Teacher/student/monitor notifications and Admin oversight/history remain available as before.
- Deliver with a forward migration, focused regression tests, review, and deploy backend before frontend.
