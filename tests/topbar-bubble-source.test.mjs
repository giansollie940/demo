import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('topbar is a floating bubble toolbar instead of a full-width divider bar', async () => {
  const source = await read('src/components/layout/TopBar.vue')
  assert.match(source, /class="school-year-bubble"/)
  assert.match(source, /class="compact control-bubble"/)
  assert.match(source, /class="theme-bubble"/)
  assert.match(source, /\.topbar\{[^}]*background:transparent/)
  assert.doesNotMatch(source, /\.topbar\{[^}]*border-bottom:/)
})

test('topbar bubbles use soft rounded surfaces and hover lift', async () => {
  const source = await read('src/components/layout/TopBar.vue')
  assert.match(source, /\.school-year-bubble,\.control-bubble,\.theme-bubble\{[^}]*border-radius:999px/)
  assert.match(source, /\.control-bubble:hover\{[^}]*translateY\(-2px\)/)
  assert.match(source, /\.profile-chip:hover\{[^}]*translateY\(-2px\)/)
})

test('teacher stays class-settings only while learner monitor and admin get personal settings', async () => {
  const source = await read('src/components/layout/TopBar.vue')
  assert.match(source, /v-if="auth\.currentUser\.role==='student'\|\|auth\.currentUser\.role==='monitor'\|\|auth\.currentUser\.role==='admin'" class="profile-settings"/)
  assert.doesNotMatch(source, /\?\s*'Tùy chọn cá nhân'\s*:\s*'Cài đặt'/)
})

test('R7 shell uses a floating elevated sidebar instead of a hard divider rail', async () => {
  const source = await read('src/layouts/AppShell.vue')
  assert.doesNotMatch(source, /\.sidebar-r7\s*\{[^}]*border-right:/s)
  assert.doesNotMatch(source, /\.side-head\s*\{[^}]*border-bottom:/s)
  assert.match(source, /\.sidebar-r7\s*\{[^}]*box-shadow:/s)
})
