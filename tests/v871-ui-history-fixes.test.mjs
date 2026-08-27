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

test('desktop sidebar uses an edge chevron control while mobile keeps the hamburger menu',()=>{
  const shell=read('src/layouts/AppShell.vue')
  const top=read('src/components/layout/TopBar.vue')
  assert.match(shell,/import\s*\{[^}]*ChevronsLeft[^}]*ChevronsRight[^}]*\}\s*from\s*['"]lucide-vue-next['"]/s)
  assert.doesNotMatch(shell,/\bMenu\b/)
  assert.match(shell,/class=["']sidebar-edge-toggle["']/)
  assert.match(shell,/<ChevronsRight\s+v-if=["']preferences\.sidebarCollapsed["']/)
  assert.match(shell,/<ChevronsLeft\s+v-else/)
  assert.match(shell,/\.sidebar-edge-toggle\{[^}]*right:-15px[^}]*border-radius:999px/s)
  assert.match(top,/import\s*\{[^}]*\bMenu\b[^}]*\}\s*from\s*['"]lucide-vue-next['"]/s)
  assert.match(top,/<Menu\s*\/?\s*>/)
})

test('main surface uses an independent vanilla school-pattern layer above the warm base',()=>{
  const shell=read('src/layouts/AppShell.vue')
  assert.match(shell,/\.main::before/)
  assert.match(shell,/background-image:var\(--school-pattern-image\)/)
  assert.match(shell,/background-size:(?:920|1100)px\s+auto/)
  assert.match(shell,/opacity:var\(--pattern-opacity\)/)
  assert.match(shell,/mix-blend-mode:multiply/)
})


test('sidebar, icon buttons, and profile chip use modern hover micro-interactions',()=>{
  const nav=read('src/components/layout/SidebarNav.vue')
  const icon=read('src/components/ui/IconButton.vue')
  const top=read('src/components/layout/TopBar.vue')
  const shell=read('src/layouts/AppShell.vue')
  assert.match(nav,/hoveredIndex/)
  assert.match(nav,/dockScale/)
  assert.match(nav,/\.nav-item:hover[^}]*scale\(var\(--dock-scale\)/s)
  assert.match(nav,/\.nav-item:hover[^}]*[+~ ]?[^\n]*svg|\.nav-item:hover\s*:deep\(svg\)/s)
  assert.match(icon,/\.icon-button::before\{/)
  assert.match(icon,/\.icon-button:hover\{[^}]*scale\(1\.06\)/s)
  assert.match(top,/\.profile-chip:hover\{[^}]*translateY\(-2px\)[^}]*scale\(1\.01/s)
  assert.match(shell,/\.sidebar-edge-toggle:hover\{[^}]*scale\(1\.08\)/s)
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
  assert.match(page,/statisticsCsv\(personalState\.value/)
})

test('statistics model can merge canonical week payload without losing other week data',()=>{
  const model=read('src/features/statistics/statistics-model.ts')
  assert.match(model,/export function mergeWeekData/)
  assert.match(model,/row\.weekId\s*!==\s*weekId/)
  assert.match(model,/\.\.\.weekData\.registrations/)
  assert.match(model,/\.\.\.weekData\.overrides/)
})
