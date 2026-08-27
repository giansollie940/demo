import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root=path.resolve(new URL('..',import.meta.url).pathname)
const read=(file)=>fs.readFileSync(path.join(root,file),'utf8')

test('sidebar combines compact flat navigation with collapsed icon rail and no visual groups',()=>{
  const navigation=read('src/features/navigation/navigation.ts')
  const sidebar=read('src/components/layout/SidebarNav.vue')
  assert.doesNotMatch(navigation,/NavigationGroup|visibleNavigationGroups|HỌC TẬP|HỖ TRỢ LỚP|CÁ NHÂN|QUẢN LÝ|PHÂN TÍCH|QUẢN TRỊ|HỆ THỐNG/)
  assert.match(sidebar,/visibleNavigation\(/)
  assert.match(sidebar,/v-for="\(item,index\) in items"/)
  assert.doesNotMatch(sidebar,/nav-group|nav-group-label|v-for="group in groups"/)
  assert.match(sidebar,/nav-tooltip/)
  assert.match(sidebar,/min-height:4[6-8]px/)
})

test('light palette is warm bright and vanilla-inspired rather than cool blue dominated',()=>{
  const tokens=read('src/styles/tokens.css')
  const themes=read('src/styles/themes.css')
  const base=read('src/styles/base.css')
  assert.match(tokens,/--color-primary:#6846dc/i)
  assert.match(tokens,/--color-coral:#ed6673/i)
  assert.match(tokens,/--color-sun:#e3a117/i)
  assert.match(themes,/--bg:#fff9f4/i)
  assert.match(themes,/--surface:#fffdfc/i)
  assert.match(themes,/--wash-peach:/)
  assert.match(themes,/--pattern-opacity:\.1[0-5]/)
  assert.match(base,/var\(--color-coral\)/)
  assert.match(base,/var\(--color-sun\)/)
})

test('school pattern is an independent layer so content surfaces cannot hide it',()=>{
  const shell=read('src/layouts/AppShell.vue')
  assert.match(shell,/\.main::before/)
  assert.match(shell,/background-image:\s*var\(--school-pattern-image\)/)
  assert.match(shell,/opacity:\s*var\(--pattern-opacity\)/)
  assert.match(shell,/pointer-events:none/)
  assert.match(shell,/\.content\{[^}]*z-index:1/s)
  assert.doesNotMatch(shell,/background-blend-mode:\s*normal,multiply/)
})

test('dark mode uses warm charcoal plum surfaces and suppresses the pattern without removing it',()=>{
  const themes=read('src/styles/themes.css')
  assert.match(themes,/\[data-theme='dark'\][\s\S]*--bg:#17151c/i)
  assert.match(themes,/--surface:#211e29/i)
  assert.match(themes,/--text:#f7f2ee/i)
  assert.match(themes,/--pattern-opacity:\.0(?:2|3)/)
  assert.doesNotMatch(themes,/--bg:#11131d/)
})

test('theme and shell surfaces transition together for smooth light dark switching',()=>{
  const base=read('src/styles/base.css')
  const shell=read('src/layouts/AppShell.vue')
  assert.match(base,/transition:background(?:-color)?[^;]*var\(--theme-transition\)/)
  assert.match(shell,/var\(--theme-transition\)/)
  assert.match(shell,/transition:[^}]*background[^}]*var\(--theme-transition\)/s)
})

test('flat menu accents favor warm coral sun and lilac instead of group-based cool mappings',()=>{
  const sidebar=read('src/components/layout/SidebarNav.vue')
  assert.match(sidebar,/\.nav-item:nth-child\(2\).*--nav-accent:var\(--color-coral\)/s)
  assert.match(sidebar,/\.nav-item:nth-child\(3\).*--nav-accent:var\(--color-sun\)/s)
  assert.match(sidebar,/\.nav-item:nth-child\(4\).*--nav-accent:var\(--color-mint\)/s)
  assert.doesNotMatch(sidebar,/\.nav-group:nth-child/)
})
