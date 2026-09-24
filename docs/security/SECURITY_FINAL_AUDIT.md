# SECURITY-FINAL-AUDIT — FINAL SPEC / CURRENT FINDINGS

STATUS: FINAL

## Objective

Close the remaining Supabase security backlog by distinguishing actionable vulnerabilities from intentional/managed warnings. No production mutation is authorized by this audit itself.

## Current Supabase Security Advisor

Observed on 2026-09-24:

- 34 × INFO — RLS enabled, no policy
- 1 × WARN — pg_net extension reported in public schema
- 44 × WARN — authenticated users can execute SECURITY DEFINER functions
- 1 × WARN — leaked password protection disabled

## RLS-no-policy disposition

Previously verified for all 34 tables:

- RLS enabled
- anon has no SELECT/INSERT/UPDATE/DELETE
- authenticated has no SELECT/INSERT/UPDATE/DELETE

These tables are intentionally accessed through privileged RPC/service paths. Adding dummy allow policies only to silence the advisor is forbidden.

Disposition: ACCEPTED / NO CHANGE unless a concrete Data API access requirement is introduced.

## pg_net disposition

Production inspection:

- extension version: 0.20.4
- extension metadata schema: public
- relocatable: false
- extension functions live in the net schema
- Supabase-managed helper extensions.grant_pg_net_access() exists
- active cron job feat006-media-cleanup calls net.http_post(...)

Because pg_net is non-relocatable and actively used by production cron, ALTER EXTENSION ... SET SCHEMA is not a valid remediation and drop/recreate would be production-risky.

Disposition: ACCEPTED PLATFORM/EXTENSION WARNING. Do not mutate pg_net without a documented Supabase-supported migration path.

## Leaked-password protection disposition

Supabase documentation states leaked-password protection is available on Pro Plan and above.

Current organization:
- plan: free
- tier: tier_free

Therefore the project cannot close this advisor warning on the current plan.

Disposition: PLAN-LIMITED. Enable immediately if/when the project is upgraded to Pro or above.

## Authenticated SECURITY DEFINER audit

Global observations:

- all 44 warned functions: PUBLIC EXECUTE false
- all 44 warned functions: anon EXECUTE false
- authenticated EXECUTE true
- all inspected functions define an explicit search_path
- anon/authenticated have no CREATE privilege on public schema

Most warned functions are intentional authenticated APIs or authorization/read helpers and contain role/ownership/actor checks directly or through guarded helper functions.

### One hardening candidate

public.sync_revision_overdue_reports():

- SECURITY DEFINER
- authenticated EXECUTE true
- performs cross-class maintenance UPDATE
- has no caller authorization guard
- is invoked by active pg_cron job so-tu-hoc-sync-revision-overdue every minute
- no trigger/view/other function dependency was found
- analogous internal cron functions already deny authenticated EXECUTE:
  - sync_stale_ai_reviews()
  - sync_week_statuses()
  - homework_maintenance()

Recommended change:
revoke EXECUTE on public.sync_revision_overdue_reports() from authenticated while preserving its cron execution path.

This change is a production authorization change and requires its own migration/release approval.

## Acceptance

Security backlog is considered triaged when:

1. RLS-no-policy entries have verified no client table privileges.
2. pg_net is documented as non-relocatable and operationally depended upon.
3. leaked-password warning is documented as Free-plan limited.
4. authenticated SECURITY DEFINER functions are audited; any concrete hardening candidate is separated into an explicit migration task.
