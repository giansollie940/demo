import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')

test('GitHub Pages workflow builds and deploys dist', () => {
  const yml = read('.github/workflows/deploy-pages.yml')
  assert.match(yml, /actions\/checkout@v4/)
  assert.match(yml, /actions\/setup-node@v4/)
  assert.match(yml, /npm ci/)
  assert.match(yml, /npm run typecheck/)
  assert.match(yml, /npm test/)
  assert.match(yml, /npm run test:unit/)
  assert.match(yml, /npm run build/)
  assert.match(yml, /actions\/upload-pages-artifact@v3/)
  assert.match(yml, /path:\s*\.\/dist/)
  assert.match(yml, /actions\/deploy-pages@v4/)
})

test('workflow generates browser-only Supabase config from repository secrets', () => {
  const yml = read('.github/workflows/deploy-pages.yml')
  assert.match(yml, /SUPABASE_PROJECT_URL/)
  assert.match(yml, /SUPABASE_PUBLISHABLE_KEY/)
  assert.match(yml, /window\.APP_CONFIG/)
  assert.doesNotMatch(yml, /service_role/i)
})

test('repo remains portable across GitHub project names', () => {
  const vite = read('vite.config.ts')
  assert.match(vite, /base:\s*['"]\.\/['"]/)
})

test('upload instructions describe the two required secrets', () => {
  const guide = read('README-UPLOAD-GITHUB.md')
  assert.match(guide, /SUPABASE_PROJECT_URL/)
  assert.match(guide, /SUPABASE_PUBLISHABLE_KEY/)
  assert.match(guide, /Settings\s*→\s*Pages/i)
})
