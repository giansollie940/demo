begin;

update storage.buckets
set public = false,
    file_size_limit = 5242880,
    allowed_mime_types = array['image/webp','image/gif']::text[]
where id = 'avatars';

drop policy if exists avatars_owner_insert on storage.objects;
create policy avatars_owner_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
  and name in (auth.uid()::text || '/avatar.webp', auth.uid()::text || '/avatar.gif')
);

drop policy if exists avatars_owner_update on storage.objects;
create policy avatars_owner_update
on storage.objects
for update
to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
  and name in (auth.uid()::text || '/avatar.webp', auth.uid()::text || '/avatar.gif')
)
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
  and name in (auth.uid()::text || '/avatar.webp', auth.uid()::text || '/avatar.gif')
);

drop policy if exists avatars_owner_delete on storage.objects;
create policy avatars_owner_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
  and name in (auth.uid()::text || '/avatar.webp', auth.uid()::text || '/avatar.gif')
);

create or replace function public.set_own_avatar_path(p_avatar_path text)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_webp text;
  v_gif text;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  v_webp := v_uid::text || '/avatar.webp';
  v_gif := v_uid::text || '/avatar.gif';
  if p_avatar_path is not null and p_avatar_path not in (v_webp,v_gif) then
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
