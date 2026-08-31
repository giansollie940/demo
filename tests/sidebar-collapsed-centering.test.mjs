import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root=resolve(import.meta.dirname,'..')
const sidebar=readFileSync(resolve(root,'src/components/layout/SidebarNav.vue'),'utf8')

test('collapsed sidebar centers static icons without changing dock hover behavior',()=>{
  assert.match(sidebar,/\.collapsed\{padding-inline:0;gap:8px\}/)
  assert.match(sidebar,/\.collapsed \.nav-item\{justify-content:center;min-height:48px;padding:5px 0;/)

  // Existing hover/dock behavior remains intentionally unchanged.
  assert.match(sidebar,/function dockLiftX\(index:number\)\{return hoveredIndex\.value===index\?\(props\.collapsed\?14:10\):0\}/)
  assert.match(sidebar,/if\(distance===0\)return props\.collapsed\?1\.18:1\.075/)
})
