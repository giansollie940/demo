import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
const login=fs.readFileSync('src/pages/LoginPage.vue','utf8')
const dashboard=fs.readFileSync('src/pages/DashboardPage.vue','utf8')
const shell=fs.readFileSync('src/layouts/AppShell.vue','utf8')
test('R7 responsive contracts are explicit',()=>{
  assert.match(login,/@media \(max-width: 980px\)/)
  assert.match(login,/@media \(max-width: 620px\)/)
  assert.match(dashboard,/grid-template-columns:\s*repeat\(2,minmax\(0,1fr\)\)/)
  assert.match(dashboard,/@media\(max-width:760px\)|@media \(max-width: 760px\)/)
  assert.match(shell,/@media\(max-width:900px\)|@media \(max-width: 900px\)/)
})
test('R7 source no longer references superseded R6 dashboard artwork',()=>{
  const src=fs.readdirSync('src/assets/images')
  assert.equal(src.includes('student-group-dashboard-blend.png'),false)
  assert.doesNotMatch(login,/login-hero\.png/)
})
