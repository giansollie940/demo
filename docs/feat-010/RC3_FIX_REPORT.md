# FEAT-010 RC2 → RC3 — fix report

**Sol RC2 result:** `REQUEST_CHANGES` — one remaining blocker (§8): Student and
Monitor clients cannot receive realtime events from the policy tables, because
RC2 made those tables manager-only and Supabase Postgres Changes applies RLS
when it delivers.

Sol confirmed RC1's P1, P2, P3, §8 and §10 as RESOLVED, and the packaging defect
as fixed (678/678 manifest entries matched). RC3 is narrow: it replaces the
realtime mechanism and nothing else.

---

## The finding, and the fact that I caused it

RC2 did two things in the same round:

- **§8:** closed direct reads on `device_use_lock_intervals` and
  `device_use_session_overrides` to class managers, because those rows carry
  `locked_by`, `unlocked_by`, `created_by`, `revoked_by`;
- **§9:** subscribed the frontend to those same two tables so a student's open
  page would hear about a Lock.

Each is right on its own. Together they cancel: Postgres Changes only delivers a
row to a client allowed to `SELECT` it, so the audience §9 existed for was
exactly the audience §8 had just excluded. I shipped a fix that could not work
and a test — `devicePolicyInvalidations(table)` — that could not notice, because
it tested the handler's branching and never the delivery.

Sol is right that a unit test on the invalidation helper proves nothing about
delivery through RLS. The RC3 tests below check the property that actually has
to hold: **there exists a row a student of the class is allowed to read, it
changes on every policy change, and it carries nothing about who made it.**

### Reproduced first

```
not ok 43 - RC2-§8 học sinh phải quan sát được "policy vừa đổi" qua thứ em ấy được phép đọc
not ok 44 - RC2-§8 tín hiệu chỉ ghi được qua RPC, không ghi thẳng được
# pass 42
# fail 2
```

---

## The fix: Sol's Option A, plus the cheap half of Option C

### Option A — a sanitized signal

```sql
create table public.device_use_policy_signals(
  class_id   uuid primary key references public.classes(id) on delete cascade,
  version    bigint not null default 1,
  changed_at timestamptz not null default now()
);
```

Three columns, and the absence of a fourth is the point: there is no actor
column and no foreign key to `profiles`, so letting a student of the class read
it does not reopen what §8 closed. The policy tables stay manager-only, exactly
as Sol required.

```sql
create policy device_use_policy_signals_select_v010 on public.device_use_policy_signals
  for select to authenticated
  using (coalesce(public.can_manage_class(class_id)
                  or class_id = public.current_student_class_id(), false));
```

`device_use_bump_signal(class_id)` upserts and increments; the RPC calls it after
every `lock`, `unlock`, `allow_session` and `revoke_allow` that actually changed
something. No write policy exists, so the only way the signal moves is through
the RPC — a student cannot forge one, and `service_role` is granted separately.

`replica identity full` is set. The policy only needs `class_id`, which is the
primary key, so the default would do; three columns make the explicit form free
and remove a thing to reason about.

The signal is **never** the source of truth. The client receives it and re-calls
`device_use_policy('state', …)`, which sanitizes by role — so the student's
refetch returns the same four fields RC2 already established.

### Why not Option B (Broadcast)

Broadcast is the more modern answer and would also work. It needs
`realtime.send()` and RLS policies on `realtime.messages` — a schema the harness
does not have, so the authorization would be assertable only by reading the
migration rather than by running it. Option A reuses the Postgres Changes
pipeline this app already runs, and every part of it is testable in pglite:
the RLS policy, the bump, the row's shape, the write refusal. Given the choice
between a mechanism I can test and one I can only describe, I took the first.

### Plus the cheap half of Option C, deliberately

Realtime delivery depends on an operator adding the table to the
`supabase_realtime` publication — Sol measured `puballtables = false` on
production, so nothing lands there automatically. A screen being correct should
not depend on a dashboard toggle. So there are three independent ways back to
the truth, in order of immediacy:

1. the realtime signal;
2. `refetchOnWindowFocus` on the policy query;
3. **a refetch the moment the registration dialog opens** — the one that matters
   most, because it means the checkbox a student is about to tick was checked
   against the server immediately before they saw it.

If the operator forgets step 2b of the runbook, the feature is less immediate
and still correct. Polling was left out: with (3) in place it would cost
requests to shorten a window that only exists on an idle page.

---

## What changed on the frontend

The subscription no longer lists the two policy tables at all — keeping them
would be dead weight that also suggests a dependency that must not exist:

```js
// FEAT-010: tín hiệu, không phải hai bảng policy.
"device_use_policy_signals"
```

`devicePolicyInvalidations()` now returns the two query keys for the signal
table and `null` for the policy tables, and the test asserts **both halves** —
that the signal is handled and that the manager-only tables are not.

---

## Sol's §11 required tests

