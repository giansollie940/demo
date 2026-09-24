import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')

test('admin header does not globally shrink every descendant svg', () => {
  const source = read('src/pages/AdminPage.vue')
  assert.doesNotMatch(source, /\.admin-header\s+:deep\(svg\)/)
  assert.match(source, /\.page-context\s+svg[^}]*width\s*:\s*17px/)
})

test('dashboard overview uses V9 artwork and decorative banner for teacher and learner roles', () => {
  const source = read('src/pages/DashboardPage.vue')
  assert.match(source, /import\s+PageArtwork\s+from\s+'\.\.\/components\/ui\/PageArtwork\.vue'/)
  assert.match(source, /import\s+PageBannerArt\s+from\s+'\.\.\/components\/ui\/PageBannerArt\.vue'/)
  assert.match(source, /<PageBannerArt[^>]*tone=/)
  assert.match(source, /<PageArtwork[^>]*name="dashboard"/)
})

test('admin backend copies only a valid specific week deadline; all other weeks default per-session', () => {
  const source = read('supabase/functions/admin-manage-classes/index.ts')
  assert.doesNotMatch(source, /deadline_mode\s*:\s*w\.deadline_mode\s*\|\|\s*["']per_session_20["']/)
  assert.match(source, /w\.deadline_mode\s*===\s*["']specific["']/)
  assert.match(source, /registration_deadline\s*:\s*[^\n]*specific/)
})
