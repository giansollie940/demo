import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const text = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('Bright Learning design system exposes a balanced student-friendly color palette', async () => {
  const tokens = await text('src/styles/tokens.css')
  for (const token of ['--color-sky','--color-mint','--color-sun','--color-coral','--color-pink','--color-lilac']) {
    assert.match(tokens, new RegExp(token))
  }
  assert.match(tokens, /--gradient-primary/)
  assert.match(tokens, /--gradient-celebrate/)
})

test('light and dark themes expose colorful soft surfaces without neon inversion', async () => {
  const themes = await text('src/styles/themes.css')
  for (const token of ['--wash-violet','--wash-sky','--wash-mint','--wash-sun','--wash-coral','--wash-pink']) {
    assert.match(themes, new RegExp(token))
  }
  assert.doesNotMatch(themes, /filter:\s*invert/)
})

test('topbar class and week context use larger readable typography', async () => {
  const topbar = await text('src/components/layout/TopBar.vue')
  assert.match(topbar, /\.school-year-bubble select\{[^}]*font-size:\.95rem/)
  assert.match(topbar, /\.compact\{[^}]*font-size:\.86rem/)
  assert.match(topbar, /\.compact select\{[^}]*font-size:\.95rem/)
  assert.match(topbar, /font-weight:800/)
})

test('sidebar and dashboard use multiple semantic accent colors with warm menu emphasis', async () => {
  const sidebar = await text('src/components/layout/SidebarNav.vue')
  const dashboard = await text('src/pages/DashboardPage.vue')
  assert.match(sidebar, /nth-child\(2\)/)
  assert.match(sidebar, /--nav-accent:var\(--color-coral\)/)
  assert.match(sidebar, /--nav-accent:var\(--color-sun\)/)
  assert.match(sidebar, /--nav-accent:var\(--color-mint\)/)
  assert.match(dashboard, /nth-child\(1\).*--metric-accent:var\(--color-sky\)/s)
  assert.match(dashboard, /nth-child\(2\).*--metric-accent:var\(--color-mint\)/s)
  assert.match(dashboard, /nth-child\(3\).*--metric-accent:var\(--color-coral\)/s)
  assert.match(dashboard, /nth-child\(4\).*--metric-accent:var\(--color-sun\)/s)
})

test('student-facing registration and login pages use colorful learning washes', async () => {
  const login = await text('src/pages/LoginPage.vue')
  const registration = await text('src/pages/RegistrationPage.vue')
  assert.match(login, /var\(--wash-sky\)/)
  assert.match(login, /var\(--wash-pink\)/)
  assert.match(registration, /var\(--wash-mint\)/)
  assert.match(registration, /var\(--wash-sun\)/)
})
