import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
const read=file=>fs.readFileSync(file,'utf8')
test('R7 Figma source is represented by panorama login and reference-density dashboard',()=>{const l=read('src/pages/LoginPage.vue');const d=read('src/pages/DashboardPage.vue');assert.match(l,/login-panorama/);assert.match(l,/login-card-float/);assert.match(d,/dashboard-kpi-grid/);assert.match(d,/dashboard-workspace-r7/)})
test('R7 desktop sidebar toggle remains visible and accessible',()=>{const s=read('src/layouts/AppShell.vue');assert.match(s,/z-index:\s*65/);assert.match(s,/right:\s*-17px/);assert.match(s,/Mở rộng thanh điều hướng/);assert.match(s,/Thu gọn thanh điều hướng/)})
test('R7 compact state still exposes Mac-like tooltip navigation',()=>{const n=read('src/components/layout/SidebarNav.vue');assert.match(n,/\.collapsed \.nav-item/);assert.match(n,/nav-tooltip/);assert.match(n,/dockScale/)})
