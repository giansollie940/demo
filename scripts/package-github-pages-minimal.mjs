import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')
const outputDir = path.resolve(process.argv[2] || path.join(root, '..', 'release'))
const releaseName = 'SO-TU-HOC-V8.8.0-R6.9-GITHUB-PAGES-MINIMAL'
const stage = path.join(outputDir, `${releaseName}-stage`)
const output = path.join(outputDir, `${releaseName}.zip`)

// Explicit deploy allowlist. Everything else is excluded by design.
const requiredRootFiles = [
  '.gitignore',
  '.nvmrc',
  'package.json',
  'package-lock.json',
  'tsconfig.json',
  'tsconfig.app.json',
  'tsconfig.node.json',
  'vite.config.ts',
  'index.html',
]
const requiredFiles = ['.github/workflows/deploy-pages.yml']
const requiredTrees = ['src', 'public']

// Exclude tests, database, supabase, deploy, docs, scripts and full-quality.yml.
// public/config.js is generated from GitHub Secrets and must not be packaged.
const forbidden = new Set([
  'public/config.js',
  '.github/workflows/full-quality.yml',
])

function copyFile(rel) {
  if (forbidden.has(rel)) return
  const src = path.join(root, rel)
  if (!fs.existsSync(src) || !fs.statSync(src).isFile()) {
    throw new Error(`Missing required deploy file: ${rel}`)
  }
  const dst = path.join(stage, rel)
  fs.mkdirSync(path.dirname(dst), { recursive: true })
  fs.copyFileSync(src, dst)
}

function copyTree(relDir) {
  const srcDir = path.join(root, relDir)
  if (!fs.existsSync(srcDir) || !fs.statSync(srcDir).isDirectory()) {
    throw new Error(`Missing required deploy tree: ${relDir}`)
  }
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const rel = path.posix.join(relDir, entry.name)
    if (forbidden.has(rel)) continue
    if (entry.isDirectory()) copyTree(rel)
    else if (entry.isFile()) copyFile(rel)
  }
}

fs.mkdirSync(outputDir, { recursive: true })
fs.rmSync(stage, { recursive: true, force: true })
fs.rmSync(output, { force: true })
fs.mkdirSync(stage, { recursive: true })

for (const rel of requiredRootFiles) copyFile(rel)
for (const rel of requiredFiles) copyFile(rel)
for (const rel of requiredTrees) copyTree(rel)

const stagedFiles = []
function walk(dir, prefix = '') {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isDirectory()) walk(path.join(dir, entry.name), rel)
    else if (entry.isFile()) stagedFiles.push(rel)
  }
}
walk(stage)

for (const rel of forbidden) {
  if (stagedFiles.includes(rel)) throw new Error(`Forbidden minimal deploy file was packaged: ${rel}`)
}
for (const prefix of ['tests/', 'database/', 'supabase/', 'deploy/', 'docs/', 'scripts/']) {
  if (stagedFiles.some(rel => rel.startsWith(prefix))) {
    throw new Error(`Excluded tree leaked into minimal package: ${prefix}`)
  }
}

const zip = spawnSync('zip', ['-q', '-r', output, '.'], { cwd: stage, encoding: 'utf8' })
if (zip.status !== 0) throw new Error(`Minimal ZIP failed: ${zip.stderr || zip.stdout || zip.status}`)
fs.rmSync(stage, { recursive: true, force: true })

console.log(`Created ${output}`)
console.log(`Packaged ${stagedFiles.length} deploy files.`)
