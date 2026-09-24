# FEAT-010 RC3 → RC4 — fix report

**Sol RC3 result:** `REQUEST_CHANGES` — two findings:

- **R-001 (HIGH)** — the user-facing permission model is incomplete. Teacher
  history is not reachable in the app, and Admin has no Device Policy surface at
  all, although FINAL §8 grants both.
- **R-002 (MEDIUM)** — the wrapper's EXECUTE ACL does not match production's
  real default privileges. `anon` receives an *explicit* grant on every new
  function in `public`, so `revoke … from public` does not remove it, and the
  deployment's own ACL invariant is false on production.

Sol confirmed the RC2 realtime blocker as RESOLVED and the packaging as still
clean (698/698). Both findings are correct. Both are fixed.

---

## R-002 — the harness was checking against a fiction

### Verified against production before changing anything

Sol's claim is exact. Read-only on the live project:

```
pg_default_acl, owner postgres, schema public
  functions: {postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
  tables:    {postgres=arwdDxtm/postgres,anon=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}
  sequences: {postgres=rwU/postgres,anon=rwU/postgres,authenticated=rwU/postgres,service_role=rwU/postgres}
```

`anon=X` is an explicit grant, not `PUBLIC` inheritance. So on production:

```
CREATE FUNCTION device_use_policy(...)   → anon gets EXECUTE, explicitly
REVOKE ... FROM public                   → removes PUBLIC only
GRANT EXECUTE ... TO authenticated       → anon still has EXECUTE
```

### Why the test said otherwise, which is the part worth reading

RC2 added a catalog test precisely so the ACL would be *checked rather than
trusted*, and RC3's report said so. It passed — against a harness that had no
`ALTER DEFAULT PRIVILEGES` at all, so in pglite `revoke … from public` really
was sufficient. The test was fine. **The baseline was wrong**, and a test on a
wrong baseline is a confident wrong answer.

That matters more than the missing `anon` on one line. The whole argument for
`tests/feat-010/baseline.sql` is that it was read out of production rather than
written from memory — and I verified that claim for function *bodies*, by md5,
and never for *privileges*. Fidelity was checked where I had thought to check it.

### The fix, in both places

`baseline.sql` now ends with production's rule, with the measurement pasted above
it and a note on exactly what it does and does not claim:

```sql
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
```

It sits at the end deliberately: it governs objects created *after* it, which is
exactly the set migration 13 creates. It makes no claim about the ACL of the
pre-existing tables above it, which production granted at their own time.

With that in place the existing catalog test failed, as it should have all along.
The migration now does a full reset before granting, for **every** function it
creates — including `apply_device_use_policy()`, the trigger function, which a
client cannot call anyway but which was outside the net:

```sql
revoke all on function public.device_use_policy(text,jsonb) from public, anon, authenticated;
grant execute on function public.device_use_policy(text,jsonb) to authenticated;
```

The catalog test no longer matches on the `device\_use%` pattern — that pattern
is what let `apply_device_use_policy` slip out. It now takes the migration's
function list by name and first asserts that all nine exist, so a function added
later without being added to the list fails the test rather than escaping it.

### And the same hole on the tables

The default privileges grant `anon=arwdDxtm` on new **tables** too. The migration
already revoked from `anon` there, but nothing checked it, so a second test now
reads the table ACLs: exactly three rows, `authenticated = SELECT` on each of the
three tables, nothing for `anon` or `PUBLIC` — plus RLS enabled on all three.
Relying on RLS alone would be one forgotten `enable row level security` away from
an open table.

---

## R-001 — a permission that exists only in SQL is not a permission

FINAL §8 says the Teacher may "xem lịch sử lock/unlock/override" and the Admin
"được xem trạng thái/audit để hỗ trợ quản trị". RC3 had `device_use_policy('history')`
working and authorized for both, and:

- `DevicePolicyPage.vue` never called it;
- `/device-policy` was `roles: ['teacher']`, and the router redirects an Admin
  away from every path except `/admin`, `/settings` and `/homework`.

So neither promise was kept in the app. Sol is right that a backend permission is
not a user-facing one.

**My own test made it worse.** RC1 asserted:

```ts
for (const role of ['student', 'monitor', 'admin'])
  expect(labels(role)).not.toContain('Thiết bị điện tử')
```

That is the gap written down as intended behaviour. It would have kept failing
any attempt to fix R-001, which is the opposite of what a test is for. It has
been corrected to assert what §8 actually says: Teacher and Admin see the item,
Student and Monitor do not, and **the thing Admin must not have is the controls**
— which is now its own assertion.

### Teacher

