import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read=(path)=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8')

test('admin navigation exposes seven direct system destinations',()=>{
  const source=read('src/features/navigation/navigation.ts')
  for(const label of ['Tổng quan','Năm học','Lớp học','Học sinh','Giáo viên','Phân quyền','Nhật ký hệ thống']) assert.match(source,new RegExp(`item\\('${label}'`))
  assert.match(source,/admin:\['Tổng quan','Năm học','Lớp học','Học sinh','Giáo viên','Phân quyền','Nhật ký hệ thống'\]/)
  assert.doesNotMatch(source,/item\('Quản trị hệ thống'/)
})

test('admin page resolves seven direct query areas without an internal AppTabs layer',()=>{
  const source=read('src/pages/AdminPage.vue')
  assert.match(source,/validTabs=\['overview','years','classes','students','teachers','permissions','audit'\]/)
  assert.doesNotMatch(source,/AppTabs/)
})

test('desktop R7 sidebar is a floating expanded panel with compact fallback',()=>{
  const source=read('src/layouts/AppShell.vue')
  assert.match(source,/grid-template-columns:\s*calc\(var\(--sidebar-expanded\) \+ 24px\)/)
  assert.match(source,/\.sidebar-r7\s*\{[\s\S]*position:\s*sticky[\s\S]*top:\s*12px/s)
  assert.match(source,/height:\s*calc\(100vh - 24px\)/)
  assert.match(source,/margin-left:\s*12px/)
  assert.match(source,/border-radius:\s*27px/)
  assert.match(source,/backdrop-filter:\s*blur\(24px\) saturate\(1\.12\)/)
  assert.match(source,/box-shadow:\s*0 18px 44px/)
  assert.match(source,/\.shell\.collapsed \.sidebar-r7\s*\{\s*width:\s*var\(--sidebar-collapsed\)/)
})
test('bubble navigation keeps the short rotating hover ring inside the floating panel',()=>{
  const source=read('src/components/layout/SidebarNav.vue')
  assert.match(source,/conic-gradient/)
  assert.match(source,/animation:nav-ring-spin \.62s/)
  assert.match(source,/\.nav-item\{[^}]*border-radius:17px/s)
})
