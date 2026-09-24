# FINAL SPEC — SEC-SQL-HARDENING-003

STATUS: FINAL
ASTRA_EFFORT: LOW

## Objective

Remove direct authenticated execution of the internal cron-only SECURITY DEFINER function public.sync_revision_overdue_reports() while preserving the existing pg_cron maintenance job.

## Current verified behavior

- function is SECURITY DEFINER
- PUBLIC execute: false
- anon execute: false
- authenticated execute: true
- service_role execute: true
- function performs a cross-class UPDATE that marks eligible needs_revision registrations overdue
- active cron job so-tu-hoc-sync-revision-overdue invokes it every minute
- no application source reference was found
- no trigger/view/other-function dependency was found
- no PostgREST request for this RPC was found in the available current logs
- analogous internal maintenance functions sync_stale_ai_reviews(), sync_week_statuses(), and homework_maintenance() already deny authenticated EXECUTE

## Required behavior

After hardening:

- PUBLIC execute: false
- anon execute: false
- authenticated execute: false
- service_role execute: true
- pg_cron job 22 remains active with the same schedule and command
- function body remains byte/definition equivalent
- no data mutation is performed by the hardening step itself

## Canonical migration

Create via Supabase CLI migration new; do not invent timestamp.

Mutation SQL only:

revoke execute on function public.sync_revision_overdue_reports() from public, anon, authenticated;

Do not replace the function body.

## Verification

Before and after:

- capture md5(pg_get_functiondef(...))
- capture ACL
- capture cron job id/name/schedule/command/active

After:

- function MD5 unchanged
- authenticated_execute=false
- service_role_execute=true
- cron job unchanged

## Safety / release gate

No db reset. No destructive DDL. No application deployment.

This is a production authorization change. Execute on production only after explicit user release approval for SEC-SQL-HARDENING-003.
