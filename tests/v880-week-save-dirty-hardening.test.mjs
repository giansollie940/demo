import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const source=fs.readFileSync('src/pages/WeeksPage.vue','utf8')

test('week master column is balanced wider on laptop while remaining bounded',()=>{
  assert.match(source,/grid-template-columns:clamp\(360px,30vw,400px\) minmax\(0,1fr\)/)
  assert.match(source,/week-master-scroll\{[^}]*overflow-y:auto/)
})

test('week save establishes its clean baseline from the canonical mutation result',()=>{
  assert.match(source,/const canonical=await saveWeekSettingsMutation\(/)
  assert.match(source,/loadDrafts\(canonical\)/)
  assert.match(source,/dirtyEditor\.markClean\(\)/)
})

test('week dirty registry is synchronous and server reloads do not race an active save',()=>{
  assert.match(source,/watch\(isDirty,value=>dirtyEditor\.setDirty\(value\),\{immediate:true,flush:'sync'\}\)/)
  assert.match(source,/if\(status\.value==='saving'\)return/)
})


test('week save action lives beside the edited week and exposes dirty feedback',()=>{
  assert.doesNotMatch(source,/class="header-actions"[^>]*>[\s\S]*?<AppButton[^>]*@click="save"/)
  assert.match(source,/:dirty="isDirty"/)
  assert.match(source,/:save-state="status"/)
  assert.match(source,/@save="save"/)
})
