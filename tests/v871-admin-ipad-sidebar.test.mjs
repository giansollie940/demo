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

test('desktop sidebar is a floating iPad-like panel instead of an edge-attached rail',()=>{
  const source=read('src/layouts/AppShell.vue')
  assert.match(source,/grid-template-columns:calc\(var\(--sidebar-expanded\) \+ 18px\)/)
  assert.match(source,/top:12px/)
  assert.match(source,/height:calc\(100vh - 24px\)/)
  assert.match(source,/margin:0 0 0 12px/)
  assert.match(source,/border-radius:26px/)
  assert.match(source,/backdrop-filter:blur\(22px\) saturate\(1\.18\)/)
  assert.match(source,/box-shadow:0 20px 54px/)
})

test('bubble navigation keeps the short rotating hover ring inside the floating panel',()=>{
  const source=read('src/components/layout/SidebarNav.vue')
  assert.match(source,/conic-gradient/)
  assert.match(source,/animation:nav-ring-spin \.62s/)
  assert.match(source,/\.nav-item\{[^}]*border-radius:17px/s)
})
