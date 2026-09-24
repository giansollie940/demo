# FEAT-010 RC1 → RC2 — fix report

**Sol RC1 result:** `REQUEST_CHANGES` — three blocking (P1, P2, P3), one
authorization-scope finding (§8), one medium UI finding (§9), one non-blocking
UX observation (§10), one packaging defect (§2).

Every finding was correct. Each was reproduced with a failing test **before**
anything was changed; the seven reproductions are in the suite and each of them
failed on RC1:

```
not ok 33 - RC1-P1 override tạo khi slot chưa khoá phải bị từ chối
not ok 34 - RC1-P1 override của chu kỳ khoá cũ không sống lại ở chu kỳ khoá mới
not ok 35 - RC1-P2 state phải dùng lịch hiệu lực của tuần, không phải lịch nền
not ok 36 - RC1-P2 buổi bị lịch tuần gỡ bỏ thì không còn trong state
not ok 37 - RC1-P3 hàm trợ giúp SECURITY DEFINER không được lộ ra cho client
not ok 38 - RC1-§8 history chỉ dành cho người quản lý lớp; state của học sinh…
not ok 39 - RC1-§10 state phân biệt trạng thái lịch sử của buổi với trạng thái hiện tại
# pass 32
# fail 7
```

No business rule changed. DEC-114 / DEC-115 stand as ratified; DEC-116 stands as
accepted-in-concept.

---

## P1 — an ALLOW override with no lock to be an exception to

### Reproduced first

Both halves of the finding, including the sequence Sol flagged in the "stronger
recommendation":

```
Lock A → ALLOW → Unlock A → Lock B  ⇒  buổi vẫn mở dưới chu kỳ B
```

The override from cycle A matched cycle B's session because it was keyed by
`(class, week, weekday, period)` — nothing tied it to the lock it was an
exception to.

### The fix: take Sol's stronger recommendation, not the narrow one

The narrow fix is a guard in the RPC: require
`device_use_policy_state(...) = 'locked'` before inserting. That closes the
first half. It does not close the second, because the override is still a
standalone permission for a calendar session and a later lock cycle will find
it again.

So the override now **belongs to an interval**:

```sql
interval_id uuid not null references public.device_use_lock_intervals(id) on delete cascade
```

and the evaluation reads it through that reference:

```sql
v_interval := public.device_use_locking_interval(class, week, weekday, period, v_start);
if v_interval is null then return 'open'; end if;

select exists(select 1 from public.device_use_session_overrides o
               where o.interval_id = v_interval and …) into v_override;
```

`device_use_locking_interval()` is the one place BR-010-005 is written — see the
harness note below for why that matters more than it looks.

Three things follow, none of which anyone has to remember:

- **an override cannot exist without a lock**, because `interval_id` is
  `NOT NULL` — the requirement is now in the column type, not in a check
  someone can forget to write;
- **an override cannot outlive its cycle**, because a later interval is a
  different row;
- **the unique index moves with it** — one live override per
  `(interval_id, week, weekday, period)`, so two cycles may each leave one for
  the same calendar session without colliding, and only the one attached to the
  interval that actually locks the session applies.

`allow_session` resolves the covering interval itself and refuses when there is
none:

```
DEVICE_POLICY_SESSION_NOT_LOCKED (42501)
```

Since the intervals for one slot can never overlap — the partial unique index
allows only one open interval, so a new one cannot start before the previous
one is closed — at most one interval covers any given session, and
`order by locked_at desc limit 1` is a formality rather than a choice.

### The test that was wrong, and how

The first version of the P1 test checked only the case Sol described literally:
no interval at all, override refused. Mutation **M20** — make `allow_session`
bind to *any* interval for the slot instead of the covering one — passed it.

That is a defective test, not a harmless mutation: with a released interval
still in the history, the RPC would attach an override to a stale cycle and
report success for a session that is plainly open. The test now covers that
exact shape (lock, unlock, then try to allow a future session), and M20 fails.

---

## P2 — the policy page and the registration page disagreed about which sessions exist

### Reproduced first

