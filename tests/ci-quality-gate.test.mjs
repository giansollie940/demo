import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (file) => fs.readFileSync(file, 'utf8')

test('week component unit tests follow the current popover contract instead of hidden-input markup', () => {
  const spec = read('tests/unit/weeks-components.spec.ts')
  assert.doesNotMatch(spec, /expect\(html\)\.toContain\(['"]type=["']datetime-local/)
  assert.match(spec, /01\/11\/2026 · 20:00/)
  assert.match(spec, /Hãy chọn ngày và giờ hết hạn\./)
})

test('repository exposes one aggregate CI quality gate', () => {
  const pkg = JSON.parse(read('package.json'))
  assert.equal(pkg.scripts['verify:quality'], 'node scripts/run-quality-gate.mjs')
  assert.equal(fs.existsSync('scripts/run-quality-gate.mjs'), true)

  const workflow = read('.github/workflows/deploy-pages.yml')
  assert.match(workflow, /name:\s*Quality gate[\s\S]*run:\s*npm run verify:quality/)
  assert.doesNotMatch(workflow, /name:\s*Static source tests/)
  assert.doesNotMatch(workflow, /name:\s*Unit tests/)
  assert.doesNotMatch(workflow, /name:\s*Typecheck/)
})

test('WeekEditorCard exposes actionable closed-state deadline validation accessibly', () => {
  const component = read('src/components/weeks/WeekEditorCard.vue')
  assert.match(component, /deadlineSummaryHelpId/)
  assert.match(component, /:aria-invalid="deadlineInvalid \? 'true' : undefined"/)
  assert.match(component, /Hãy chọn ngày và giờ hết hạn\./)
})
