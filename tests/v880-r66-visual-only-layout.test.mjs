import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import crypto from 'node:crypto'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const root = process.cwd()
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8')
const sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(path.join(root, p))).digest('hex')

const BASELINE_HASHES = {
  'src/layouts/AppShell.vue': '9858631affd321c1760bc8aa31ebb644bba48368cb65a5d9fe5d2bf0f68be469',
  'src/components/layout/SidebarNav.vue': 'c80073b02851bc09541b429a5ee3051a1184399bf005a5b3592ca0ed4e0f981e',
  'src/components/layout/TopBar.vue': 'd757994e895689dae87e95d3e2db157f63125ea8a1aec8e12cc0306eb1cbdf23',
}

test('R6.6 visual-only keeps the R6.5 shell interactions untouched', () => {
  for (const [file, expected] of Object.entries(BASELINE_HASHES)) {
    assert.equal(sha(file), expected, `${file} must remain byte-for-byte R6.5`)
  }
})

test('login keeps its old behavior while artwork becomes borderless and blended', () => {
  const src = read('src/pages/LoginPage.vue')
  assert.match(src, /@submit\.prevent="submit"/)
  assert.match(src, /@click="preferences\.toggleTheme"/)
  assert.match(src, /animation:\s*login-hero-drift/)
  assert.match(src, /login-hero\.png/)
  assert.match(src, /\.login-visual\s*\{[^}]*position:\s*relative/s)
  assert.match(src, /\.hero-card\s*\{[^}]*border:\s*0/s)
  assert.match(src, /\.hero-card\s*\{[^}]*box-shadow:\s*none/s)
  assert.match(src, /\.hero-card img\s*\{[^}]*mask-image:/s)
})

test('dashboard uses the sharp source artwork and CSS blending instead of a pre-blurred raster', () => {
  const src = read('src/pages/DashboardPage.vue')
  assert.match(src, /student-group-dashboard\.png/)
  assert.doesNotMatch(src, /student-group-dashboard-blend\.png/)
  assert.match(src, /\.hero-illustration img\s*\{[^}]*object-fit:\s*cover/s)
  assert.match(src, /\.hero-illustration img\s*\{[^}]*mask-image:/s)
  assert.match(src, /\.hero-illustration\s*\{[^}]*border:\s*0/s)
  assert.match(src, /\.hero-illustration\s*\{[^}]*box-shadow:\s*none/s)
})

test('hero assets have enough native pixels for 2x laptop rendering', () => {
  const identify = (file) => {
    const out = execFileSync('identify', ['-format', '%w %h', path.join(root, file)], { encoding: 'utf8' }).trim()
    return out.split(/\s+/).map(Number)
  }
  const [loginW, loginH] = identify('public/assets/images/login-hero.png')
  const [dashW, dashH] = identify('public/assets/images/student-group-dashboard.png')
  assert.ok(loginW >= 1600 && loginH >= 900, `login hero is only ${loginW}x${loginH}`)
  assert.ok(dashW >= 1200 && dashH >= 320, `dashboard hero is only ${dashW}x${dashH}`)
})

test('R7-only visual components are not introduced into the restored R6.5 UI', () => {
  for (const file of [
    'src/components/dashboard/DashboardHero.vue',
    'src/components/dashboard/KpiTrendCard.vue',
    'src/components/dashboard/PendingTasksTable.vue',
    'src/components/dashboard/WeeklyProgressCard.vue',
  ]) {
    assert.equal(fs.existsSync(path.join(root, file)), false, `${file} should not exist`)
  }
})