A Wednesday period 3 that exists **only** in week 8's `week_schedule_overrides`
shows on the registration page and does not appear in `device_use_policy('state')`.
The frontend treats a missing slot as open, so the student sees an enabled
checkbox with no explanation while the trigger is already forcing
`effective_uses_electronic_device = false`. Backend and screen disagree, which
is BR-010-012 and AC-010-014 both.

The mirror case reproduced too: a base slot removed by a week override kept
appearing on the teacher's page.

### The fix

`state` no longer reads `study_schedule`. The week's session list now comes from
`public.device_use_week_slots(class, week)`, which uses the precedence the system
already has — the one inside `class_week_effective_status()` and the one
RegistrationPage follows:

```
if the class has any week_schedule_overrides row for this week:
    that week's active overrides
else:
    the base study_schedule
```

Sol's instruction was "do not maintain two different definitions of which
sessions exist this week", so there is a test that pins the new function to the
existing one: it runs `class_week_effective_status()`'s own subquery and
requires the same slot set, with and without week overrides, including a week
where one override row is `is_study_period = false`. The single deliberate
difference is `distinct` — `week_schedule_overrides` has no unique constraint,
which is harmless where the existing function takes `max()` and would produce
duplicate slots here. That is stated in the migration next to the code.

---

## P3 — a second API surface that skipped the authorization

### Reproduced first

`device_use_policy_state` and `device_use_effective` are `SECURITY DEFINER` and
carry **no** authorization of their own — it lives in the wrapper. RC1 granted
`EXECUTE` on both to `authenticated` and never revoked the default `PUBLIC`
grant, so any signed-in user could call them directly for any class:

```
select public.device_use_policy_state('<another class>', …)
```

Because they are `SECURITY DEFINER`, table RLS is not a backstop.

### The fix

They are implementation helpers, so they are no longer reachable from a client:

```sql
revoke all on function public.device_use_policy_state(…)   from public, anon, authenticated;
revoke all on function public.device_use_effective(…)      from public, anon, authenticated;
revoke all on function public.device_use_week_slots(…)     from public, anon, authenticated;
revoke all on function public.device_use_slot_key(…)       from public, anon, authenticated;
revoke all on function public.device_use_recompute(…)      from public, anon, authenticated;
```

The trigger and the wrapper still reach them, as the function owner. The only
client-callable entry point is `device_use_policy(text, jsonb)`, which checks
the class first.

A test reads that back out of the catalog rather than trusting the `revoke`
lines, and it covers the case the obvious query misses — a leftover `PUBLIC`
grant has grantee `0`, which does not join to `pg_roles`:

```
[ { proname: 'device_use_policy', grantee: 'authenticated' } ]
```

One row, and it is the wrapper. A future FEAT-010 function added without a
revoke fails this, which a single mutation on a single grant would not.

`revoke ... from public` alone would be enough — `anon` and `authenticated`
inherit through `PUBLIC` — but all three are named so the intent survives a
reader who does not have that rule to hand.

---

## §8 — students could read who pressed which button

### Reproduced first

RC1 grouped `state` and `history` under one permission check and let a student
of the class `SELECT` the policy tables directly. Both carry `locked_by`,
`unlocked_by`, `created_by`, `revoked_by` and their timestamps.

### The fix

- `history` → `can_manage_class` only. A student or monitor calling it gets
  `42501`.
- Direct `SELECT` on both policy tables → `can_manage_class` only.
- `state` stays available to a student of the class, but **the row shape depends
  on the caller**: a manager gets `current_recurring_state`, `locked_at` and
  `override_id`; anyone else gets exactly `weekday`, `period_number`, `state`,
  `session_start` — what the screen needs to explain a disabled checkbox, and
  nothing about who did it.

The test asserts the student's key set exactly, so a field added to the manager
branch cannot quietly appear in the student one.

All six of Sol's required security tests are present: student cannot call
`history`; student cannot read the raw tables; student cannot inspect another
class; the assigned teacher can; Admin stays read-only (already covered);
and `anon` can execute none of the five functions.

---

## §9 — an open student page never heard about a Lock

### Reproduced first

