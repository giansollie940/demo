import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
<<<<<<< HEAD
const read=file=>fs.readFileSync(file,'utf8')
test('R7 Figma source is represented by panorama login and reference-density dashboard',()=>{const l=read('src/pages/LoginPage.vue');const d=read('src/pages/DashboardPage.vue');assert.match(l,/login-panorama/);assert.match(l,/login-card-float/);assert.match(d,/dashboard-kpi-grid/);assert.match(d,/dashboard-workspace-r7/)})
test('R7 desktop sidebar toggle remains visible and accessible',()=>{const s=read('src/layouts/AppShell.vue');assert.match(s,/z-index:\s*65/);assert.match(s,/right:\s*-17px/);assert.match(s,/Mở rộng thanh điều hướng/);assert.match(s,/Thu gọn thanh điều hướng/)})
test('R7 compact state still exposes Mac-like tooltip navigation',()=>{const n=read('src/components/layout/SidebarNav.vue');assert.match(n,/\.collapsed \.nav-item/);assert.match(n,/nav-tooltip/);assert.match(n,/dockScale/)})
=======
import path from 'node:path'

const root=path.resolve(new URL('..',import.meta.url).pathname)
const read=(file)=>fs.readFileSync(path.join(root,file),'utf8')

test('R6.3 dashboard treats Figma 6:2 as source of truth for desktop geometry',()=>{
  const page=read('src/pages/DashboardPage.vue')
  assert.match(page,/\.dashboard-page\{[^}]*max-width:1292px/s)
  assert.match(page,/\.dashboard-hero\{[^}]*min-height:190px/s)
  assert.match(page,/\.dashboard-hero\{[^}]*grid-template-columns:minmax\(0,1fr\)\s+470px/s)
  assert.match(page,/\.dashboard-stat-grid\{[^}]*grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/s)
  assert.match(page,/\.metrics\s+:deep\(\.card\)\{[^}]*min-height:114px/s)
  assert.match(page,/\.dashboard-main-grid\{[^}]*grid-template-columns:minmax\(0,820px\)\s+minmax\(0,454px\)/s)
  assert.match(page,/\.work-panel[^}]*min-height:300px/s)
  assert.match(page,/\.overview-panel[^}]*min-height:300px/s)
})

test('R6.3 dashboard keeps the real data model while matching the Figma visual hierarchy',()=>{
  const page=read('src/pages/DashboardPage.vue')
  assert.match(page,/useWeekData/)
  assert.match(page,/buildDashboardMetrics/)
  assert.match(page,/managerQueue/)
  assert.match(page,/student-group-dashboard(?:-blend)?\.png/)
  assert.match(page,/TỔNG QUAN TUẦN/)
  assert.match(page,/Công việc cần xử lý/)
  assert.match(page,/Tổng quan tiến độ/)
})

test('R6.3 desktop sidebar expand control is always visible above the favicon header',()=>{
  const shell=read('src/layouts/AppShell.vue')
  assert.match(shell,/\.side-head\{[^}]*z-index:30/s)
  assert.match(shell,/\.sidebar-edge-toggle\{[^}]*z-index:(?:5[0-9]|[6-9][0-9]|[1-9][0-9]{2,})/s)
  assert.match(shell,/\.sidebar-edge-toggle\{[^}]*right:-17px/s)
  assert.match(shell,/\.sidebar-edge-toggle\{[^}]*width:34px[^}]*height:34px/s)
  assert.match(shell,/aria-label="preferences\.sidebarCollapsed\?'Mở rộng thanh điều hướng':'Thu gọn thanh điều hướng'"/)
  assert.match(shell,/ChevronsRight v-if="preferences\.sidebarCollapsed"/)
  assert.match(shell,/ChevronsLeft v-else/)
})

test('R6.3 keeps compact Mac-like sidebar and does not replace it with wide reference navigation',()=>{
  const shell=read('src/layouts/AppShell.vue')
  const nav=read('src/components/layout/SidebarNav.vue')
  assert.match(shell,/\.shell\.collapsed\{grid-template-columns:calc\(var\(--sidebar-collapsed\) \+ 18px\)/)
  assert.match(shell,/\.shell\.collapsed \.sidebar\{width:var\(--sidebar-collapsed\)\}/)
  assert.match(nav,/\.collapsed \.nav-item\{[^}]*justify-content:center/s)
  assert.match(nav,/\.nav-tooltip\{/)
})
>>>>>>> parent of 66b0142 (demo 36)
