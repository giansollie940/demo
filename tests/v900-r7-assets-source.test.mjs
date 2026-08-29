import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const required = [
  'src/assets/images/r7-login-students@2x.png',
  'src/assets/images/r7-dashboard-students@2x.png',
  'src/assets/images/r7-login-panorama-soft@2x.png',
]

test('R7 high density artwork exists and legacy R6 hero asset is absent', () => {
  for (const file of required) {
    assert.equal(fs.existsSync(path.join(root, file)), true, file)
  }
  assert.equal(fs.existsSync(path.join(root, 'src/assets/images/student-group-dashboard-blend.png')), false)
  assert.equal(fs.existsSync(path.join(root, 'public/assets/images/student-group-dashboard-blend.png')), false)
  assert.equal(fs.existsSync(path.join(root, 'public/assets/images/login-hero.png')), false)
})
