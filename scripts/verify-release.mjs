import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const functions = [
  'admin-list-users',
  'admin-create-user',
  'admin-update-user',
  'admin-delete-user',
  'admin-reset-password',
  'admin-manage-classes',
  'ai-review-registration',
  'emergency-register',
  'audit-log',
  'quote-feed',
]
const ignoredDirs = new Set(['node_modules', 'dist', '.git'])
const textExt = new Set(['.js', '.mjs', '.ts', '.vue', '.css', '.html', '.json', '.md', '.sql', '.yml', '.yaml', '.txt'])

function fail(message) {
  console.error(`VERIFY FAIL: ${message}`)
  process.exit(1)
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    ...options,
  })
  if (result.status !== 0) fail(`${command} ${args.join(' ')} exited ${result.status}`)
}

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirs.has(entry.name)) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, files)
    else files.push(full)
  }
  return files
}

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8')
}

console.log('[1/7] Rebuild standalone Edge Function ZIPs')
run(process.execPath, ['scripts/package-edge-functions.mjs'])

console.log('[2/7] Run static regression/contract suite: npm test')
run('npm', ['test'])

console.log('[3/7] Check source inventory and V8.7.1 AI contract')
for (const name of functions) {
  if (!fs.existsSync(path.join(root, 'supabase', 'functions', name, 'index.ts'))) fail(`missing source for ${name}`)
}
const ai = read('supabase/functions/ai-review-registration/index.ts')
if (!/AI_FUNCTION_VERSION\s*=\s*["']8\.7\.1["']/.test(ai)) fail('AI function is not V8.7.1')

console.log('[4/7] Check upgrade isolation and obvious secret leakage')
const upgrade = read('database/upgrade/01-UPGRADE-CURRENT-TO-V8.7.1.sql')
if (/10A1|7A9|REPAIR-10A1/i.test(upgrade)) fail('generic upgrade contains project-specific 10A1/7A9 repair data')
if (fs.existsSync(path.join(root, 'public', 'config.js'))) fail('public/config.js must not be shipped')
for (const file of walk(root)) {
  if (!textExt.has(path.extname(file).toLowerCase())) continue
  const text = fs.readFileSync(file, 'utf8')
  if (/sb_secret_[A-Za-z0-9_-]{12,}/.test(text)) fail(`Supabase server secret-like value found in ${path.relative(root, file)}`)
  if (/gsk_[A-Za-z0-9_-]{16,}/.test(text)) fail(`Groq secret-like value found in ${path.relative(root, file)}`)
}

console.log('[5/7] Validate all 10 Edge ZIPs with unzip')
for (const name of functions) {
  const zip = path.join(root, 'deploy', 'edge-functions', `${name}.zip`)
  if (!fs.existsSync(zip)) fail(`missing Edge ZIP ${name}`)
  const integrity = spawnSync('unzip', ['-tqq', zip], { encoding: 'utf8' })
  if (integrity.status !== 0) fail(`invalid ZIP ${name}: ${integrity.stderr || integrity.stdout}`)
  const listing = spawnSync('unzip', ['-Z1', zip], { encoding: 'utf8' })
  if (listing.status !== 0 || !/^source\/index\.ts$/m.test(listing.stdout) || !/^_shared\/config\.ts$/m.test(listing.stdout) || /^source\/_shared\//m.test(listing.stdout)) {
    fail(`invalid Supabase Dashboard ZIP layout for ${name}`)
  }
  const indexText = spawnSync('unzip', ['-p', zip, 'source/index.ts'], { encoding: 'utf8' })
  if (indexText.status !== 0) fail(`cannot read source/index.ts from ${name}`)
  for (const match of indexText.stdout.matchAll(/from\s+["']\.\.\/_shared\/([^"']+)["']/g)) {
    const target = `_shared/${match[1]}`
    const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    if (!new RegExp(`^${escaped}$`, 'm').test(listing.stdout)) fail(`${name} cannot resolve ../${target} from source/index.ts`)
  }
}

console.log('[6/7] Check read-only verifier SQL')
for (const rel of ['database/verify/VERIFY-V8.7.1.sql', 'database/verify/VERIFY-AI-COMPLETED-ROUTING-V8.7.1.sql']) {
  const sql = read(rel)
  if (/\b(update|delete|insert|alter|drop|create|truncate)\b/i.test(sql)) fail(`${rel} is not read-only`)
}

console.log('[7/7] Generate SHA256SUMS.txt')
const manifest = []
for (const file of walk(root).sort()) {
  const rel = path.relative(root, file).replaceAll(path.sep, '/')
  if (rel === 'SHA256SUMS.txt') continue
  const digest = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
  manifest.push(`${digest}  ${rel}`)
}
fs.writeFileSync(path.join(root, 'SHA256SUMS.txt'), `${manifest.join('\n')}\n`, 'utf8')
console.log(`VERIFY PASS: ${manifest.length} files hashed; 10 Edge ZIPs valid; no obvious server secrets found.`)
