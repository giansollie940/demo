-- V8.8.0 targeted repair
-- Khi HS sửa một đăng ký ĐÃ ĐƯỢC DUYỆT, bản ghi phải quay về đúng trạng thái
-- của một đăng ký mới.
--
-- apply_smart_approval() đã reset gần hết: status -> 'submitted',
-- approval_source -> 'manual', approved_at/approved_by -> null, toàn bộ
-- ai_decision/ai_category/ai_confidence/ai_revision_*/ai_reason/ai_model/
-- ai_reviewed_at -> null, ai_review_status -> 'pending' (hoặc 'not_needed'
-- khi lớp tắt AI). So với một đăng ký mới tinh thì chỉ còn lệch đúng 1 cột
-- có ý nghĩa: teacher_comment vẫn giữ phản hồi cũ của giáo viên.
--
-- Hệ quả của việc còn sót teacher_comment:
--   1. Dialog đăng ký vẫn hiện "Phản hồi giáo viên" cũ, dù phản hồi đó nói về
--      nội dung vừa bị thay.
--   2. auto_review_reason rơi nhầm vào nhánh "HS đã sửa theo phản hồi GV;
--      Groq AI duyệt lại." trong khi thực tế GV đã duyệt chứ không yêu cầu sửa.
--
-- Script này bổ sung đúng một việc: xoá teacher_comment khi chính chủ HS sửa
-- một bản ghi có old.status = 'approved'.
--
-- CỐ Ý KHÔNG reset ai_review_count: cột đó là hạn mức chống gọi AI lặp
-- (5 lượt/đăng ký với HS, 12 với GV, xem supabase/functions/ai-review-registration).
-- Reset nó sẽ cho phép sửa đi sửa lại để đốt quota AI không giới hạn.
--
-- LƯU Ý VỀ DỮ LIỆU: registrations.teacher_comment là nguồn duy nhất của trang
-- "Hộp thư phản hồi" (src/pages/CommentsPage.vue). Sau script này, khi HS sửa
-- một bài đã duyệt thì nhận xét cũ của GV cho bài đó sẽ biến mất khỏi hộp thư
-- và không khôi phục được. Đây là hành vi đã được chọn có chủ đích.
--
-- Script chỉ thay một trigger function, không sửa dữ liệu sẵn có.
-- An toàn chạy lại nhiều lần.

begin;

do $preflight$
begin
  if to_regprocedure('public.apply_smart_approval()') is null then
    raise exception
      'V8.8.0_NOT_READY: missing public.apply_smart_approval(). Run the full install/upgrade first.';
  end if;

  if to_regclass('public.registrations') is null then
    raise exception 'V8.8.0_NOT_READY: missing public.registrations.';
  end if;
end
$preflight$;

create or replace function public.apply_smart_approval()
returns trigger language plpgsql security definer set search_path=public as $$
declare
  v_enabled boolean:=public.ai_automation_is_enabled(new.class_id);
  v_should_review boolean:=false;
  v_force boolean:=coalesce(current_setting('app.force_ai_rereview',true),'')='on';
