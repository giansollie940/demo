import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
const source=fs.readFileSync('src/pages/DashboardPage.vue','utf8')
test('R7 dashboard composes focused hero and KPI components',()=>{
  assert.match(source,/DashboardHero/)
  assert.match(source,/KpiTrendCard/)
  assert.match(source,/r7-dashboard-students@2x\.png/)
  assert.match(source,/Học sinh/)
  assert.match(source,/Đã đăng ký/)
  assert.match(source,/Cần GV xử lý/)
  assert.match(source,/Cần chú ý/)
})
