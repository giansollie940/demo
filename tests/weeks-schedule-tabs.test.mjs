// Trang /schedule của GV có ba thẻ: Quản lý tuần (mặc định), Thời khóa biểu, Thiết bị điện tử.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('the schedule page hosts the weeks, timetable and device tabs, weeks first', () => {
  const page = read('src/pages/SchedulePage.vue')
  const tabs = [...page.matchAll(/@click="selectTab\('(\w+)'\)"/g)].map(match => match[1])
  assert.deepEqual(tabs, ['weeks', 'schedule', 'device'])
  assert.match(page, /import WeeksPage from '\.\/WeeksPage\.vue'/)
  assert.match(page, /<WeeksPage v-if="activeTab === 'weeks'" \/>/)
  // No ?tab means the weeks tab; the timetable tab is ?tab=schedule.
  assert.match(page, /tab: tab === 'weeks' \? undefined : tab/)
})

test('the weeks tab opens a week timetable on the timetable tab', () => {
  assert.match(read('src/pages/WeeksPage.vue'), /router\.push\(\{path:'\/schedule',query:\{tab:'schedule'\}\}\)/)
})
