import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()

test('static source tests do not depend on ImageMagick identify', () => {
  const testsDir = path.join(root, 'tests')
  const offenders = fs.readdirSync(testsDir)
    .filter((name) => name.endsWith('.test.mjs'))
    .filter((name) => /execFileSync\(\s*['"]identify['"]/.test(fs.readFileSync(path.join(testsDir, name), 'utf8')))
  assert.deepEqual(offenders, [], `portable CI cannot require global ImageMagick: ${offenders.join(', ')}`)
})
