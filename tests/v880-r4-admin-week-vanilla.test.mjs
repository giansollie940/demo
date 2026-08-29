import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root=path.resolve(new URL('..',import.meta.url).pathname)
const read=(file)=>fs.readFileSync(path.join(root,file),'utf8')
const exists=(file)=>fs.existsSync(path.join(root,file))

test('admin timetable reloads the selected template when its latest version arrives and shows the selected version context',()=>{
  const builder=read('src/components/admin/AdminTimetableBuilder.vue')
  assert.match(builder,/selectedLatestVersionId|selectedVersionId/)
  assert.match(builder,/watch\([^\n]*(?:selectedLatestVersionId|selectedVersionId)/)
  assert.match(builder,/Đang xem:/)
  assert.match(builder,/Chưa tìm thấy phiên bản đã lưu|chưa có phiên bản/i)
})

test('admin timetable mutations expose local saving and success feedback and select a newly created template',()=>{
  const page=read('src/pages/AdminPage.vue')
  const year=read('src/components/admin/AdminSchoolYearCard.vue')
  const builder=read('src/components/admin/AdminTimetableBuilder.vue')
  assert.match(page,/timetableFeedback/)
  assert.match(page,/Đang tạo mẫu TKB|Đang lưu phiên bản TKB/)
  assert.match(page,/selectedTemplateId/)
  assert.match(year,/:feedback="timetableFeedback"/)
  assert.match(builder,/InlineStatus/)
  assert.match(builder,/Đang lưu TKB|Đang tạo TKB/)
})


test('admin timetable assignment keeps the latest version selected when version data refreshes and shows its details',()=>{
  const assignment=read('src/components/admin/AdminTimetableAssignment.vue')
  assert.match(assignment,/latestVersionId/)
  assert.match(assignment,/watch\(\[.*form\.templateId.*latestVersionId/s)
  assert.match(assignment,/selected-template-summary/)
  assert.match(assignment,/Thời lượng tiết|Buổi sáng|Buổi chiều/)
})

test('week editor can cancel the currently selected unsaved settings back to its baseline',()=>{
  const page=read('src/pages/WeeksPage.vue')
  const editor=read('src/components/weeks/WeekEditorCard.vue')
  assert.match(page,/function cancelSelected/)
  assert.match(page,/@cancel="cancelSelected"/)
  assert.match(editor,/cancel:\s*\[\]/)
  assert.match(editor,/Hủy thay đổi/)
})

test('vanilla school background is bundled by Vite and uses the theme opacity token',()=>{
  const shell=read('src/layouts/AppShell.vue')
  assert.ok(exists('src/assets/images/school-pattern-bg.png'))
  assert.match(shell,/import schoolPatternUrl from ['"]\.\.\/assets\/images\/school-pattern-bg\.png['"]/)
  assert.doesNotMatch(shell,/schoolPatternUrl\s*=\s*`\$\{import\.meta\.env\.BASE_URL\}/)
  assert.match(shell,/background-image:var\(--school-pattern-image\)/)
  assert.match(shell,/opacity:1/)
})
