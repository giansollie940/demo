import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

function collectFiles(dir, result = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) collectFiles(full, result)
    else if (/\.(?:mjs|cjs|js|ts)$/.test(entry.name)) result.push(full)
  }
  return result
}

function staticTestFiles() {
  return fs.readdirSync('tests')
    .filter((name) => name.endsWith('.test.mjs'))
    .map((name) => path.join('tests', name))
}

test('CI tests never depend on a global Node or TypeScript installation path', () => {
  const forbidden = [
    ['/opt', 'nvm'].join('/'),
    ['/usr', 'local', 'lib', 'node_modules'].join('/'),
    ['node_modules', 'typescript', 'lib', 'typescript.js'].join('/'),
  ]

  const offenders = []
  for (const file of collectFiles('tests')) {
    const source = fs.readFileSync(file, 'utf8')
    if (forbidden.some((needle) => source.includes(needle))) offenders.push(file)
  }

  assert.deepEqual(
    offenders,
    [],
    `Tests must resolve project dependencies portably, never through global absolute paths: ${offenders.join(', ')}`,
  )
})

test('npm test static files use only Node built-ins or relative imports', () => {
  const offenders = []
  const importFrom = /\bfrom\s+['"]([^'"]+)['"]/g
  const sideEffectImport = /^\s*import\s+['"]([^'"]+)['"]/gm
  const requireCall = /\brequire\(\s*['"]([^'"]+)['"]\s*\)/g

  for (const file of staticTestFiles()) {
    const source = fs.readFileSync(file, 'utf8')
    for (const pattern of [importFrom, sideEffectImport, requireCall]) {
      pattern.lastIndex = 0
      for (const match of source.matchAll(pattern)) {
        const specifier = match[1]
        if (specifier.startsWith('node:') || specifier.startsWith('./') || specifier.startsWith('../')) continue
        offenders.push(`${file}: ${specifier}`)
      }
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `npm test must stay independent of node_modules; move dependency-backed behavior tests to Vitest: ${offenders.join(', ')}`,
  )
})

test('GitHub Actions reads its Node major from the repository version file', () => {
  assert.equal(fs.existsSync('.nvmrc'), true, 'Repository must define one Node version source in .nvmrc')
  assert.match(fs.readFileSync('.nvmrc', 'utf8').trim(), /^\d+$/, '.nvmrc must contain only the Node major version')
  const workflow = fs.readFileSync('.github/workflows/deploy-pages.yml', 'utf8')
  assert.match(workflow, /node-version-file:\s*['"]?\.nvmrc['"]?/)
  assert.match(workflow, /required=\([^\n]*\.nvmrc/, '.nvmrc must be part of the root-file preflight')
  assert.doesNotMatch(workflow, /node-version:\s*['"]?\d+/)
})
