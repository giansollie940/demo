import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root=path.resolve(new URL('..',import.meta.url).pathname)
const read=(file)=>fs.readFileSync(path.join(root,file),'utf8')

test('admin sidebar exposes seven direct system destinations without an intermediate admin menu item',()=>{
  const nav=read('src/features/navigation/navigation.ts')
  for(const label of ['Tổng quan','Năm học','Lớp học','Học sinh','Giáo viên','Phân quyền','Nhật ký hệ thống']) assert.match(nav,new RegExp(`item\\('${label.replace(/[.*+?^${}()|[\\]\\]/g,'\\$&')}'`))
  assert.match(nav,/admin:\s*\['Tổng quan','Năm học','Lớp học','Học sinh','Giáo viên','Phân quyền','Nhật ký hệ thống'\]/)
  assert.doesNotMatch(nav,/item\('Quản trị hệ thống'/)
})

test('admin page includes learner management and audit log areas while teacher operations remain outside admin',()=>{
  const page=read('src/pages/AdminPage.vue')
  assert.match(page,/validTabs=\['overview','years','classes','students','teachers','permissions','audit'\]/)
  assert.match(page,/tab==='students'/)
  assert.match(page,/tab==='audit'/)
  assert.match(page,/AdminStudentCard/)
  assert.match(page,/AdminAuditLog/)
  assert.match(page,/hardDeleteUser/)
  assert.match(page,/hardDeleteTeacher/)
})

test('admin hard delete is root-admin only with self root-admin and active teacher assignment guards',()=>{
  const edge=read('supabase/functions/admin-delete-user/index.ts')
  assert.match(edge,/requireRootAdmin/)
  assert.match(edge,/mode===['"]hard['"]|mode\s*===\s*['"]hard['"]/)
  assert.match(edge,/actor\.id===userId|userId===actor\.id/)
  assert.match(edge,/ROOT_ADMIN_IMMUTABLE|target\.role===['"]admin['"]/)
  assert.match(edge,/class_teachers/)
  assert.match(edge,/TEACHER_HAS_ACTIVE_ASSIGNMENTS/)
  assert.match(edge,/admin\.auth\.admin\.deleteUser\(userId\)/)
  assert.match(edge,/ADMIN_HARD_DELETE_USER/)
})

test('teacher delete remains soft while admin bridge exposes explicit hard delete',()=>{
  const bridge=read('public/supabase-service.js')
  const types=read('src/types/legacy.ts')
  assert.match(bridge,/teacherDeleteUser[\s\S]*mode:\s*['"]soft['"]/)
  assert.match(bridge,/adminHardDeleteUser/)
  assert.match(bridge,/mode:\s*['"]hard['"]/)
  assert.match(types,/adminHardDeleteUser\(userId:\s*string,\s*confirmCode:\s*string,\s*confirmPhrase:\s*string\)/)
})

test('audit endpoint supports root-admin read mode with bounded filters and audit UI has detail drawer',()=>{
  const edge=read('supabase/functions/audit-log/index.ts')
  const ui=read('src/components/admin/AdminAuditLog.vue')
  assert.match(edge,/action===['"]list['"]|body\?\.action===['"]list['"]/)
  assert.match(edge,/requireRootAdmin/)
  assert.match(edge,/from\(['"]audit_logs['"]\).*select/s)
  assert.match(edge,/limit/)
  assert.match(ui,/Nhật ký hệ thống/)
  assert.match(ui,/before|oldData/i)
  assert.match(ui,/after|newData/i)
  assert.match(ui,/drawer|audit-detail/i)
})

test('vertical dock moves hovered item to the right and opens real vertical space around it',()=>{
  const sidebar=read('src/components/layout/SidebarNav.vue')
  assert.match(sidebar,/dockGap/)
  assert.match(sidebar,/--dock-gap-before/)
  assert.match(sidebar,/--dock-gap-after/)
  assert.match(sidebar,/translateX\(var\(--dock-lift-x\)\)/)
  assert.doesNotMatch(sidebar,/translate3d\([^,]+,-[345]px/)
  assert.match(sidebar,/distance===1/)
  assert.match(sidebar,/distance===2/)
  assert.match(sidebar,/margin-top:var\(--dock-gap-before\)/)
  assert.match(sidebar,/margin-bottom:var\(--dock-gap-after\)/)
})

test('brand safe zone keeps first dock item away from favicon even at maximum magnification',()=>{
  const shell=read('src/layouts/AppShell.vue')
  const sidebar=read('src/components/layout/SidebarNav.vue')
  assert.match(shell,/nav-safe-zone[^}]*padding-top:\s*(?:2[02468]|3\d)px/)
  assert.match(sidebar,/transform-origin:left center/)
  assert.match(sidebar,/--dock-lift-x/)
})

test('light mode keeps vanilla school image under a subtle soft overlay while dark mode fades a charcoal overlay above it',()=>{
  const shell=read('src/layouts/AppShell.vue')
  const themes=read('src/styles/themes.css')
  const tokens=read('src/styles/tokens.css')
  assert.match(shell,/\.main::before[\s\S]*background-image:var\(--school-pattern-image\)/)
  assert.match(shell,/\.main::after[\s\S]*var\(--pattern-soft-overlay\)[\s\S]*var\(--pattern-dark-overlay\)/)
  assert.match(shell,/\.main::before[\s\S]*opacity:var\(--pattern-opacity\)/)
  assert.doesNotMatch(shell,/\.main::before[\s\S]*mix-blend-mode:multiply/)
  assert.match(themes,/--pattern-soft-overlay:rgb\([^;]*\/\s*\.56\)/)
  assert.match(themes,/--pattern-dark-overlay:transparent/)
  assert.match(themes,/\[data-theme='dark'\][\s\S]*--pattern-soft-overlay:transparent/)
  assert.match(themes,/\[data-theme='dark'\][\s\S]*--pattern-dark-overlay:/)
  assert.match(tokens,/--theme-transition:\s*2(?:5|6|7|8|9)0ms|--theme-transition:\s*\.2[5-9]s/)
})

test('AppCard supports zero padding for edge-to-edge audit tables',()=>{
  const card=read('src/components/ui/AppCard.vue')
  assert.match(card,/padding\?:\s*['"]none['"]\|['"]sm['"]\|['"]md['"]\|['"]lg['"]|padding\?:\s*['"]sm['"]\|['"]md['"]\|['"]lg['"]\|['"]none['"]/)
  assert.match(card,/\.pad-none\s*\{\s*padding:\s*0/)
})
