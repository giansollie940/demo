begin;

revoke all on function public.set_own_avatar_path(text) from anon;
grant execute on function public.set_own_avatar_path(text) to authenticated;

commit;
