-- Sổ Tự Học installer — step 3: scheduled jobs.
-- {{PROJECT_URL}} and {{MEDIA_SECRET}} are filled in by the installer (as SQL string literals).
-- The photo clean-up job lives in 31-media-cleanup-job.sql: it is only scheduled when R2 is set up.
-- Safe to run again: secrets are updated in place and cron.schedule replaces a job of the same name.

do $vault$
declare
  wanted constant jsonb := jsonb_build_object(
    'feat006_project_url', {{PROJECT_URL}},
    'feat006_cleanup_secret', {{MEDIA_SECRET}});
  k text;
  existing uuid;
begin
  for k in select jsonb_object_keys(wanted) loop
    select id into existing from vault.secrets where name = k;
    if existing is null then
      perform vault.create_secret(wanted->>k, k);
    else
      perform vault.update_secret(existing, wanted->>k);
    end if;
  end loop;
end
$vault$;

select cron.schedule('so-tu-hoc-sync-revision-overdue', '* * * * *', 'select public.sync_revision_overdue_reports();');
select cron.schedule('so-tu-hoc-sync-stale-ai-reviews', '* * * * *', 'select public.sync_stale_ai_reviews();');
select cron.schedule('so-tu-hoc-sync-week-statuses', '*/15 * * * *', 'select public.sync_week_statuses();');
select cron.schedule('homework-backlog-feat001', '* * * * *', 'select public.homework_maintenance()');
