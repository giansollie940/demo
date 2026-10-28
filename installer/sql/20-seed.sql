-- Sổ Tự Học installer — step 2: reference data a new school starts with.
-- Only generic settings: no classes, people or school years. Safe to run again.

-- Default lesson periods (Admin can change them per school year in the app).
insert into public.periods (period_number, start_time, end_time) values
  (1, '07:40:00', '08:20:00'),
  (2, '08:25:00', '09:05:00'),
  (3, '09:20:00', '10:00:00'),
  (4, '10:05:00', '10:45:00'),
  (5, '10:50:00', '11:30:00'),
  (6, '13:15:00', '13:55:00'),
  (7, '14:00:00', '14:40:00'),
  (8, '14:55:00', '15:35:00'),
  (9, '15:40:00', '16:20:00')
on conflict do nothing;

-- App-wide defaults; each class can override them in its own settings.
insert into public.app_settings (key, value) values
  ('ai_auto_approve_threshold', '0.9'::jsonb),
  ('ai_feedback_memory_enabled', 'true'::jsonb),
  ('ai_review_enabled', 'true'::jsonb),
  ('ai_revision_auto_approve_threshold', '0.85'::jsonb),
  ('announcement', '"Chuẩn bị nội dung tự học trước 20:00 ngày có buổi tự học."'::jsonb),
  ('per_session_deadline_time', '"20:00"'::jsonb),
  ('smart_approval_enabled', 'true'::jsonb),
  ('teacher_name', '"Giáo viên chủ nhiệm"'::jsonb)
on conflict do nothing;

-- Subject catalogue for grade 7 (Admin can edit it and add other grades in the app).
insert into public.grade_subject_catalog (grade, name, short_name, icon, sort_order, is_active, is_english) values
  (7, 'Toán', '', '🧮', 0, true, false),
  (7, 'Ngữ văn', '', '📚', 1, true, false),
  (7, 'Lịch sử và Địa lí', '', '🗺️', 2, true, false),
  (7, 'Tiếng Anh', '', '🔤', 2, true, true),
  (7, 'Khoa học tự nhiên', '', '🔬', 3, true, false),
  (7, 'Giáo dục công dân', '', '🤝', 5, true, false),
  (7, 'Tin học', '', '💻', 6, true, false),
  (7, 'Công nghệ', '', '⚙️', 7, true, false),
  (7, 'Mĩ thuật', '', '🎨', 7, true, false),
  (7, 'Âm nhạc', '', '🎵', 8, true, false),
  (7, 'Giáo dục thể chất', '', '⚽', 10, true, false),
  (7, 'Hoạt động trải nghiệm, hướng nghiệp', '', '🎒', 11, true, false),
  (7, 'Giáo dục địa phương', '', '🏫', 12, true, false)
on conflict do nothing;

-- Storage capacity is configuration, never a provider constant. The database row starts at the
-- Supabase Free plan size; R2 stays "not configured" until the Admin sets it in the app.
insert into public.homework_storage_capacity (provider, configured_bytes, note) values
  ('database', 524288000, 'Gói Free của Supabase: 500 MB. Sửa lại nếu nâng gói.'),
  ('r2', null, 'Chưa cấu hình.')
on conflict do nothing;

-- "Xếp cặp theo đề" rules season.
insert into bag_game.config (id, season) values (true, 1) on conflict do nothing;
