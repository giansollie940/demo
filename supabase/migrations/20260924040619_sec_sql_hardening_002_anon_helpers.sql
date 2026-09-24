revoke execute on function public.ai_automation_is_enabled(uuid)
  from public, anon;
revoke execute on function public.can_manage_class(uuid)
  from public, anon;
revoke execute on function public.can_manage_registration(uuid)
  from public, anon;
revoke execute on function public.can_manage_student(uuid)
  from public, anon;
revoke execute on function public.can_view_registration(uuid)
  from public, anon;
revoke execute on function public.class_week_effective_status(uuid, uuid)
  from public, anon;
revoke execute on function public.current_student_class_id()
  from public, anon;
revoke execute on function public.get_ai_feedback_memory_stats()
  from public, anon;
revoke execute on function public.is_active_teacher()
  from public, anon;
revoke execute on function public.is_root_admin()
  from public, anon;
revoke execute on function public.registration_deadline_for_slot(uuid, uuid, integer)
  from public, anon;
revoke execute on function public.teacher_has_class(uuid)
  from public, anon;
revoke execute on function public.week_effective_status(uuid)
  from public, anon;
revoke execute on function public.week_registration_is_open(uuid, uuid)
  from public, anon;
revoke execute on function public.sync_week_statuses()
  from public, anon, authenticated;
