begin;

create or replace function public.can_view_profile(target_profile_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  viewer_id uuid := auth.uid();
  viewer_role text;
  viewer_class_id uuid;
  target_role text;
  target_class_id uuid;
  target_active boolean;
begin
  if viewer_id is null or target_profile_id is null then
    return false;
  end if;

  if public.is_root_admin() then
    return exists(select 1 from public.profiles p where p.id = target_profile_id);
  end if;

  if target_profile_id = auth.uid() then
    return exists(select 1 from public.profiles p where p.id = target_profile_id and p.active = true);
  end if;

  select p.role::text, p.class_id
    into viewer_role, viewer_class_id
  from public.profiles p
  where p.id = viewer_id and p.active = true;

  if viewer_role is null then
    return false;
  end if;

  select p.role::text, p.class_id, p.active
    into target_role, target_class_id, target_active
  from public.profiles p
  where p.id = target_profile_id;

  if target_role is null or target_active is not true then
    return false;
  end if;

  if viewer_role in ('student','monitor') then
    if target_role in ('student','monitor') then
      return viewer_class_id is not null and target_class_id = viewer_class_id;
    end if;

    if target_role = 'teacher' and viewer_class_id is not null then
      return exists(
        select 1
        from public.class_teachers ct
        join public.classes c on c.id = ct.class_id and c.active = true
        where ct.teacher_id = target_profile_id
          and ct.class_id = viewer_class_id
          and ct.active = true
      );
    end if;

    return false;
  end if;

  if viewer_role = 'teacher' then
    if target_role not in ('student','monitor') or target_class_id is null then
      return false;
    end if;

    return exists(
      select 1
      from public.class_teachers ct
      join public.classes c on c.id = ct.class_id and c.active = true
      where ct.teacher_id = viewer_id
        and ct.class_id = target_class_id
        and ct.active = true
    );
  end if;

  return false;
end;
$$;

revoke all on function public.can_view_profile(uuid) from public;
revoke all on function public.can_view_profile(uuid) from anon;
grant execute on function public.can_view_profile(uuid) to authenticated;

drop policy if exists profiles_select_v840 on public.profiles;
drop policy if exists profiles_select_v841 on public.profiles;
create policy profiles_select_v841
on public.profiles
for select
to authenticated
using (public.can_view_profile(id));

drop policy if exists avatars_authenticated_read on storage.objects;
drop policy if exists avatars_visible_profile_read on storage.objects;
create policy avatars_visible_profile_read
on storage.objects
for select
to authenticated
using (
  bucket_id = 'avatars'
  and storage.filename(name) in ('avatar.webp','avatar.gif')
  and (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and public.can_view_profile(((storage.foldername(name))[1])::uuid)
);

commit;
