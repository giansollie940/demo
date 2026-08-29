import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
const read=file=>fs.readFileSync(file,'utf8')
test('R7 supersedes R6 dashboard geometry with focused components',()=>{const p=read('src/pages/DashboardPage.vue');assert.match(p,/DashboardHero/);assert.match(p,/KpiTrendCard/);assert.match(p,/PendingTasksTable/);assert.match(p,/WeeklyProgressCard/)})
test('R7 sidebar remains collapsible while expanded is the desktop default',()=>{const s=read('src/layouts/AppShell.vue');assert.match(s,/SidebarProfileCard/);assert.match(s,/sidebar-edge-toggle/);assert.match(s,/preferences\.sidebarCollapsed/)})
test('R7 preserves Vanilla background layer beneath the redesigned surfaces',()=>{const s=read('src/layouts/AppShell.vue');assert.match(s,/schoolPatternUrl/);assert.match(s,/\.main::before/);assert.match(s,/--pattern-opacity/)})
