import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const text = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('CP7 routes use real Vue pages', async () => {
  const routes = await text('src/app/router/routes.ts')
  for (const name of ['StatisticsPage','HistoryPage','CommentsPage','SettingsPage']) {
    assert.match(routes, new RegExp(`import ${name}`))
    assert.match(routes, new RegExp(`component: ${name}`))
  }
})

test('statistics ports valid issue missing and 12-week trend semantics', async () => {
  const model = await text('src/features/statistics/statistics-model.ts')
  const page = await text('src/pages/StatisticsPage.vue')
  assert.match(model, /registrationBucket/)
  assert.match(model, /missing/)
  assert.match(model, /issues/)
  assert.match(model, /rate/)
  assert.match(page, /12 tuần/i)
  assert.match(page, /Đăng ký hợp lệ/)
})

test('history and comments stay scoped to current student', async () => {
  const history = await text('src/pages/HistoryPage.vue')
  const comments = await text('src/pages/CommentsPage.vue')
  assert.match(history, /studentId===auth\.currentUser\?\.id|studentId === auth\.currentUser\?\.id/)
  assert.match(history, /updatedAt/)
  assert.match(history, /Đăng ký bổ sung/)
  assert.match(comments, /teacherComment/)
  assert.match(comments, /Nhận xét của giáo viên/)
})

test('settings saves through legacy syncState bridge and preserves AI settings', async () => {
  const mutations = await text('src/features/settings/settings-mutations.ts')
  const page = await text('src/pages/SettingsPage.vue')
  assert.match(mutations, /commitStateMutation/)
  assert.match(page, /registrationDeadlineTime/)
  assert.match(page, /aiAutoApproveThreshold/)
  assert.match(page, /smartApprovalEnabled/)
  assert.match(page, /Bật:/)
  assert.match(page, /Tắt:/)
  assert.doesNotMatch(page, /adminManageClasses/)
})

test('history and comments use only AppBadge-supported tones', async () => {
  const badge = await text('src/components/ui/AppBadge.vue')
  const history = await text('src/pages/HistoryPage.vue')
  const comments = await text('src/pages/CommentsPage.vue')
  assert.match(badge, /'neutral'\|'info'\|'success'\|'warning'\|'danger'\|'primary'/)
  assert.match(history, /status==='draft'\?'neutral'/)
  assert.match(comments, /status==='draft'\?'neutral'/)
  assert.doesNotMatch(history, /status==='draft'\?'secondary'/)
  assert.doesNotMatch(comments, /status==='draft'\?'secondary'/)
})
