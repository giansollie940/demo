import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const source = fs.readFileSync('src/pages/DashboardPage.vue', 'utf8')

test('R7.1 dashboard only imports supported Lucide clipboard symbols', () => {
  assert.doesNotMatch(source, /\bClipboardClock\b/)
  assert.match(source, /import\s*\{[^}]*ClipboardList[^}]*\}\s*from\s*['"]lucide-vue-next['"]/s)
  assert.match(source, /:icon="ClipboardList"/)
})
