# FEAT-010 RC9 revision 2 — R-009 / R-010 regression contract

This file is the runtime-test contract that must be integrated into the existing
`tests/feat-010/database.test.mjs` / PGlite harness when the RC8 source tree is
available. Static trigger-text assertions are **not** sufficient for release approval.

Required cases, incorporating the SOL RC8 R-009 review and SOL RC9-patch R-010 review:

1. **Active-year empty class** — a class with no FEAT-010 history and no existing
   FEAT-004 delete blockers still deletes exactly as before.
2. **Active-year class with Device Policy history** — create at least one lock
   interval and ALLOW override, then execute the real parent path:
   `DELETE FROM classes WHERE id = $1`. The delete succeeds and FEAT-010 child rows
   disappear through FK cascade.
3. **Cascade cleanup consistency** — after case 2, assert no rows remain for the
   deleted class in `device_use_lock_intervals`, `device_use_session_overrides`,
   and `device_use_policy_signals` where applicable.
4. **Frozen-year direct child delete** — direct `DELETE` of an interval while the
   parent class still exists in a non-writable year remains rejected by
   `device_use_assert_year_writable()`.
5. **Archived-year parent class delete** — real `DELETE FROM classes ...` remains
   rejected by FEAT-007's parent-level class guard. RC9 must not become archive
   policy owner.
6. **Frozen OLD → active NEW UPDATE** — an UPDATE that changes `class_id` from a
   frozen/archived owner to an active owner is rejected because OLD ownership is
   still checked.
7. **Active OLD → frozen NEW UPDATE** — an UPDATE that changes `class_id` from an
   active owner to a frozen/archived owner is rejected because NEW ownership is
   checked.
8. **Active OLD → active NEW UPDATE** — if a direct maintenance re-parenting path
   is intentionally supported and all relational constraints are satisfied, the
   ownership freeze guard itself does not reject the update.
9. **Mutation M51** — remove the parent-missing DELETE bypass. Case 2 must fail.
10. **Mutation M52** — remove the OLD-side UPDATE assertion. Case 6 must fail.
11. **FEAT-004 regression** — the existing class-management suite remains green,
    including the "empty class can delete / non-empty class blocked" contract.
12. **Full regression** — all FEAT-010 and legacy suites stay green.

## M51 — restore the RC8 cascade defect

```diff
-    if not exists (
-      select 1 from public.classes c where c.id = old.class_id
-    ) then
-      return old;
-    end if;
+    -- parent-missing bypass removed
```

Expected: parent `DELETE FROM classes` with FEAT-010 history fails when the child
freeze trigger tries to resolve the already-disappearing parent.

## M52 — remove the OLD-side UPDATE freeze check

```diff
-  if tg_op = 'UPDATE'
-     and old.class_id is distinct from new.class_id
-  then
-    perform public.device_use_assert_year_writable(old.class_id);
-  end if;
+  -- OLD ownership no longer checked
```

Expected: frozen OLD → active NEW re-parenting is no longer rejected, so case 6
must fail under the mutation.
