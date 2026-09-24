revoke execute on function public.current_app_class()
from public, anon, authenticated, service_role;

grant execute on function public.current_app_class() to authenticated;

notify pgrst, 'reload schema';
