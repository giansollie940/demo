import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root=resolve(import.meta.dirname,'..')
const read=(p)=>readFileSync(resolve(root,p),'utf8')

test('V8 centralizes teacher-queue logic on current registration status',()=>{
  const model=read('src/features/registrations/registration-model.ts')
  assert.match(model,/export function needsTeacherAction/)
  assert.match(model,/registration\.status\s*!==\s*'submitted'/)
  assert.match(model,/pending.*processing|processing.*pending/)
  assert.match(model,/return true/)
})

test('tracking and Wise Owl use centralized teacher-queue logic so resolved AI history is not urgent',()=>{
  const tracking=read('src/features/tracking/tracking-model.ts')
  const owl=read('src/features/owl/owl-model.ts')
  assert.match(tracking,/needsTeacherAction/)
  assert.doesNotMatch(tracking,/registration\.aiReviewStatus\s*===\s*'error'/)
  assert.match(owl,/needsTeacherAction/)
  assert.doesNotMatch(owl,/row\.status\s*===\s*'submitted'\s*\|\|\s*row\.aiReviewStatus\s*===\s*'error'/)
})

test('manual teacher approval persists approval source and clears approved timestamp when no longer approved',()=>{
  const service=read('public/supabase-service.js')
  assert.match(service,/approval_source\s*:\s*r\.approvalSource\s*\|\|\s*["']manual["']/)
  assert.match(service,/approved_at\s*:\s*r\.status\s*===\s*["']approved["']/)
})

test('AI history labels distinguish transferred-to-teacher from unresolved teacher queue',()=>{
  const model=read('src/features/registrations/registration-model.ts')
  const row=read('src/components/tracking/StudentTrackingRow.vue')
  const detail=read('src/components/approvals/ApprovalDetail.vue')
  assert.match(model,/export function aiReviewHistoryLabel/)
  assert.match(model,/AI chuyển GV · Đã xử lý/)
  assert.match(model,/AI từng duyệt · GV yêu cầu sửa/)
  assert.match(row,/aiReviewHistoryLabel/)
  assert.match(detail,/aiReviewHistoryLabel/)
})

test('resolved registration notifications do not keep the Wise Owl alert active',()=>{
  const owl=read('src/features/owl/owl-model.ts')
  assert.match(owl,/needsTeacherAction/)
  assert.doesNotMatch(owl,/kind:'urgent'.*thông báo chưa đọc/s)
  assert.match(owl,/red dot represents actionable work|chấm đỏ/i)
})

test('AI rereview remains unavailable while teacher revision is waiting for student changes',()=>{
  const tracking=read('src/pages/TrackingPage.vue')
  assert.match(tracking,/registration\.status==='approved'\|\|\(registration\.status==='submitted'/)
  assert.doesNotMatch(tracking,/registration\.status==='needs_revision'.*aiCandidate/)
})
