import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
<<<<<<< HEAD
const read=file=>fs.readFileSync(file,'utf8')
test('R7 login keeps continuous autofill fields and illustration-only motion',()=>{const p=read('src/pages/LoginPage.vue');assert.match(p,/input:-webkit-autofill/);assert.match(p,/login-students-drift/);assert.match(p,/prefers-reduced-motion/);assert.doesNotMatch(p,/GitHub|github/i)})
test('R7 dashboard uses dedicated high-density student artwork',()=>{const p=read('src/pages/DashboardPage.vue');assert.match(p,/r7-dashboard-students@2x\.png/);assert.doesNotMatch(p,/teacher-dashboard-illustration|student-group-dashboard-blend/)})
test('R7 sidebar uses original favicon shell and profile block without nested nav island',()=>{const s=read('src/layouts/AppShell.vue');assert.match(s,/class="side-head"/);assert.match(s,/SidebarProfileCard/);assert.doesNotMatch(s,/nav-island/)})
=======
import path from 'node:path'

const root=path.resolve(new URL('..',import.meta.url).pathname)
const read=(file)=>fs.readFileSync(path.join(root,file),'utf8')

test('R6.2 reuses the original favicon sidebar as the single hug-content island',()=>{
  const shell=read('src/layouts/AppShell.vue')
  assert.match(shell,/class="side-head"/)
  assert.match(shell,/faviconUrl/)
  assert.doesNotMatch(shell,/class="nav-island"/)
  assert.doesNotMatch(shell,/\.nav-island\{/)
  assert.match(shell,/\.sidebar\{[^}]*height:max-content/s)
  assert.match(shell,/\.sidebar\{[^}]*max-height:calc\(100vh - 24px\)/s)
  assert.match(shell,/@media\(max-width:760px\)[\s\S]*\.sidebar[^}]*height:calc\(100vh - 24px\)/)
})

test('R6.2 softens Vanilla pattern to the approved lighter visual priority',()=>{
  const themes=read('src/styles/themes.css')
  assert.match(themes,/--pattern-opacity:\s*\.58;/)
  assert.match(themes,/--pattern-filter:\s*saturate\(\.78\)\s+contrast\(\.90\);/)
  assert.match(themes,/--pattern-soft-overlay:\s*rgb\(255 255 255 \/ \.56\);/)
})

test('R6.2 login autofill paints the entire field and removes split white ends',()=>{
  const login=read('src/pages/LoginPage.vue')
  assert.match(login,/\.field:has\(input:-webkit-autofill\)/)
  assert.match(login,/input:-webkit-autofill/)
  assert.match(login,/-webkit-box-shadow:0 0 0 1000px/)
  assert.match(login,/-webkit-text-fill-color:var\(--text\)/)
})

test('R6.2 login illustration uses restrained CSS motion with reduced-motion fallback',()=>{
  const login=read('src/pages/LoginPage.vue')
  assert.match(login,/animation:login-hero-float/)
  assert.match(login,/@keyframes login-hero-float/)
  assert.match(login,/@media\(prefers-reduced-motion:reduce\)[\s\S]*\.hero-card/)
})

test('R6.2 dashboard uses a student study group illustration instead of teacher illustration',()=>{
  const dashboard=read('src/pages/DashboardPage.vue')
  assert.match(dashboard,/student-group-dashboard(?:-blend)?\.png/)
  assert.doesNotMatch(dashboard,/teacher-dashboard-illustration\.png/)
  assert.ok(fs.existsSync(path.join(root,'public/assets/images/student-group-dashboard.png')))
})
>>>>>>> parent of 66b0142 (demo 36)
