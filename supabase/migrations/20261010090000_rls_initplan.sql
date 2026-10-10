-- RLS: gọi auth.uid() một lần cho cả câu truy vấn thay vì một lần cho mỗi dòng.
--
-- Supabase Performance Advisor (auth_rls_initplan) báo 4 policy dưới đây gọi auth.uid() trực
-- tiếp, nên Postgres tính lại hàm cho từng dòng. Bọc thành (select auth.uid()) biến nó thành
-- InitPlan, tính một lần. Logic không đổi: chỉ thay đúng chỗ auth.uid(), giữ nguyên mọi điều kiện
-- khác. ALTER POLICY giữ nguyên tên, lệnh (SELECT/INSERT/UPDATE), vai trò và PERMISSIVE.
alter policy class_teachers_select_v840 on public.class_teachers
  using (is_root_admin() or (teacher_id = (select auth.uid())));

alter policy registrations_select_v840 on public.registrations
  using ((is_deleted = false) and ((student_id = (select auth.uid())) or is_root_admin()
    or ((status <> 'draft'::registration_status) and teacher_has_class(class_id))
    or ((status <> 'draft'::registration_status) and ((current_app_role())::text = 'monitor'::text)
        and (class_id = current_student_class_id()))));

alter policy registrations_student_insert_v840 on public.registrations
  with check (((current_app_role())::text = any (array['student'::text, 'monitor'::text]))
    and (student_id = (select auth.uid())) and (class_id = current_student_class_id())
    and (is_deleted = false) and (is_emergency = false)
    and (status = any (array['draft'::registration_status, 'submitted'::registration_status]))
    and week_registration_is_open(class_id, week_id)
    and ((registration_deadline_for_slot(class_id, week_id, weekday) is null)
      or (now() <= registration_deadline_for_slot(class_id, week_id, weekday))));

alter policy registrations_student_update_v840 on public.registrations
  using (((current_app_role())::text = any (array['student'::text, 'monitor'::text]))
    and (student_id = (select auth.uid())) and (is_deleted = false)
    and (class_id = current_student_class_id())
    and (status = any (array['draft'::registration_status, 'submitted'::registration_status,
      'needs_revision'::registration_status, 'approved'::registration_status]))
    and (((status = 'needs_revision'::registration_status) and (revision_overdue_at is null)
        and (now() < study_session_start(class_id, week_id, weekday, period_number)))
      or ((status <> 'needs_revision'::registration_status) and week_registration_is_open(class_id, week_id)
        and ((registration_deadline_for_slot(class_id, week_id, weekday) is null)
          or (now() <= registration_deadline_for_slot(class_id, week_id, weekday)))
        and (now() < study_session_start(class_id, week_id, weekday, period_number)))))
  with check (((current_app_role())::text = any (array['student'::text, 'monitor'::text]))
    and (student_id = (select auth.uid())) and (class_id = current_student_class_id())
    and (is_deleted = false) and (revision_overdue_at is null)
    and registration_emergency_flag_matches(id, is_emergency)
    and (status = any (array['draft'::registration_status, 'submitted'::registration_status])));
