import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read=(path)=>fs.readFileSync(path,'utf8')

test('admin timetable builder keeps automatic break inputs primary and manual rules under advanced exceptions',()=>{
  const source=read('src/components/admin/AdminTimetableBuilder.vue')
  assert.match(source,/Chỉ nghỉ ngắn/)
  assert.match(source,/Có nghỉ dài/)
  assert.match(source,/morningLongBreakEnabled/)
  assert.match(source,/afternoonLongBreakEnabled/)
  assert.match(source,/Ngoại lệ nâng cao/)
  assert.match(source,/Nghỉ giữa các tiết/)
})

test('tracking uses compact session selectors and clickable metrics inside one continuous workspace',()=>{
  const source=read('src/pages/TrackingPage.vue')
  assert.match(source,/session-selector/)
  assert.match(source,/tracking-workspace/)
  assert.match(source,/metric-button/)
  assert.match(source,/@click="filter='missing'"/)
  assert.match(source,/@click="filter='device'"/)
  assert.doesNotMatch(source,/SessionSummaryCard/)
})

test('week management has a laptop-width scrollable master column and applied deadline label',()=>{
  const page=read('src/pages/WeeksPage.vue')
  const editor=read('src/components/weeks/WeekEditorCard.vue')
  assert.match(page,/clamp\(310px,\s*28vw,\s*370px\)/)
  assert.match(page,/scrollbar-gutter:\s*stable/)
  assert.match(page,/min-height:\s*0/)
  assert.match(editor,/deadlineDraft/)
  assert.match(editor,/Áp dụng hạn/)
  assert.match(editor,/Hủy/)
  assert.match(editor,/specificDeadlineLabel/)
})

test('new automatic break settings survive admin directory normalization and Edge validation',()=>{
  const directory=read('src/features/admin/admin-directory.ts')
  const edge=read('supabase/functions/admin-manage-classes/index.ts')
  for(const key of ['morningLongBreakEnabled','morningLongBreakAfterPeriod','afternoonLongBreakEnabled','afternoonLongBreakAfterPeriod']){
    assert.match(directory,new RegExp(key))
    assert.match(edge,new RegExp(key))
  }
})
