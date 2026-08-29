import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
const login=fs.readFileSync('src/pages/LoginPage.vue','utf8');const dash=fs.readFileSync('src/pages/DashboardPage.vue','utf8')
test('R7 login retains R6.5 autofill fix inside the new panorama card',()=>{assert.match(login,/--field-surface/);assert.match(login,/overflow:\s*hidden/);assert.match(login,/-webkit-box-shadow:\s*0 0 0 1000px var\(--field-surface\) inset/)})
test('R7 login motion remains illustration-only',()=>{assert.match(login,/login-students-drift/);assert.match(login,/\.login-students\{animation:none!important/);assert.doesNotMatch(login,/login-hero-float|login-hero-drift/)})
test('R7 removes obsolete R6 hero paths',()=>{assert.match(dash,/r7-dashboard-students@2x\.png/);assert.doesNotMatch(dash,/student-group-dashboard|teacher-dashboard-illustration/)})
