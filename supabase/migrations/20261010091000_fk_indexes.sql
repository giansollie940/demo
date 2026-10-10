-- Index cho các khoá ngoại trên những bảng lớn dần theo thời gian.
--
-- Supabase Performance Advisor (unindexed_foreign_keys) báo ~85 khoá ngoại chưa có index. Dữ liệu
-- hiện còn nhỏ (bảng lớn nhất ~1.500 dòng), nên chỉ thêm index cho các bảng nhật ký/thông báo sẽ
-- phình ra theo năm học và hay được lọc hoặc xoá dây chuyền theo khoá ngoại. Các khoá ngoại còn
-- lại trỏ tới bảng nhỏ hoặc cột "người thực hiện" (created_by, decided_by…) hiếm khi được xoá;
-- thêm index ở đó chỉ làm chậm việc ghi mà không lợi gì.
create index if not exists audit_logs_actor_id_idx on public.audit_logs (actor_id);
create index if not exists audit_logs_class_id_idx on public.audit_logs (class_id);

create index if not exists teacher_notifications_student_id_idx on public.teacher_notifications (student_id);
create index if not exists teacher_notifications_week_id_idx on public.teacher_notifications (week_id);

create index if not exists homework_notifications_recipient_id_idx on public.homework_notifications (recipient_id);
create index if not exists homework_notifications_class_id_idx on public.homework_notifications (class_id);
create index if not exists homework_notifications_notice_id_idx on public.homework_notifications (notice_id);

create index if not exists homework_contribution_events_actor_id_idx on public.homework_contribution_events (actor_id);
create index if not exists homework_contribution_events_notice_id_idx on public.homework_contribution_events (notice_id);

create index if not exists homework_notice_reactions_user_id_idx on public.homework_notice_reactions (user_id);
create index if not exists homework_moderation_events_notice_id_idx on public.homework_moderation_events (notice_id);
create index if not exists homework_media_receipts_notice_id_idx on public.homework_media_receipts (notice_id);
create index if not exists homework_notices_school_year_id_idx on public.homework_notices (school_year_id);

create index if not exists class_weeks_week_id_idx on public.class_weeks (week_id);
create index if not exists english_group_members_english_group_id_idx on public.english_group_members (english_group_id);
create index if not exists device_use_session_overrides_week_id_idx on public.device_use_session_overrides (week_id);
create index if not exists week_schedule_overrides_week_id_idx on public.week_schedule_overrides (week_id);
