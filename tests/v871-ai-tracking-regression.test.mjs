import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
const root=resolve(import.meta.dirname,'..')
const read=p=>readFileSync(resolve(root,p),'utf8')

test('TrackingPage uses a hoisted session key helper before immediate watchers run',()=>{
  const page=read('src/pages/TrackingPage.vue')
  assert.match(page,/function key\(slot:ScheduleSlot\)/)
  assert.doesNotMatch(page,/const key=\(slot:ScheduleSlot\)/)
})

test('AI decision model distinguishes backend decisions from review completion status',()=>{
  const model=read('src/features/registrations/registration-model.ts')
  assert.match(model,/auto_approve/)
  assert.match(model,/request_revision/)
  assert.match(model,/manual_review/)
  assert.match(model,/aiDecisionLabel/)
  assert.match(model,/aiOutcomeMismatch/)
})

test('approval detail shows AI decision and backend state mismatch instead of raw completed only',()=>{
  const detail=read('src/components/approvals/ApprovalDetail.vue')
  assert.match(detail,/Quyết định AI/)
  assert.match(detail,/aiDecisionLabel/)
  assert.match(detail,/aiOutcomeMismatch/)
  assert.match(detail,/Kết quả AI đã hoàn tất nhưng trạng thái nghiệp vụ chưa được áp dụng/)
})

test('tracking row distinguishes backend AI mismatch from manual teacher review',()=>{
  const row=read('src/components/tracking/StudentTrackingRow.vue')
  assert.match(row,/aiOutcomeMismatch/)
  assert.match(row,/Kết quả AI chưa được áp dụng vào trạng thái đăng ký/)
})

test('approval detail exposes AI category and labels confidence as model confidence',()=>{
  const detail=read('src/components/approvals/ApprovalDetail.vue')
  assert.match(detail,/Nhóm AI/)
  assert.match(detail,/Độ tin cậy mô hình/)
  assert.match(detail,/aiCategoryLabel/)
})

test('approval detail shows current processing owner instead of a dash for submitted records',()=>{
  const detail=read('src/components/approvals/ApprovalDetail.vue')
  assert.match(detail,/Chờ AI/)
  assert.match(detail,/Chờ GV/)
  assert.match(detail,/Chờ HS sửa/)
  assert.match(detail,/needsTeacherAction/)
  assert.match(detail,/aiReviewInProgress/)
})
