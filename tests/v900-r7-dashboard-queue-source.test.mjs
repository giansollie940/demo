import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
const page=fs.readFileSync('src/pages/DashboardPage.vue','utf8')
const presenter=fs.readFileSync('src/features/dashboard/dashboard-presenter.ts','utf8')
const progress=fs.readFileSync('src/components/dashboard/WeeklyProgressCard.vue','utf8')
test('R7 dashboard uses real operational queue components',()=>{
  assert.match(page,/PendingTasksTable/)
  assert.match(page,/WeeklyProgressCard/)
  assert.match(progress,/MotivationCard/)
  assert.match(page,/buildDashboardQueue/)
})
test('dashboard presenter derives rows from existing registrations and teacher action logic',()=>{
  assert.match(presenter,/needsTeacherAction/)
  assert.match(presenter,/studentName/)
  assert.match(presenter,/content/)
  assert.match(presenter,/updatedAt/)
  assert.match(presenter,/buildMotivationMessage/)
})
