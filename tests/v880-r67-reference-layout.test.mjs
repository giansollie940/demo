import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const sha = text => createHash('sha256').update(text).digest('hex')
const scriptBlock = source => source.match(/<script setup lang="ts">([\s\S]*?)<\/script>/)?.[1] ?? ''

const login = read('src/pages/LoginPage.vue')
const dashboard = read('src/pages/DashboardPage.vue')

test('R6.7 keeps interaction code frozen while changing visual layout only', () => {
  assert.equal(sha(read('src/layouts/AppShell.vue')), '9858631affd321c1760bc8aa31ebb644bba48368cb65a5d9fe5d2bf0f68be469')
  assert.equal(sha(read('src/components/layout/SidebarNav.vue')), 'c80073b02851bc09541b429a5ee3051a1184399bf005a5b3592ca0ed4e0f981e')
  assert.equal(sha(read('src/components/layout/TopBar.vue')), 'd757994e895689dae87e95d3e2db157f63125ea8a1aec8e12cc0306eb1cbdf23')
  assert.equal(sha(scriptBlock(login)), '2e2e7172c3f2d9f100696065a5f8b6a55a527dafbedb2ab65e4e283398d257d4')
  assert.equal(sha(scriptBlock(dashboard)), 'd036e9935c053695f04ac11c4873e638ff9e25f02feb2b028478b37c7e3ac414')
})

test('R6.7 login uses panorama composition and readable typography', () => {
  assert.match(login, /\.login-shell\s*\{[^}]*position:\s*relative;[^}]*grid-template-columns:\s*1fr;/s)
  assert.match(login, /\.login-panel\s*\{[^}]*position:\s*absolute;[^}]*right:\s*clamp\([^)]*\);[^}]*width:\s*min\(380px,/s)
  assert.match(login, /\.visual-copy h1\s*\{[^}]*font-size:\s*clamp\(3rem,[^,]+,\s*3\.5rem\);[^}]*line-height:\s*1\.04;/s)
  assert.match(login, /\.form-heading h2\s*\{[^}]*font-size:\s*clamp\(1\.65rem,[^,]+,\s*2rem\);/s)
  assert.match(login, /\.login-form label > span\s*\{[^}]*font-size:\s*\.82rem;/s)
  assert.match(login, /\.field input\s*\{[^}]*font-size:\s*\.95rem;[^}]*line-height:\s*1\.45;/s)
  assert.match(login, /\.submit\s*\{[^}]*font-size:\s*\.92rem;/s)
})

test('R6.7 dashboard follows the approved reference proportions with larger type', () => {
  assert.match(dashboard, /\.dashboard-page\{max-width:1296px;/)
  assert.match(dashboard, /\.dashboard-hero\{min-height:132px;/)
  assert.match(dashboard, /\.hero-copy h1\{[^}]*font-size:clamp\(1\.95rem,[^,]+,2\.25rem\);[^}]*line-height:1\.08;/s)
  assert.match(dashboard, /\.hero-copy p\{[^}]*font-size:\.9rem;/s)
  assert.match(dashboard, /\.metrics b\{font-size:1\.82rem;/)
  assert.match(dashboard, /\.metrics span\{[^}]*font-size:\.82rem;/s)
  assert.match(dashboard, /\.panel-heading h2\{[^}]*font-size:1\.28rem;/s)
  assert.match(dashboard, /\.task-row b\{font-size:\.86rem;/)
  assert.match(dashboard, /\.task-row small\{[^}]*font-size:\.74rem;/s)
  assert.match(dashboard, /\.overview-legend span\{font-size:\.78rem;?/)
})
