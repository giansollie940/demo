-- Sổ Tự Học installer — step 0: extensions the application needs on a brand-new Supabase project.
-- pgcrypto, uuid-ossp and supabase_vault are already enabled on every new project.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists "uuid-ossp" with schema extensions;
