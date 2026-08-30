import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(new URL('..', import.meta.url).pathname)
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')

test('R6.5 login autofill uses one clipped field surface without split white ends', () => {
  const login = read('src/pages/LoginPage.vue')
  assert.match(login, /\.field\s*\{[^}]*--field-surface:/s)
  assert.match(login, /\.field\s*\{[^}]*overflow:\s*hidden/s)
  assert.match(login, /\.field:has\(input:-webkit-autofill\)[^}]*background:\s*var\(--field-surface\)/s)
  assert.match(login, /input:-webkit-autofill[\s\S]*-webkit-box-shadow:\s*0 0 0 1000px var\(--field-surface\) inset/s)
  assert.doesNotMatch(login, /--autofill-surface:/)
})

test('R6.5 login motion animates only the illustration layer and respects reduced motion', () => {
  const login = read('src/pages/LoginPage.vue')
  assert.doesNotMatch(login, /\.hero-card\s*\{[^}]*animation:/s)
  assert.match(login, /\.hero-card img\s*\{[^}]*animation:\s*login-hero-drift/s)
  assert.match(login, /@keyframes login-hero-drift/)
  assert.doesNotMatch(login, /@keyframes login-hero-float/)
  assert.match(login, /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*\.hero-card img\s*\{[^}]*animation:\s*none\s*!important/s)
})

test('R6.7 dashboard hero stays full-height, borderless and blended from the right edge', () => {
  const page = read('src/pages/DashboardPage.vue')
  assert.match(page, /\.dashboard-hero\{[^}]*min-height:132px[^}]*position:relative/s)
  assert.match(page, /\.hero-copy\{[^}]*position:relative[^}]*z-index:2[^}]*max-width:52%/s)
  assert.match(page, /\.hero-illustration\{[^}]*position:absolute[^}]*inset:0 0 0 auto[^}]*width:min\(52%,640px\)[^}]*height:100%/s)
  assert.match(page, /\.hero-illustration img\{[^}]*width:100%[^}]*height:100%[^}]*object-fit:contain/s)
  assert.doesNotMatch(page, /grid-template-columns:minmax\(0,1fr\) 470px/)
  assert.doesNotMatch(page, /\.hero-illustration\{[^}]*width:470px/s)
})

test('R6.7 tablet layout returns hero artwork to document flow with extra breathing room', () => {
  const page = read('src/pages/DashboardPage.vue')
  assert.match(page, /@media\(max-width:1100px\)[\s\S]*\.hero-copy\{[^}]*max-width:none/s)
  assert.match(page, /@media\(max-width:1100px\)[\s\S]*\.hero-illustration\{[^}]*position:relative[^}]*inset:auto[^}]*width:100%[^}]*height:172px/s)
})

test('R6.5 cleanup removes obsolete dashboard assets and legacy hero geometry', () => {
  const page = read('src/pages/DashboardPage.vue')
  assert.equal(fs.existsSync(path.join(root, 'public/assets/images/teacher-dashboard-illustration.png')), false)
  assert.equal(fs.existsSync(path.join(root, 'public/assets/images/student-group-dashboard.png')), true)
  assert.equal(fs.existsSync(path.join(root, 'public/assets/images/student-group-dashboard-blend.png')), false)
  assert.doesNotMatch(page, /\.hero-illustration img\{[^}]*width:500px/s)
  assert.match(page, /\.hero-illustration img\{[^}]*object-fit:contain/s)
})
