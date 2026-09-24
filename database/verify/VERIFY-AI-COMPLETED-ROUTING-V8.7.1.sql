-- SỔ TỰ HỌC V8.7.1 — READ-ONLY AI ROUTING INSPECTION
SELECT
  r.id,
  r.class_id,
  r.student_id,
  r.week_id,
  r.weekday,
  r.period_number,
  left(coalesce(r.content,''),180) AS content,
  r.status,
  r.approval_source,
  r.ai_review_status,
  r.ai_decision,
  r.ai_category,
  round((coalesce(r.ai_confidence,0)*100)::numeric,1) AS ai_confidence_pct,
  round((coalesce(cs.ai_auto_approve_threshold,0.90)*100)::numeric,1) AS auto_approve_threshold_pct,
  r.ai_reason,
  CASE
    WHEN r.ai_review_status<>'completed' THEN 'NOT_COMPLETED'
    WHEN r.ai_decision='auto_approve' AND r.status='approved' AND r.approval_source='ai' THEN 'OK_AUTO_APPROVED'
    WHEN r.ai_decision='request_revision' AND r.status='needs_revision' THEN 'OK_REQUEST_REVISION'
    WHEN r.ai_decision='manual_review' AND r.status='submitted' THEN 'OK_MANUAL_REVIEW'
    WHEN r.ai_decision='auto_approve' THEN 'MISMATCH_AUTO_APPROVE_NOT_APPLIED'
    WHEN r.ai_decision='request_revision' THEN 'MISMATCH_REVISION_NOT_APPLIED'
    WHEN r.ai_decision='manual_review' THEN 'MISMATCH_MANUAL_REVIEW_STATE'
    ELSE 'MISSING_OR_UNKNOWN_AI_DECISION'
  END AS routing_check,
  r.updated_at,
  r.ai_reviewed_at
FROM public.registrations r
LEFT JOIN public.class_settings cs ON cs.class_id=r.class_id
WHERE coalesce(r.is_deleted,false)=false
  AND r.ai_review_status='completed'
ORDER BY r.updated_at DESC
LIMIT 100;
