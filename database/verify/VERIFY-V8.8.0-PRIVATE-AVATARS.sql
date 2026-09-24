with checks as (
  select 'profiles.avatar_path exists'::text as item,
         exists (
           select 1 from information_schema.columns
           where table_schema='public' and table_name='profiles' and column_name='avatar_path'
         ) as ok
  union all
  select 'avatars bucket is private',
         exists (select 1 from storage.buckets where id='avatars' and public=false)
  union all
  select 'avatars bucket is WEBP and <=5MiB',
         exists (
           select 1 from storage.buckets
           where id='avatars'
             and file_size_limit=5242880
             and allowed_mime_types @> array['image/webp']::text[]
         )
  union all
  select 'avatar RPC exists',
         to_regprocedure('public.set_own_avatar_path(text)') is not null
  union all
  select 'authenticated avatar read policy exists',
         exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='avatars_authenticated_read')
  union all
  select 'owner avatar insert policy exists',
         exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='avatars_owner_insert')
  union all
  select 'owner avatar update policy exists',
         exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='avatars_owner_update')
  union all
  select 'owner avatar delete policy exists',
         exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='avatars_owner_delete')
)
select item,ok from checks order by item;