A Lock on a slot with no registrations yet updates no registration row, so no
`registrations` realtime event is emitted, so nothing invalidates the cached
policy query. `staleTime: 20_000` does not refetch a mounted query on its own.
The student keeps seeing an enabled checkbox until something else happens to
refetch — backend enforcement holds, but the screen is wrong.

### The fix

Both policy tables joined the realtime subscription in
`public/supabase-service.js`, and `useRealtimeInvalidation` gained a branch for
them. The rule was extracted so it could be tested as a rule rather than grepped
for:

```ts
export function devicePolicyInvalidations(table:unknown):string[][]|null
```

It returns `[['device-policy'], ['week-data']]` for the two policy tables and
`null` for everything else. `week-data` is in the list because the recompute
that follows a Lock also rewrites `effective_uses_electronic_device` on existing
registrations for that slot.

Deliberately **not** added to `structuralTables`: that path does a full state
reload plus a blanket `invalidateQueries()`, which is far more than a policy
change needs.

---

## §10 — the Lock/Unlock button followed the wrong question

Sol filed this as non-blocking. It is fixed anyway, because the failure mode is
a teacher pressing a button that does nothing.

`state` answers "what was the policy for the selected week's session". The
button asks "is this slot locked right now". For an old week that sat inside an
interval since released, the first is `locked` and the second is `open` — and
RC1 showed "Mở từ bây giờ" for a slot with nothing open to unlock.

`state` now returns both, for managers:

```
state                    → the selected week's session (historical, unchanging)
current_recurring_state  → is there an open interval on this slot now
```

`deviceSlotRows()` exposes it as `recurringLocked` and the page derives the
button from that. The fallback is the safe direction: with no answer — which is
what a student's sanitized row looks like — `recurringLocked` is `false`, so the
page offers Lock rather than a no-op Unlock. Mutation M26 makes
`current_recurring_state` echo `state` again and is caught.

---

## §2 — the manifest listed itself

`SHA256SUMS.txt` contained an entry for `SHA256SUMS.txt`, recording the hash of
the empty file it was before being written:

```
e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855  SHA256SUMS.txt
```

A manifest cannot contain its own hash. `scripts/package-feat010.mjs` now
excludes it by construction, and its own integrity is carried by the hash of the
ZIP that contains it, which is recorded in the release note instead.

```
$ sha256sum --quiet -c SHA256SUMS.txt
MANIFEST VERIFIES CLEAN          (620 entries, 0 failures)
```

---

## Verification

`node scripts/verify-feat010.mjs` — **18/18 PASS, 381 tests, 0 FAIL** (RC1: 367).

| Suite | RC1 | RC2 |
|---|---:|---:|
| FEAT-010 policy SQL | 32 | **42** |
| FEAT-010 frontend | 14 | **18** |
| FEAT-007 archive SQL | 54 | 54 |
| FEAT-007 archive/viewer frontend | 33 | 33 |
| FEAT-008 storage SQL | 20 | 20 |
| FEAT-008 SQL on migration 12 | 20 | 20 |
| FEAT-008 dashboard UI | 9 | 9 |
| FEAT-006 SQL | 13 | 13 |
| FEAT-006 SQL on migration 12 | 13 | 13 |
| FEAT-005 SQL on migration 12 | 13 | 13 |
| FEAT-006 frontend | 10 | 10 |
| FEAT-005 under migration 10 | 13 | 13 |
| FEAT-001/002 legacy SQL | 43 | 43 |
| FEAT-004 SQL | 6 | 6 |
| Static frontend regression | 10 | 10 |
| Existing FEAT-001–005 frontend | 64 | 64 |
| **Total** | **367** | **381** |

Typecheck PASS, production build PASS.

### Mutation testing

Eight new mutations cover the RC2 fixes, on the same bar: a mutation no test
notices is a defective test.

| # | Mutation | Failing tests |
|---|---|---:|
| M20 | P1: `allow_session` binds to any interval, not the covering one | 1 |
| M21 | P1: evaluate overrides by class+week+slot again — the revive bug | 1 |
| M22 | P2: `state` goes back to the base schedule | 2 |
| M23 | P3: grant `EXECUTE` on the helpers back to clients | 2 |
| M24 | §8: `history` shares the `state` permission check | 1 |
| M25 | §8: `state` returns the manager shape to everyone | 1 |
| M26 | §10: `current_recurring_state` echoes `state` | 1 |
| M27 | §8: reopen direct table reads to students of the class | 2 |

