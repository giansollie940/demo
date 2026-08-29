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

test('sidebar and R7 KPI cards keep multiple semantic accents', async () => {
  const sidebar = await text('src/components/layout/SidebarNav.vue')
  const kpi = await text('src/components/dashboard/KpiTrendCard.vue')
  assert.match(sidebar, /nth-child\(2\)/)
  assert.match(sidebar, /--nav-accent:var\(--color-coral\)/)
  assert.match(sidebar, /--nav-accent:var\(--color-sun\)/)
  assert.match(sidebar, /--nav-accent:var\(--color-mint\)/)
  assert.match(kpi, /--kpi-accent:\s*var\(--color-sky\)/)
  assert.match(kpi, /data-tone="green"[^}]*--kpi-accent:\s*var\(--color-success\)/s)
  assert.match(kpi, /data-tone="amber"[^}]*--kpi-accent:\s*var\(--color-warning\)/s)
  assert.match(kpi, /data-tone="violet"[^}]*--kpi-accent:\s*var\(--color-lilac\)/s)
})
test('student-facing registration and R7 login retain colorful learning surfaces', async () => {
  const login = await text('src/pages/LoginPage.vue')
  const registration = await text('src/pages/RegistrationPage.vue')
  assert.match(login, /r7-login-panorama-soft@2x\.png/)
  assert.match(login, /var\(--wash-sky\)/)
  assert.match(login, /linear-gradient\(100deg,#246fe8,#8249e7,#ec5f86\)/)
  assert.match(registration, /var\(--wash-mint\)/)
  assert.match(registration, /var\(--wash-sun\)/)
})
