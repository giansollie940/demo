import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read=(path)=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8')

test('admin navigation consolidates system management into one sidebar item',()=>{
  const source=read('src/features/navigation/navigation.ts')
  assert.match(source,/item\('Quản trị hệ thống','\/admin','ShieldCheck',\['admin'\]\)/)
  assert.doesNotMatch(source,/item\('Năm học','\/admin\?tab=years'/)
  assert.doesNotMatch(source,/item\('Lớp học','\/admin\?tab=classes'/)
  assert.doesNotMatch(source,/item\('Giáo viên','\/admin\?tab=teachers'/)
  assert.doesNotMatch(source,/item\('Phân quyền','\/admin\?tab=permissions'/)
  assert.match(source,/admin:\['Quản trị hệ thống'\]/)
  assert.doesNotMatch(source,/admin:\[[^\]]*'Cài đặt'/s)
})

test('admin page keeps the management areas as internal tabs',()=>{
  const source=read('src/pages/AdminPage.vue')
  for(const id of ['overview','years','classes','teachers','permissions']){
    assert.match(source,new RegExp(`id:'${id}'`))
  }
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
