import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root=path.resolve(new URL('..',import.meta.url).pathname)
const read=(file)=>fs.readFileSync(path.join(root,file),'utf8')

test('dashboard R6 uses reference-inspired hero, four primary manager cards, and two-panel overview',()=>{
  const page=read('src/pages/DashboardPage.vue')
  assert.match(page,/class="dashboard-hero/)
  assert.match(page,/class="hero-copy/)
  assert.match(page,/class="hero-illustration/)
  assert.match(page,/class="manager-metrics dashboard-stat-grid metrics"/)
  assert.match(page,/Học sinh/)
  assert.match(page,/Đã đăng ký/)
  assert.match(page,/Cần GV xử lý/)
  assert.match(page,/Cần chú ý/)
  assert.doesNotMatch(page,/Có thiết bị/)
  assert.match(page,/class="dashboard-main-grid"/)
  assert.match(page,/Công việc cần xử lý/)
  assert.match(page,/Tổng quan tiến độ/)
  assert.match(page,/class="progress-donut"/)
})

test('dashboard R6 keeps real week data and status feedback rather than mock-only content',()=>{
  const page=read('src/pages/DashboardPage.vue')
  assert.match(page,/useWeekData/)
  assert.match(page,/classMetrics/)
  assert.match(page,/managerQueue/)
  assert.match(page,/isFetching/)
  assert.match(page,/Đang đồng bộ/)
})

test('R6.2 uses the original favicon sidebar itself as the single hug-content island',()=>{
  const shell=read('src/layouts/AppShell.vue')
  const nav=read('src/components/layout/SidebarNav.vue')
  assert.doesNotMatch(shell,/class="nav-island"/)
  assert.match(shell,/\.sidebar\{[^}]*height:max-content/s)
  assert.match(shell,/\.sidebar\{[^}]*max-height:calc\(100vh - 24px\)/s)
  assert.match(shell,/\.nav-safe-zone\{[^}]*padding-top:24px/s)
  assert.match(nav,/\.side-nav\{[^}]*padding:/s)
  assert.doesNotMatch(shell,/\.nav-safe-zone :deep\(\.side-nav\)\{height:100%\}/)
})

test('R6.2 softens the vanilla pattern further without removing it',()=>{
  const themes=read('src/styles/themes.css')
  const shell=read('src/layouts/AppShell.vue')
  assert.match(themes,/--pattern-opacity:\s*\.58/)
  assert.match(themes,/--pattern-soft-overlay:\s*rgb\([^;]*\/\s*\.56\)/)
  assert.match(shell,/\.main::before[\s\S]*opacity:var\(--pattern-opacity\)/)
})
