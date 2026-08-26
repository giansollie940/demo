import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')

test('GitHub Pages workflow builds and deploys dist', () => {
  const yml = read('.github/workflows/deploy-pages.yml')
  assert.match(yml, /actions\/checkout@v7/)
  assert.match(yml, /actions\/setup-node@v7/)
  assert.match(yml, /node-version:\s*['"]24['"]/)
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


test('workflow verifies clean source before generating runtime browser config', () => {
  const yml = read('.github/workflows/deploy-pages.yml')
  const clean = yml.indexOf('Ensure runtime config is absent during source verification')
  const staticTests = yml.indexOf('Static source tests')
  const unitTests = yml.indexOf('Unit tests')
  const typecheck = yml.indexOf('Typecheck')
  const generate = yml.indexOf('Generate browser Supabase config')
  const build = yml.indexOf('Build production site')

  assert.ok(clean >= 0, 'workflow must explicitly remove public/config.js before source verification')
  assert.match(yml.slice(clean, staticTests), /rm -f public\/config\.js/)
  assert.ok(clean < staticTests, 'runtime config cleanup must happen before npm test')
  assert.ok(staticTests < unitTests, 'static tests must run before unit tests')
  assert.ok(unitTests < typecheck, 'unit tests must run before typecheck')
  assert.ok(typecheck < generate, 'runtime config must be generated only after source verification')
  assert.ok(generate < build, 'runtime config must exist before production build')
})

test('repo remains portable across GitHub project names', () => {
  const vite = read('vite.config.ts')
  assert.match(vite, /base:\s*['"]\.\/['"]/)
})

test('workflow validates the two required Supabase secrets before build', () => {
  const yml = read('.github/workflows/deploy-pages.yml')
  assert.match(yml, /Validate required Supabase secrets/)
  assert.match(yml, /Missing repository secret SUPABASE_PROJECT_URL/)
  assert.match(yml, /Missing repository secret SUPABASE_PUBLISHABLE_KEY/)
})


test('root TypeScript project config required by vue-tsc exists', () => {
  for (const file of ['tsconfig.json', 'tsconfig.app.json', 'tsconfig.node.json']) {
    assert.equal(fs.existsSync(new URL(`../${file}`, import.meta.url)), true, `${file} must exist at repository root`)
  }
  const rootTsconfig = JSON.parse(read('tsconfig.json'))
  assert.deepEqual(rootTsconfig.references, [
    { path: './tsconfig.app.json' },
    { path: './tsconfig.node.json' },
  ])
})
