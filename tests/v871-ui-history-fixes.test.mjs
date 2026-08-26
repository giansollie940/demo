import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root=path.resolve(new URL('..',import.meta.url).pathname)
const read=(file)=>fs.readFileSync(path.join(root,file),'utf8')

test('signed-in profile owns the logout action instead of the sidebar footer',()=>{
  const top=read('src/components/layout/TopBar.vue')
  const shell=read('src/layouts/AppShell.vue')
  assert.match(top,/LogOut/)
  assert.match(top,/profile-(?:menu|dropdown)/)
  assert.match(top,/Đăng xuất/)
  assert.match(top,/emit\(['"]logout['"]\)/)
  assert.doesNotMatch(shell,/class=["']logout["']/)
  assert.match(shell,/<TopBar[^>]*@logout=["']logout["']/)
})

test('desktop sidebar toggle uses a hamburger icon consistently with mobile navigation',()=>{
  const shell=read('src/layouts/AppShell.vue')
  const top=read('src/components/layout/TopBar.vue')
  assert.match(shell,/import\s*\{[^}]*\bMenu\b[^}]*\}\s*from\s*['"]lucide-vue-next['"]/s)
  assert.doesNotMatch(shell,/PanelLeft(?:Open|Close)/)
  assert.match(shell,/<Menu\s*\/?\s*>/)
  assert.match(top,/<Menu\s*\/?\s*>/)
})

test('main surface uses the vanilla layered school pattern instead of a hidden negative-z pseudo layer',()=>{
  const shell=read('src/layouts/AppShell.vue')
  assert.match(shell,/background:\s*linear-gradient\([^;]+\),\s*var\(--school-pattern-image\)/s)
  assert.match(shell,/background-size:\s*auto,\s*1100px\s+auto/)
  assert.doesNotMatch(shell,/\.main::before/)
})

test('dashboard makes the selected week the primary visual heading',()=>{
  const page=read('src/pages/DashboardPage.vue')
  assert.match(page,/class=["']week-title["']/)
  assert.match(page,/TUẦN\s*\{\{\s*week\?\.number/)
  assert.match(page,/\.week-title\{[^}]*font-size:\s*clamp\(/s)
  assert.match(page,/class=["']week-dates["']/)
  assert.doesNotMatch(page,/\.welcome h1\{/,'generic welcome h1 must not override the prominent week-title typography')
})

test('statistics loads selected and historical week data through Vue Query before calculating rates',()=>{
  const page=read('src/pages/StatisticsPage.vue')
  assert.match(page,/useWeekData\(classId,\s*weekId\)/)
  assert.match(page,/useQuery/)
  assert.match(page,/legacyApi\.loadWeekData\(week\.id,\s*classId\.value\)/)
  assert.match(page,/mergeWeekData/)
  assert.match(page,/selectedWeekQuery\.data\.value/)
  assert.match(page,/trendQuery\.data\.value/)
  assert.match(page,/statisticsCsv\(selectedState\.value/)
})

test('statistics model can merge canonical week payload without losing other week data',()=>{
  const model=read('src/features/statistics/statistics-model.ts')
  assert.match(model,/export function mergeWeekData/)
  assert.match(model,/row\.weekId\s*!==\s*weekId/)
  assert.match(model,/\.\.\.weekData\.registrations/)
  assert.match(model,/\.\.\.weekData\.overrides/)
})
