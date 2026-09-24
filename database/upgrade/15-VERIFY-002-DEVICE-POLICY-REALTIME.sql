-- VERIFY-002 / FEAT-010 RC9
-- Minimal production configuration change required by V-007.
-- The FEAT-010 frontend subscribes to Postgres Changes on the signal table.
-- Do not recreate the publication and do not modify any unrelated membership.

alter publication supabase_realtime
  add table public.device_use_policy_signals;
