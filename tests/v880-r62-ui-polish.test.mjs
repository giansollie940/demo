import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
const read=file=>fs.readFileSync(file,'utf8')
test('R7 login keeps continuous autofill fields and illustration-only motion',()=>{const p=read('src/pages/LoginPage.vue');assert.match(p,/input:-webkit-autofill/);assert.match(p,/login-students-drift/);assert.match(p,/prefers-reduced-motion/);assert.doesNotMatch(p,/GitHub|github/i)})
test('R7 dashboard uses dedicated high-density student artwork',()=>{const p=read('src/pages/DashboardPage.vue');assert.match(p,/r7-dashboard-students@2x\.png/);assert.doesNotMatch(p,/teacher-dashboard-illustration|student-group-dashboard-blend/)})
test('R7 sidebar uses original favicon shell and profile block without nested nav island',()=>{const s=read('src/layouts/AppShell.vue');assert.match(s,/class="side-head"/);assert.match(s,/SidebarProfileCard/);assert.doesNotMatch(s,/nav-island/)})