begin
  if v_force and (public.is_root_admin() or public.teacher_has_class(new.class_id)) then
    new.status:='submitted'; new.approval_source:='manual'; new.ai_review_status:=case when v_enabled then 'pending' else 'not_needed' end;
    new.ai_decision:=null; new.ai_category:=null; new.ai_confidence:=null; new.ai_revision_status:=null; new.ai_revision_confidence:=null;
    new.ai_reason:=null; new.ai_model:=null; new.ai_reviewed_at:=null; new.approved_at:=null; new.approved_by:=null;
    new.auto_review_reason:=case when v_enabled then 'GV/Admin chủ động yêu cầu AI duyệt lại.' else 'AI đang tắt; chuyển giáo viên duyệt.' end;
    return new;
  end if;

  if tg_op='UPDATE' and new.status='needs_revision' and old.status is distinct from 'needs_revision'
     and (public.is_root_admin() or public.teacher_has_class(new.class_id)) then
    new.revision_overdue_at:=null; new.approval_source:='manual'; new.ai_review_status:='not_needed';
    new.ai_decision:=null; new.ai_category:=null; new.ai_confidence:=null; new.ai_revision_status:=null; new.ai_revision_confidence:=null;
    new.ai_reason:=null; new.ai_model:=null; new.ai_reviewed_at:=null; new.approved_at:=null; new.approved_by:=null;
  end if;

  if auth.uid()=new.student_id and new.status='approved' then
    new.status:='submitted'; new.approval_source:='manual'; new.approved_at:=null; new.approved_by:=null;
  end if;

  -- HS sửa một đăng ký đã duyệt: bản ghi phải quay về đúng trạng thái của một
  -- đăng ký mới, nên xoá luôn phản hồi cũ của giáo viên (phản hồi đó gắn với
  -- nội dung vừa bị thay). Nhờ vậy auto_review_reason bên dưới cũng rơi vào
  -- nhánh "đăng ký mới" thay vì "HS đã sửa theo phản hồi GV".
  -- ai_review_count cố ý KHÔNG reset: đó là hạn mức chống gọi AI lặp, không
  -- phải trạng thái duyệt.
  if tg_op='UPDATE' and old.status='approved' and auth.uid()=new.student_id then
    new.teacher_comment:=null;
  end if;

  if new.status='submitted' then
    if tg_op='INSERT' or old.status is distinct from 'submitted' or old.content is distinct from new.content
       or old.note is distinct from new.note or old.uses_electronic_device is distinct from new.uses_electronic_device then
      v_should_review:=true;
    end if;
  end if;

  if v_should_review then
    new.approval_source:='manual'; new.ai_decision:=null; new.ai_category:=null; new.ai_confidence:=null;
    new.ai_revision_status:=null; new.ai_revision_confidence:=null; new.ai_reason:=null; new.ai_model:=null; new.ai_reviewed_at:=null;
    new.approved_at:=null; new.approved_by:=null;
    if v_enabled then
      new.ai_review_status:='pending';
      new.auto_review_reason:=case when coalesce(new.teacher_comment,'')<>'' then 'HS đã sửa theo phản hồi GV; Groq AI duyệt lại.'
        when coalesce(new.is_emergency,false) then 'Đăng ký bổ sung; Groq AI kiểm tra trước.' else 'Groq AI kiểm tra đăng ký mới.' end;
    else
      new.ai_review_status:='not_needed'; new.auto_review_reason:='AI đang tắt; chuyển giáo viên duyệt.';
    end if;
  elsif new.status='approved' and auth.uid() is distinct from new.student_id and new.approval_source<>'ai' then
    new.approval_source:='manual';
  end if;
  return new;
end; $$;

-- Trigger vẫn là trigger cũ, chỉ đổi thân hàm; tạo lại cho chắc chắn (idempotent).
drop trigger if exists trg_apply_smart_approval on public.registrations;
create trigger trg_apply_smart_approval before insert or update on public.registrations
for each row execute function public.apply_smart_approval();

commit;

-- ---------------------------------------------------------------------
-- Kiểm tra sau khi vá.
-- ---------------------------------------------------------------------
with def as (
  select lower(regexp_replace(
    coalesce(pg_get_functiondef(to_regprocedure('public.apply_smart_approval()')),''),
    '\s+','','g'
  )) as fn
),
checks as (
  select 'clears_teacher_comment_on_approved_edit'::text as item,
    fn like '%tg_op=''update''andold.status=''approved''andauth.uid()=new.student_id%'
    and fn like '%new.teacher_comment:=null%' as ok
  from def
  union all
  select 'ai_review_count_not_reset',
    fn not like '%new.ai_review_count:=0%'
  from def
  union all
  select 'student_approved_edit_still_reverts_to_submitted',
    fn like '%auth.uid()=new.student_id andnew.status=''approved''%'
    or fn like '%auth.uid()=new.student_idandnew.status=''approved''%'
  from def
  union all
  select 'trigger_attached',
    exists(select 1 from pg_trigger where tgname='trg_apply_smart_approval' and not tgisinternal)
)
select item,ok,case when ok then 'ok' else 'CHECK_REQUIRED' end as detail
from checks
union all
select 'overall_repair', bool_and(ok), case when bool_and(ok) then 'true' else 'false' end
from checks;
