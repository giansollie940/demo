-- FEAT-010 RC9 revision 2 — R-009 cascade-safe school-year freeze guard
-- Scope: reconcile FEAT-010 child-table freeze triggers with FEAT-004 class deletion
-- while preserving the RC6/RC7 two-sided UPDATE hard-freeze invariant.
--
-- Business semantics are unchanged:
--   * direct FEAT-010 INSERT/UPDATE/DELETE still requires writable ownership;
--   * UPDATE that changes class_id checks BOTH NEW and OLD ownership;
--   * parent class deletion in an active year is governed by FEAT-004 and cascades;
--   * archived/frozen-year class deletion is governed by FEAT-007 at the parent row.

begin;

create or replace function public.device_use_year_freeze_guard_rc9()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- R-009: a DELETE on a FEAT-010 child row may itself be caused by
  -- classes(id) ON DELETE CASCADE. In that specific shape the parent class row
  -- is already unavailable to this child trigger. FEAT-004/FEAT-007 own the
  -- parent-class lifecycle decision, so the child trigger must not re-resolve
  -- the disappearing parent merely to decide the cascade.
  --
  -- A direct child DELETE still sees its parent and therefore continues through
  -- device_use_assert_year_writable(OLD.class_id), preserving the hard freeze.
  if tg_op = 'DELETE' then
    if not exists (
      select 1
      from public.classes c
      where c.id = old.class_id
    ) then
      return old;
    end if;

    perform public.device_use_assert_year_writable(old.class_id);
    return old;
  end if;

  -- INSERT and UPDATE always validate the NEW owner.
  perform public.device_use_assert_year_writable(new.class_id);

  -- R-010 regression guard: RC6/RC7 deliberately validated both ownership
  -- sides when class_id changes. Without this OLD-side check, a privileged
  -- UPDATE could move a row out of a frozen year into an active year and bypass
  -- the database hard-freeze boundary.
  if tg_op = 'UPDATE'
     and old.class_id is distinct from new.class_id
  then
    perform public.device_use_assert_year_writable(old.class_id);
  end if;

  return new;
end;
$$;

-- Replace only the FEAT-010 freeze triggers. No policy table, FK, RPC or
-- frontend contract changes are made by RC9.
drop trigger if exists trg_00_device_use_year_freeze
  on public.device_use_lock_intervals;
create trigger trg_00_device_use_year_freeze
  before insert or update or delete
  on public.device_use_lock_intervals
  for each row
  execute function public.device_use_year_freeze_guard_rc9();

drop trigger if exists trg_00_device_use_year_freeze
  on public.device_use_session_overrides;
create trigger trg_00_device_use_year_freeze
  before insert or update or delete
  on public.device_use_session_overrides
  for each row
  execute function public.device_use_year_freeze_guard_rc9();

-- Trigger function is not a client RPC.
revoke all on function public.device_use_year_freeze_guard_rc9()
  from public, anon, authenticated, service_role;

commit;
