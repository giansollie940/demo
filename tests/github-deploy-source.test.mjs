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
