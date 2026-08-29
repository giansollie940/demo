import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
const shell=fs.readFileSync('src/layouts/AppShell.vue','utf8')
const nav=fs.readFileSync('src/components/layout/SidebarNav.vue','utf8')
const prefs=fs.readFileSync('src/stores/preferences.ts','utf8')
test('R7 sidebar defaults expanded and includes profile card',()=>{
  assert.match(prefs,/sidebarCollapsed=ref\(localStorage\.getItem\(SIDEBAR_KEY\)==='1'\)/)
  assert.match(shell,/SidebarProfileCard/)
  assert.match(shell,/sidebar-edge-toggle/)
  assert.match(shell,/sidebar-r7/)
})
test('compact sidebar keeps accessible labels and tooltips',()=>{
  assert.match(nav,/:aria-label="collapsed\?item\.label:undefined"/)
  assert.match(nav,/nav-tooltip/)
  assert.match(nav,/nav-label/)
})
