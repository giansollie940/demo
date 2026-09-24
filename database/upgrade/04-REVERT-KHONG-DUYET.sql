-- V8.8.0 revert
-- Gỡ bỏ thao tác "Không duyệt" (reject_overdue_registration) đã cài trước đó.
--
-- Lý do gỡ: thiết kế đổi. Thay vì bắt GV bấm một nút để đóng lại đăng ký đã
-- quá giờ học mà chưa kịp duyệt, app nay TỰ ĐỘNG đưa đăng ký đó sang mục
-- "Báo cáo lỗi" của GV ngay khi buổi tự học bắt đầu — không cần thao tác nào,
-- không cần ghi gì vào cơ sở dữ liệu. Việc đó được tính hoàn toàn ở frontend
-- từ giờ bắt đầu tiết, giống cách mục Báo cáo lỗi vẫn hoạt động lâu nay.
--
-- Script này làm đúng hai việc:
--   1. Xóa hàm public.reject_overdue_registration(uuid,text).
--   2. Đưa apply_smart_approval() về đúng thân hàm của
--      REPAIR-V8.8.0-APPROVED-EDIT-AS-NEW.sql (bỏ cờ app.reject_overdue),
--      tức trở lại hành vi: mỗi lần GV mở một yêu cầu sửa mới thì
--      revision_overdue_at luôn được đặt lại về null.
--
-- KHÔNG đụng tới dữ liệu. Các đăng ký từng bị "Không duyệt" trước đây đang ở
-- trạng thái needs_revision + revision_overdue_at, và vẫn hiển thị bình thường
-- trong mục Báo cáo lỗi — giống hệt các đăng ký quá hạn sửa khác.
--
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

drop function if exists public.reject_overdue_registration(uuid,text);

-- Thân hàm dưới đây trùng khớp REPAIR-V8.8.0-APPROVED-EDIT-AS-NEW.sql:
-- vẫn giữ nguyên bản vá "HS sửa bài đã duyệt thì xoá teacher_comment",
-- chỉ bỏ đúng cờ v_reject_overdue vừa thêm.
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

drop trigger if exists trg_apply_smart_approval on public.registrations;
create trigger trg_apply_smart_approval before insert or update on public.registrations
for each row execute function public.apply_smart_approval();

notify pgrst,'reload schema';

commit;

-- ---------------------------------------------------------------------
-- Kiểm tra sau khi gỡ.
-- ---------------------------------------------------------------------
with smart_def as (
  select lower(regexp_replace(
    coalesce(pg_get_functiondef(to_regprocedure('public.apply_smart_approval()')),''),
    '\s+','','g'
  )) as fn
),
checks as (
  select 'rpc_reject_overdue_removed'::text as item,
    to_regprocedure('public.reject_overdue_registration(uuid,text)') is null as ok
  union all
  select 'session_flag_removed_from_trigger',
    (select fn from smart_def) not like '%app.reject_overdue%'
  union all
  select 'normal_revision_request_clears_overdue_flag',
    (select fn from smart_def) like '%new.revision_overdue_at:=null;new.approval_source:=''manual'';%'
  union all
  select 'approved_edit_repair_still_present',
    (select fn from smart_def) like '%tg_op=''update''andold.status=''approved''andauth.uid()=new.student_id%'
    and (select fn from smart_def) like '%new.teacher_comment:=null%'
  union all
  select 'ai_review_count_not_reset',
    (select fn from smart_def) not like '%new.ai_review_count:=0%'
  union all
  select 'trigger_attached',
    exists(select 1 from pg_trigger where tgname='trg_apply_smart_approval' and not tgisinternal)
)
select item,ok,case when ok then 'ok' else 'CHECK_REQUIRED' end as detail
from checks
union all
select 'overall_revert', bool_and(ok), case when bool_and(ok) then 'true' else 'false' end
from checks;
