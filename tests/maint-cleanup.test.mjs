import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = path => fs.readFileSync(path, 'utf8')

test('cleanup removes proven-dead components and unused StudySessionCard icon import', () => {
  assert.equal(fs.existsSync('src/components/tracking/SessionSummaryCard.vue'), false)
  assert.equal(fs.existsSync('src/components/weeks/WeekCalendarSetup.vue'), false)
  assert.doesNotMatch(read('src/components/registrations/StudySessionCard.vue'), /\bCalendarDays\b/)
})

test('shared utility modules replace exact duplicate helpers without changing public import paths', () => {
  const storage = read('src/features/storage/api.ts')
  const archive = read('src/features/archive/format.ts')
  const schedule = read('src/features/schedule/schedule-model.ts')
  const lifecycle = read('src/features/weeks/week-lifecycle.ts')
  const registration = read('src/features/registrations/registration-model.ts')
  assert.match(storage, /export \{ formatBytes \} from '\.\.\/shared\/format'/)
  assert.match(archive, /export \{ formatBytes \} from '\.\.\/shared\/format'/)
  assert.equal((storage.match(/function formatBytes/g) || []).length, 0)
  assert.equal((archive.match(/function formatBytes/g) || []).length, 0)
  assert.match(schedule, /import \{ addDaysISO \} from '\.\.\/shared\/date'/)
  assert.match(lifecycle, /import \{ addDaysISO \} from '\.\.\/shared\/date'/)
  assert.match(registration, /import \{ addDaysISO \} from '\.\.\/shared\/date'/)
  assert.equal((schedule.match(/function addDaysISO/g) || []).length, 0)
  assert.equal((lifecycle.match(/function addDaysISO/g) || []).length, 0)
  assert.equal((registration.match(/function addDaysISO/g) || []).length, 0)
})

test('cleanup removes unused dependency and stale dead exports', () => {
  const pkg = JSON.parse(read('package.json'))
  assert.equal(pkg.devDependencies?.['@vue/test-utils'], undefined)
  assert.doesNotMatch(read('src/features/storage/api.ts'), /CAPACITY_HOLD_MESSAGE/)
  assert.doesNotMatch(read('src/features/admin/admin-directory.ts'), /function deleteTeacher\b/)
  assert.doesNotMatch(read('src/features/admin/admin-directory.ts'), /function updateSchoolYearPeriods\b/)
  assert.doesNotMatch(read('src/features/statistics/statistics-model.ts'), /function statisticsTrend\b/)
  assert.doesNotMatch(read('src/features/weeks/week-mutations.ts'), /function rebaseWeekCalendarMutation\b/)
  assert.doesNotMatch(read('src/features/weeks/week-editor-model.ts'), /function validateWeek1Start\b/)
})

test('minimal GitHub Pages packaging carries the repository ignore policy', () => {
  assert.match(read('scripts/package-github-pages-minimal.mjs'), /requiredRootFiles = \[\s*'\.gitignore',/)
})
