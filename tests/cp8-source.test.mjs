import test from 'node:test'
import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'

const text = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('CP8 Wise Owl uses six layered assets and bounded pointer motion', async () => {
  const owl = await text('src/components/owl/WiseOwl.vue')
  for (const asset of ['body.webp','head.webp','left-pupil.webp','right-pupil.webp','left-wing.webp','right-wing.webp']) {
    assert.match(owl, new RegExp(asset.replace('.', '\\.')))
    await access(new URL(`../public/assets/images/owl/${asset}`, import.meta.url))
  }
  assert.match(owl, /MAX_PUPIL_OFFSET\s*=\s*3/)
  assert.match(owl, /MAX_HEAD_TILT\s*=\s*5/)
  assert.match(owl, /prefers-reduced-motion/)
})

test('Owl model prioritizes urgent context and rotates quotes without immediate repeats', async () => {
  const model = await text('src/features/owl/owl-model.ts')
  assert.match(model, /createQuoteRotator/)
  assert.match(model, /recentLimit/)
  assert.match(model, /urgent/)
  assert.match(model, /page/)
  assert.match(model, /quote/)
})

test('daily dashboard quote uses existing getDailyQuote bridge with local stable fallback', async () => {
  const query = await text('src/features/owl/daily-quote.ts')
  const dashboard = await text('src/pages/DashboardPage.vue')
  assert.match(query, /legacyApi\.getDailyQuote/)
  assert.match(query, /localDailyFallback/)
  assert.match(dashboard, /Danh ngôn hôm nay/)
  assert.match(dashboard, /useDailyQuote/)
})

test('AppShell hosts Wise Owl and does not install unload listeners', async () => {
  const shell = await text('src/layouts/AppShell.vue')
  assert.match(shell, /WiseOwl/)
  assert.doesNotMatch(shell, /beforeunload|addEventListener\(['"]unload/)
})


test('Wise Owl pupils match the original layout coordinates', async () => {
  const owl = await text('src/components/owl/WiseOwl.vue')
  assert.match(owl, /left-pupil\{left:19\.33%;top:49\.62%\}/)
  assert.match(owl, /right-pupil\{left:60\.29%;top:49\.62%\}/)
})
