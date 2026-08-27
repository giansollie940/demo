import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const root = path.resolve(import.meta.dirname, '..')
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8')
const exists = rel => fs.existsSync(path.join(root, rel))

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
  'quote-feed'
]

test('full-stack source contains exactly the required Supabase function inventory', () => {
  assert.ok(exists('supabase/functions/_shared'))
  for (const name of functions) assert.ok(exists(`supabase/functions/${name}/index.ts`), name)
  const dirs = fs.readdirSync(path.join(root, 'supabase/functions'), { withFileTypes: true })
    .filter(entry => entry.isDirectory() && entry.name !== '_shared')
    .map(entry => entry.name)
    .sort()
  assert.deepEqual(dirs, [...functions].sort())
})

test('AI function is V8.7.1 and admin class API matches the current frontend bridge', () => {
  const ai = read('supabase/functions/ai-review-registration/index.ts')
  assert.match(ai, /AI_FUNCTION_VERSION\s*=\s*["']8\.7\.1["']/)
  assert.match(ai, /BTVN|bài tập về nhà/i)
  assert.match(ai, /categoryAllowsAuto/)

  const admin = read('supabase/functions/admin-manage-classes/index.ts')
  for (const token of ['learnerCount', 'profileCount', 'registrationCount', 'canDelete', 'deleteBlockers', 'delete_class']) {
    assert.match(admin, new RegExp(token, 'i'), token)
  }
  assert.match(admin, /transfer_student[\s\S]{0,2600}class_name/i)
  assert.match(admin, /update_class[\s\S]{0,3200}class_name/i)
  assert.match(admin, /CLASS_NOT_EMPTY/i)
})

test('database install and current-upgrade paths are explicit and mutually exclusive', () => {
  const installPath = 'database/fresh-install/01-INSTALL-V8.7.1-FROM-COMPATIBLE-BASELINE.sql'
  const upgradePath = 'database/upgrade/01-UPGRADE-CURRENT-TO-V8.7.1.sql'
  const verifyPath = 'database/verify/VERIFY-V8.7.1.sql'
  const aiVerifyPath = 'database/verify/VERIFY-AI-COMPLETED-ROUTING-V8.7.1.sql'
  for (const rel of [installPath, upgradePath, verifyPath, aiVerifyPath]) assert.ok(exists(rel), rel)

  const install = read(installPath)
  const upgrade = read(upgradePath)
  assert.match(install, /compatible baseline|compatible core|tương thích/i)
  assert.match(upgrade, /V8\.4|current/i)
  assert.doesNotMatch(upgrade, /10A1|7A9|REPAIR-10A1/i)
  assert.match(upgrade, /request_registration_revision/i)
  assert.match(upgrade, /daily_quotes/i)
  assert.match(upgrade, /ON DELETE SET NULL/i)
})

test('verification SQL is read-only and maintenance keeps root-admin tools separate', () => {
  const verify = read('database/verify/VERIFY-V8.7.1.sql')
  const aiVerify = read('database/verify/VERIFY-AI-COMPLETED-ROUTING-V8.7.1.sql')
  for (const sql of [verify, aiVerify]) {
    assert.doesNotMatch(sql, /\b(update|delete|insert|alter|drop|create|truncate)\b/i)
  }
  assert.ok(exists('database/maintenance/BOOTSTRAP-ROOT-ADMIN-BY-EMAIL.sql'))
  assert.ok(exists('database/maintenance/TRANSFER-ROOT-ADMIN-BY-EMAIL.sql'))
})

test('release never contains real browser config or obvious server secrets', () => {
  assert.equal(exists('public/config.js'), false)
  const files = []
  const walk = dir => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git') continue
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else files.push(full)
    }
  }
  walk(root)
  for (const file of files) {
    if (/\.(png|webp|zip)$/i.test(file)) continue
    const text = fs.readFileSync(file, 'utf8')
    assert.doesNotMatch(text, /sb_secret_[A-Za-z0-9_-]{12,}/, path.relative(root, file))
    assert.doesNotMatch(text, /gsk_[A-Za-z0-9_-]{16,}/, path.relative(root, file))
  }
})

test('standalone Edge deployment package inventory resolves shared imports from source/index.ts', () => {
  for (const name of functions) {
    const rel = `deploy/edge-functions/${name}.zip`
    assert.ok(exists(rel), rel)
    const zipPath = path.join(root, rel)
    const listing = execFileSync('unzip', ['-Z1', zipPath], { encoding: 'utf8' })
    assert.match(listing, /^source\/index\.ts$/m)
    assert.match(listing, /^_shared\/config\.ts$/m, `${name}: ../_shared imports must resolve from source/index.ts`)
    assert.doesNotMatch(listing, /^source\/_shared\//m, `${name}: shared helpers must not be nested under source/`)

    const indexText = execFileSync('unzip', ['-p', zipPath, 'source/index.ts'], { encoding: 'utf8' })
    for (const match of indexText.matchAll(/from\s+["']\.\.\/_shared\/([^"']+)["']/g)) {
      const target = `_shared/${match[1]}`
      assert.match(listing, new RegExp(`^${target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'm'), `${name}: missing ${target}`)
    }
  }
})

test('release verifier checks source, secrets, Edge ZIPs and checksum manifest', () => {
  assert.ok(exists('scripts/verify-release.mjs'), 'scripts/verify-release.mjs')
  const verifier = read('scripts/verify-release.mjs')
  for (const token of ['npm test', 'sb_secret_', 'gsk_', 'unzip', 'SHA256SUMS.txt', '10A1', '7A9']) {
    assert.match(verifier, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), token)
  }
})

test('release documentation and verification command are present', () => {
  for (const rel of ['README.md', 'DEPLOYMENT-V8.7.1.md', 'CHANGELOG-V8.7.1.md', 'scripts/verify-release.mjs']) {
    assert.ok(exists(rel), rel)
  }
  const pkg = JSON.parse(read('package.json'))
  assert.equal(pkg.version, '8.7.1')
  assert.equal(pkg.scripts['verify:release'], 'node scripts/verify-release.mjs')
})
