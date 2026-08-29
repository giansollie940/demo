import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
const source=fs.readFileSync('src/pages/LoginPage.vue','utf8')
test('R7 login is panorama plus floating card with no GitHub UI',()=>{
  assert.match(source,/login-page-r7/)
  assert.match(source,/login-panorama/)
  assert.match(source,/login-card-float/)
  assert.match(source,/r7-login-students@2x\.png/)
  assert.match(source,/r7-login-panorama-soft@2x\.png/)
  assert.doesNotMatch(source,/GitHub|github|oauth-divider/i)
})
test('R7 login preserves auth flow, continuous autofill surface and reduced motion',()=>{
  assert.match(source,/auth\.login\(code\.value,\s*password\.value\)/)
  assert.match(source,/:-webkit-autofill/)
  assert.match(source,/--field-surface/)
  assert.match(source,/prefers-reduced-motion/)
  assert.match(source,/login-students-drift/)
})
