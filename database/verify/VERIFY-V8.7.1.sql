-- SỔ TỰ HỌC V8.7.1 — READ-ONLY FINAL CONTRACT CHECK
WITH root_admin AS (
  SELECT count(*) AS total,
         count(*) FILTER (WHERE active IS TRUE) AS active_total
  FROM public.profiles
  WHERE role::text='admin'
),
audit_fk AS (
  SELECT c.confdeltype
  FROM pg_constraint c
  JOIN pg_class t ON t.oid=c.conrelid
  JOIN pg_namespace n ON n.oid=t.relnamespace
  WHERE n.nspname='public'
    AND t.relname='audit_logs'
    AND c.conname='audit_logs_actor_id_fkey'
),
revision_proc AS (
  SELECT p.prosecdef,
         pg_get_functiondef(p.oid) AS def
  FROM pg_proc p
  WHERE p.oid=to_regprocedure('public.request_registration_revision(uuid,text)')
),
notification_proc AS (
  SELECT pg_get_functiondef(p.oid) AS def
  FROM pg_proc p
  WHERE p.oid=to_regprocedure('public.sync_teacher_review_notification()')
),
checks AS (
  SELECT 'classes_table'::text AS name, to_regclass('public.classes') IS NOT NULL AS ok
  UNION ALL SELECT 'class_teachers_table',to_regclass('public.class_teachers') IS NOT NULL
  UNION ALL SELECT 'class_settings_table',to_regclass('public.class_settings') IS NOT NULL
  UNION ALL SELECT 'class_weeks_table',to_regclass('public.class_weeks') IS NOT NULL
  UNION ALL SELECT 'class_week_manual_status_column',exists(
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='class_weeks' AND column_name='manual_status'
  )
  UNION ALL SELECT 'class_week_effective_status_manual_override',coalesce((
    SELECT position('manual_status' in pg_get_functiondef(p.oid))>0
       and position('study_schedule' in pg_get_functiondef(p.oid))>0
       and position('week_schedule_overrides' in pg_get_functiondef(p.oid))>0
    FROM pg_proc p WHERE p.oid=to_regprocedure('public.class_week_effective_status(uuid,uuid)')
  ),false)
  UNION ALL SELECT 'school_year_periods_table',to_regclass('public.school_year_periods') IS NOT NULL
  UNION ALL SELECT 'school_year_periods_seeded',to_regclass('public.school_year_periods') IS NOT NULL and not exists(
    SELECT 1 FROM public.school_years y
    WHERE NOT EXISTS(SELECT 1 FROM public.school_year_periods p WHERE p.school_year_id=y.id)
  )
  UNION ALL SELECT 'study_session_start_year_periods',coalesce((
    SELECT position('school_year_periods' in pg_get_functiondef(p.oid))>0
    FROM pg_proc p WHERE p.oid=to_regprocedure('public.study_session_start(uuid,integer,integer)')
  ),false)
  UNION ALL SELECT 'school_year_period_replace_rpc',to_regprocedure('public.admin_replace_school_year_periods(uuid,uuid,jsonb)') IS NOT NULL
  UNION ALL SELECT 'school_year_period_replace_rpc_security_definer',coalesce((select prosecdef from pg_proc where oid=to_regprocedure('public.admin_replace_school_year_periods(uuid,uuid,jsonb)')),false)
  UNION ALL SELECT 'daily_quotes_table',to_regclass('public.daily_quotes') IS NOT NULL
  UNION ALL SELECT 'root_admin_exactly_one',(SELECT total=1 FROM root_admin)
  UNION ALL SELECT 'root_admin_active',(SELECT active_total=1 FROM root_admin)
  UNION ALL SELECT 'school_year_create_rpc_exists',to_regprocedure('public.admin_create_school_year(uuid,text,date,date,boolean)') IS NOT NULL
  UNION ALL SELECT 'school_year_create_rpc_security_definer',coalesce((select prosecdef from pg_proc where oid=to_regprocedure('public.admin_create_school_year(uuid,text,date,date,boolean)')),false)
  UNION ALL SELECT 'school_year_activate_rpc_exists',to_regprocedure('public.admin_set_active_school_year(uuid,uuid)') IS NOT NULL
  UNION ALL SELECT 'school_year_activate_rpc_security_definer',coalesce((select prosecdef from pg_proc where oid=to_regprocedure('public.admin_set_active_school_year(uuid,uuid)')),false)
  UNION ALL SELECT 'revision_rpc_exists',to_regprocedure('public.request_registration_revision(uuid,text)') IS NOT NULL
  UNION ALL SELECT 'revision_rpc_security_definer',coalesce((SELECT prosecdef FROM revision_proc),false)
  UNION ALL SELECT 'revision_rpc_manager_guard',coalesce((SELECT position('can_manage_class' in def)>0 FROM revision_proc),false)
  UNION ALL SELECT 'revision_rpc_session_guard',coalesce((SELECT position('study_session_start' in def)>0 FROM revision_proc),false)
  UNION ALL SELECT 'notification_function_exists',to_regprocedure('public.sync_teacher_review_notification()') IS NOT NULL
  UNION ALL SELECT 'notification_revision_overdue_safe',coalesce((SELECT position('revision_overdue_at' in def)>0 FROM notification_proc),false)
  UNION ALL SELECT 'audit_actor_fk_set_null',coalesce((SELECT confdeltype='n' FROM audit_fk),false)
  UNION ALL SELECT 'audit_actor_nullable',exists(
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='audit_logs' AND column_name='actor_id' AND is_nullable='YES'
  )
  UNION ALL SELECT 'ai_decision_column',exists(
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='registrations' AND column_name='ai_decision'
  )
  UNION ALL SELECT 'ai_category_column',exists(
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='registrations' AND column_name='ai_category'
  )
  UNION ALL SELECT 'ai_confidence_column',exists(
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='registrations' AND column_name='ai_confidence'
  )
  UNION ALL SELECT 'class_setting_ai_automation',exists(
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='class_settings' AND column_name='ai_automation_enabled'
  )
  UNION ALL SELECT 'class_setting_ai_threshold',exists(
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='class_settings' AND column_name='ai_auto_approve_threshold'
  )
  UNION ALL SELECT 'all_active_learners_have_class',not exists(
    SELECT 1 FROM public.profiles
    WHERE active IS TRUE AND role::text IN ('student','monitor') AND class_id IS NULL
  )
)
SELECT jsonb_build_object(
  'version','8.7.1',
  'checks',coalesce(jsonb_agg(jsonb_build_object('name',name,'ok',ok) ORDER BY name),'[]'::jsonb),
  'overall',bool_and(ok)
) AS v871_verification
FROM checks;