`DevicePolicyHistory.vue` renders one timeline from both history tables, and
`DevicePolicyPage` shows it under the slot grid, refreshed after every successful
Lock/Unlock/ALLOW/revoke.

The flattening is a pure function, `deviceHistoryEvents()`, so it is testable
without a browser. Two tables become four event kinds — and an interval with no
`unlocked_at` must not produce a phantom unlock, which is the one thing a naive
`[locked_at, unlocked_at]` mapping gets wrong. A mutation that introduces exactly
that phantom is caught.

### Admin

A read-only **tab** under Quản trị (`/admin?tab=device`), not the Teacher page
opened up to Admin.

The Teacher page is a page with buttons. Reaching it would mean punching a hole
in the admin router guard and then relying on conditional rendering to keep four
mutation controls away from someone the spec says must not have them — the
cheapest change and the easiest way to grant write access by accident. The admin
panel has no buttons to grant: class and week pickers, the per-slot state, and
the same history component. `AdminDevicePolicy.vue` imports nothing that mutates.

A test asserts none of the four control labels appears anywhere in the rendered
panel, and a mutation that adds one is caught.

### Sol's six required tests

| # | Required | Where |
|---|---|---|
| 1 | Teacher can open Device Policy history | `R-001 giáo viên mở được lịch sử…` |
| 2 | History renders Lock/Unlock/override events | same — all four labels, timestamps, slot names |
| 3 | Admin has a user-facing read-only route/panel | `R-001 Admin có đường vào chỉ-đọc…` |
| 4 | Admin can see state/history | same — the panel renders both sections |
| 5 | Admin cannot see or execute mutation controls | same — none of the four labels; and `18 DEC-109 …` already proves the RPC refuses |
| 6 | Student/Monitor still cannot see history | `RC1-§8 …` (SQL) and the nav test |

---

## Verification

`node scripts/verify-feat010.mjs` — **18/18 PASS, 388 tests, 0 FAIL** (RC3: 384).

| Suite | RC3 | RC4 |
|---|---:|---:|
| FEAT-010 policy SQL | 44 | **45** |
| FEAT-010 frontend | 19 | **22** |
| everything else | 321 | 321 |
| **Total** | **384** | **388** |

Typecheck PASS, production build PASS.

### Mutation testing

**36/36 caught.** Three new on the SQL side:

| # | Mutation | Failing tests |
|---|---|---:|
| M34 | wrapper revoked from `PUBLIC` only — the R-002 bug itself | 1 |
| M35 | trigger function left out of the revoke list | 1 |
| M36 | signal table revoked from `authenticated` only, `anon` keeps DML | 1 |

M34 is the one to note: it is the exact code RC3 shipped, and it now fails.
Before the baseline was corrected it passed.

Three frontend mutations, applied by hand and reverted:

| Mutation | Failing tests |
|---|---:|
| an open interval emits a phantom `unlock` | 1 |
| the Admin nav entry is removed | 2 |
| a "Khóa từ bây giờ" button appears on the Admin panel | 1 |

---

## Changed files, RC3 → RC4

| File | Change |
|---|---|
| `tests/feat-010/baseline.sql` | production's `ALTER DEFAULT PRIVILEGES`, with the measurement and the limits of the claim |
| `database/upgrade/13-FEAT-010-DEVICE-USE-LOCK.sql` | wrapper revoked from `anon` too; `apply_device_use_policy()` added to the revoke list |
| `src/features/registrations/device-policy.ts` | `deviceHistoryEvents()`, `DEVICE_HISTORY_LABEL`, `deviceSlotLabel()` |
| `src/components/registrations/DevicePolicyHistory.vue` | **new** — shared, read-only, no controls |
| `src/components/admin/AdminDevicePolicy.vue` | **new** — Admin read-only panel |
| `src/pages/DevicePolicyPage.vue` | history section, reloaded after each successful action |
| `src/pages/AdminPage.vue` | `device` tab |
| `src/features/navigation/navigation.ts` | Admin entry `/admin?tab=device` |
| `tests/feat-010/database.test.mjs` | ACL test widened to the named function set; new table-ACL + RLS test |
| `tests/feat-010/ui.test.ts` | 3 tests added; the nav test corrected |
| `tests/feat-010/mutations.mjs` | M34 → M36 |

---

## Unchanged

DEC-114 and DEC-115 RATIFIED, DEC-116 ACCEPTED IN CONCEPT. Sol RC3 §7's release
gates stand, including the two-connection Postgres test and the two-browser
realtime check, and the `supabase_realtime` publication step in `DEPLOYMENT.md`.
