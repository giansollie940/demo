begin;

alter table public.profiles
  add column if not exists avatar_path text null;

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values (
  'avatars',
  'avatars',
  false,
  5242880,
  array['image/webp']::text[]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

alter table storage.objects enable row level security;

drop policy if exists avatars_authenticated_read on storage.objects;
create policy avatars_authenticated_read
on storage.objects
for select
to authenticated
using (bucket_id = 'avatars');

drop policy if exists avatars_owner_insert on storage.objects;
create policy avatars_owner_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
  and name = auth.uid()::text || '/avatar.webp'
);

drop policy if exists avatars_owner_update on storage.objects;
create policy avatars_owner_update
on storage.objects
for update
to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
  and name = auth.uid()::text || '/avatar.webp'
)
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
  and name = auth.uid()::text || '/avatar.webp'
);

drop policy if exists avatars_owner_delete on storage.objects;
create policy avatars_owner_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
  and name = auth.uid()::text || '/avatar.webp'
);

create or replace function public.set_own_avatar_path(p_avatar_path text)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_expected text;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  v_expected := v_uid::text || '/avatar.webp';
  if p_avatar_path is not null and p_avatar_path <> v_expected then
    raise exception 'INVALID_AVATAR_PATH';
  end if;

  update public.profiles
  set avatar_path = p_avatar_path
  where id = v_uid;

  if not found then
    raise exception 'PROFILE_NOT_FOUND';
  end if;

  return p_avatar_path;
end;
$$;

revoke all on function public.set_own_avatar_path(text) from public;
grant execute on function public.set_own_avatar_path(text) to authenticated;

commit;