M20 escaped on the first run. It was a defective test, and it is recorded above
rather than explained away.

### The mutation harness was also wrong, and it hid three mutations

Running the full set after the RC2 edits produced this:

```
M2    0 failing  *** NOT CAUGHT ***  BR-010-005: khoá hồi tố … (> thành >=)
M3    0 failing  *** NOT CAUGHT ***  BR-010-005: mở khoá hồi tố … (<= thành <)
M4    1 failing  CAUGHT              (đã từng là 7)
M10  38 failing  CAUGHT              (đã từng là 1)
```

None of that was the migration's fault. The P1 fix had added a **second** copy
of the BR-010-005 boundary — one in the evaluator, one in `allow_session` — and
the mutation helper only asserted that its snippet was *present*:

```js
if (!text.includes(find)) throw new Error(…)
```

A `find` indented six spaces also occurs inside a line indented seven. So M2,
M3 and M4 stopped mutating the evaluator, silently moved to the RPC's copy, and
still reported "applied". M10's snippet had been edited by the §8 fix, so it
threw and every test failed — which the runner read as 38 catches.

The file's own header claims "a mutation cannot silently become a no-op when the
migration is edited". That claim was false. Two fixes:

1. **The helper counts.** `replace(find, put, expected = 1)` requires the snippet
   to occur exactly that many times and fails loudly otherwise. Presence is not
   the same question as site.
2. **The rule has one home.** Two copies of BR-010-005 is the actual defect —
   the mutation confusion was the symptom. `public.device_use_locking_interval(
   class, week, weekday, period, session_start)` now answers "which interval
   locks this session", and both the evaluator and `allow_session` ask it. The
   boundary appears once in the file.

Sol did not raise this; it surfaced because the run was repeated after the
changes rather than trusted from before them. Worth stating plainly: had the
full set not been re-run, RC2 would have shipped with three mutations quietly
testing nothing.

---

## Changed files, RC1 → RC2

| File | Change |
|---|---|
| `database/upgrade/13-FEAT-010-DEVICE-USE-LOCK.sql` | `device_use_locking_interval()` as the single home of the BR-010-005 boundary; `interval_id` on overrides and the unique index that follows it; `device_use_week_slots()`; `state` uses it, returns `current_recurring_state`, and sanitizes for non-managers; `history` manager-only; `allow_session` resolves and requires the covering interval; helper `EXECUTE` revoked; policy-table RLS manager-only |
| `src/realtime/useRealtimeInvalidation.ts` | `devicePolicyInvalidations()` and the branch that uses it |
| `public/supabase-service.js` | both policy tables added to the realtime subscription |
| `src/features/registrations/device-policy.ts` | `current_recurring_state` on the slot type, optional manager-only fields, `recurringLocked` on the row model |
| `src/pages/DevicePolicyPage.vue` | Lock/Unlock derived from `recurringLocked`; a line for the released-interval case |
| `scripts/package-feat010.mjs` | **new** — manifest without a self-entry, and staging for both ZIPs |
| `tests/feat-010/database.test.mjs` | 10 tests added (7 reproductions, the week-slot agreement test, the anon/cross-class security test, and a catalog assertion that exactly one FEAT-010 function is client-callable); 3 existing tests updated for the new authorization model |
| `tests/feat-010/ui.test.ts` | 4 tests added |
| `tests/feat-010/mutations.mjs` | M20 → M27; the helper now counts occurrences instead of testing presence; M2/M3/M4/M10 re-targeted |

---

## Unchanged, and deliberately so

The release gates in `DEPLOYMENT.md` §4 are unchanged, and Sol's §12 list is the
same list. The one that matters most remains: **pglite runs a single connection,
so nothing here proves two-connection serialisation of Lock vs registration
write.** That is still a release gate, not a test result.