| # | Required | Where |
|---|---|---|
| 1 | Student cannot SELECT raw policy tables | `30 §13 …` (RC2) |
| 2 | Student observes a policy-change signal | `RC2-§8 học sinh phải quan sát được…` |
| 3 | Lock → student refetches | signal bumps on `lock`; `RC2-§8 mở hộp thoại thì hỏi lại máy chủ` |
| 4 | Same for Unlock | signal bumps on `unlock` |
| 5 | Same for ALLOW / revoke | signal bumps on both |
| 6 | Slot with no existing registration still updates | the signal is per class and does not read `registrations` at all — the scenario in the reproduction test has no registration |
| 7 | Student sees only sanitized `state` | `RC1-§8 …` (RC2), key set asserted exactly |
| 8 | Teacher/Admin history unchanged | `RC1-§8 …`, `18 DEC-109 …` |
| 9 | Publication requirement verified in preflight | `DEPLOYMENT.md` §0 (b2) records the current publication, §3 step 2b names the one table to add and gives the SQL that confirms it |

**What these do not prove, stated plainly:** pglite has no Realtime server, so
nothing here exercises an actual WebSocket delivery through RLS. The tests prove
the database-side precondition — the row exists, a student may read it, it moves
on every change, it leaks nothing — and the frontend-side wiring. Two real
browser sessions remain a release gate, and it is in `DEPLOYMENT.md` §3 step 2b
and in Sol RC2 §13.

---

## Verification

`node scripts/verify-feat010.mjs` — **18/18 PASS, 384 tests, 0 FAIL** (RC2: 381).

| Suite | RC2 | RC3 |
|---|---:|---:|
| FEAT-010 policy SQL | 42 | **44** |
| FEAT-010 frontend | 18 | **19** |
| everything else | 321 | 321 |
| **Total** | **381** | **384** |

Typecheck PASS, production build PASS.

### Mutation testing

**33/33 caught.** Six new:

| # | Mutation | Failing tests |
|---|---|---:|
| M28 | signal is manager-only too — students still get nothing | 1 |
| M29 | Lock does not bump the signal | 1 |
| M30 | Unlock does not bump the signal | 1 |
| M31 | allow / revoke do not bump the signal | 1 |
| M32 | signal gains a `changed_by` column | 1 |
| M33 | clients may write the signal directly | 2 |

**M32 escaped on the first run**, and again the test was at fault: the helper
read `select class_id, version, changed_at`, so asserting the key set proved
only that I had listed three columns. A client reads the whole row, so the test
now does `select *`, and a second assertion reads `pg_constraint` and requires
that the table have no foreign key to `profiles` at all — which catches an actor
column under any name.

That is the fourth defective test this feature has produced (M8 and M15 in RC1,
M20 in RC2, M32 now). The pattern is the same each time: an assertion written
against the shape the code already had, rather than against the property. Worth
recording as a pattern, not as four separate incidents.

### And the runner lied a third time, so it no longer can

Adding the bump call put a line between the two lines M5 and M6 target, so both
stopped matching and threw — which fails every test, which the runner read as an
emphatic catch:

```
M5   41 failing  CAUGHT  Lock không tính lại các đăng ký đã có
M6   41 failing  CAUGHT  Unlock không tính lại các đăng ký đã có
```

RC2 fixed the *helper* to count occurrences, which turns a silent re-target into
a throw. It did not fix the *runner*, which cannot tell a throw from a catch. It
can now: a mutation that failed to apply gets its own verdict and its own line
in the summary, and it counts against the total rather than for it.

```
const broken = /mutation (?:phải khớp|không tìm thấy|tên)/.test(output);
```

Three rounds, three times this mechanism produced a false green. It is fixed at
the level where it can no longer recur — the runner, not the individual
mutations.

---

## Changed files, RC2 → RC3

| File | Change |
|---|---|
| `database/upgrade/13-FEAT-010-DEVICE-USE-LOCK.sql` | `device_use_policy_signals` + its RLS and grants; `device_use_bump_signal()`; four bump calls in the RPC |
| `public/supabase-service.js` | subscription now lists the signal table and not the two policy tables |
| `src/realtime/useRealtimeInvalidation.ts` | `devicePolicyInvalidations()` keyed on the signal table |
| `src/features/registrations/device-policy-queries.ts` | `refetchOnWindowFocus`; new `useDevicePolicyOnOpen()` |
| `src/pages/RegistrationPage.vue` | refetch when the dialog opens |
| `docs/feat-010/DEPLOYMENT.md` | preflight records the publication; step 2b names the signal table and the SQL that confirms it; the RLS-count check; rollback drops the new table and function |
| `tests/feat-010/database.test.mjs` | 2 tests added |
| `tests/feat-010/ui.test.ts` | the RC1 realtime tests replaced by three RC3 ones |
| `tests/feat-010/mutations.mjs` | M28 → M33 |

---

## Unchanged

DEC-114 and DEC-115 stay RATIFIED, DEC-116 stays ACCEPTED IN CONCEPT. Sol RC2
§13's release gates are unchanged, and the two-connection Postgres test is still
the biggest of them.
