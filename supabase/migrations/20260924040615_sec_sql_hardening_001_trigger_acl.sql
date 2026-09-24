revoke execute on function public.capture_ai_teacher_feedback()
  from public, anon, authenticated;
revoke execute on function public.guard_class_deactivation_with_active_learners()
  from public, anon, authenticated;
revoke execute on function public.guard_root_admin_profile()
  from public, anon, authenticated;
revoke execute on function public.guard_student_registration_update()
  from public, anon, authenticated;
revoke execute on function public.set_registration_class_id()
  from public, anon, authenticated;
revoke execute on function public.sync_class_assignments_on_deactivate()
  from public, anon, authenticated;
revoke execute on function public.sync_teacher_assignments_on_profile_change()
  from public, anon, authenticated;
revoke execute on function public.sync_week_statuses_after_calendar_change()
  from public, anon, authenticated;
revoke execute on function public.validate_class_teacher_assignment()
  from public, anon, authenticated;
revoke execute on function public.validate_class_week_school_year()
  from public, anon, authenticated;
revoke execute on function public.validate_profile_class_scope()
  from public, anon, authenticated;
revoke execute on function public.validate_registration_class_week()
  from public, anon, authenticated;
revoke execute on function public.validate_week_override_school_year()
  from public, anon, authenticated;
