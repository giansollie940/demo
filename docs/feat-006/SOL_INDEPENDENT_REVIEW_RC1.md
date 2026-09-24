# FEAT-006 — SOL INDEPENDENT REVIEW — RC1

## Conclusion

**REQUEST_CHANGES**

RC1 is not approved yet because there is one backend authorization mismatch with the FINAL SPEC / FEAT-002 regression contract.

---

## Blocking finding

### P1 — Monitor can read a published image outside their English group

**Severity:** High  
**Area:** Authorization / English-group isolation  
**Status:** Must fix before approval

`database/upgrade/10-FEAT-006-HOMEWORK-MEDIA.sql` implements published-image read authorization using:

```sql
if not (
  n.author_id=a.id
  or a.role::text in('teacher','admin')
  or (n.status='published' and homework_private.visible(n,a))
) then ...
```

However the inherited helper in `database/upgrade/05-FEAT-001-BAO-BAI.sql` defines:

```sql
select a.role::text in('admin','teacher','monitor')
   or n.english_group_id is null
   or exists(...)
```

Therefore `monitor` returns `true` before English-group membership is checked.

Result: a Monitor in the class can obtain a fresh signed GET URL for a published image belonging to an English group they are not assigned to.

This conflicts with:

- `MEDIA_STORAGE_SUITE_FINAL_SPEC_V2.md` F6-RB-010:
  `Published notice: Student/Monitor đúng class + English-group scope`
- FEAT-002 `Must Not Break`:
  `Student/Monitor English-group isolation`
- AC6-09:
  cross-class / English-group access must be blocked backend-side.

### Test gap

`tests/feat-006/database.test.mjs` checks English-group membership for `ids.other` (Student) and assignment revocation for Teacher, but does not test a Monitor outside/inside the English group.

### Required change

1. Enforce Monitor English-group isolation backend-side.
2. Add a regression test:
   - Monitor same class, not member of E1 → `homework_media('read')` denied.
   - Assign Monitor to E1 → read allowed.
   - Remove/leave membership → fresh read denied again.
3. Do not implement this only in the frontend.
4. Preserve Teacher assigned-class and Admin oversight behavior.
5. If the fix changes the shared `homework_private.visible()` helper, run full FEAT-001→006 regressions because it affects notice/reaction/inbox visibility beyond media.

---

## Other reviewed areas

By source inspection, the following designs are consistent with the current FEAT-006 spec:

- private R2 storage with Supabase as authorization source;
- client-side WebP compression, q=0.92, max 1600 px, hard cap 500,000 bytes;
- no original multi-MB upload;
- pending attachment recovery up to 24 hours;
- durable cleanup outbox;
- claim-token protection against stale cleanup acknowledgements;
- soft-delete retaining media;
- restore reusing media;
- correction revision media remaining private until approval;
- hard-delete enqueueing durable media purge;
- DEC-081 scope: lifecycle cleanup is separate from FEAT-007 year-end VERIFIED archive gate;
- no FEAT-007 year-end purge implementation in Phase 1;
- signed URLs are not persisted in database/local draft metadata.

These observations do not override the blocking authorization finding above.

---

## Verification evidence reviewed

- Package `SHA256SUMS.txt` was independently checked: package files matched.
- RC1 includes implementation evidence reporting **155 local automated tests passed, 0 failed**.
- The supplied report correctly marks browser/device/Deno/live Auth-RLS-R2-CORS-cron gates as **NOT RUN / PARTIAL**.
- An independent full test rerun in the review environment could not be completed because dependency installation timed out and left `node_modules` incomplete. The resulting test failures were missing-module failures, not product-test assertions.

Live gates therefore remain release-verification requirements and are not treated as proof of production readiness.

---

## Re-review requirements

Submit RC2 with:

1. backend fix for Monitor English-group image isolation;
2. explicit Monitor English-group regression test;
3. fresh FEAT-006 verification output;
4. FEAT-001→006 regression output;
5. updated Implementation Report describing the fix and confirming no business-rule change.

After RC2, Sol should re-review the actual code/diff and test evidence.

---

**SOL RESULT: REQUEST_CHANGES**
