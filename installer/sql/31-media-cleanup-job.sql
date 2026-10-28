-- Sổ Tự Học installer — homework photo clean-up, every minute.
-- Scheduled only when Cloudflare R2 is configured: without R2 there are no photos to clean up, and
-- the call would fail every minute. To enable it later, add the four R2_* secrets to the Edge
-- Functions and run this file in the Supabase SQL editor. Safe to run again.
select cron.schedule('feat006-media-cleanup', '* * * * *', $job$
 select net.http_post(
  url := (select decrypted_secret from vault.decrypted_secrets where name='feat006_project_url') || '/functions/v1/homework-media-cleanup',
  headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name='feat006_cleanup_secret')),
  body := '{}'::jsonb,
  timeout_milliseconds := 120000
 );
$job$);
