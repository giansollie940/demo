import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read=(path)=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8')

test('CP3 routes use real registration and approval pages',()=>{
  const routes=read('src/app/router/routes.ts')
  assert.match(routes,/path:\s*'register',\s*component:\s*RegistrationPage/)
  assert.match(routes,/path:\s*'review',\s*component:\s*ApprovalPage/)
})

test('approval page exposes filters, batch action, master detail and AI metadata',()=>{
  const page=read('src/pages/ApprovalPage.vue')
  const detail=read('src/components/approvals/ApprovalDetail.vue')
  for(const token of ['ApprovalFilters','ApprovalList','ApprovalDetail','Duyệt {{ eligibleVisibleIds.length }} mục']) assert.ok(page.includes(token),token)
  for(const token of ['Kết quả AI','Đăng ký bổ sung','Thiết bị điện tử','AI chưa đúng','Xóa đăng ký']) assert.ok(detail.includes(token),token)
})

test('registration realtime conflicts are scoped to registration editors',()=>{
  const realtime=read('src/realtime/useRealtimeInvalidation.ts')
  assert.match(realtime,/registrationEditors\s*=\s*\['registration-dialog',\s*'approval-detail'\]/)
  assert.match(realtime,/notifyServerChange\(registrationEditors\)/)
  assert.match(realtime,/invalidateQueries\(\{queryKey:\['week-data'\]\}\)/)
})
