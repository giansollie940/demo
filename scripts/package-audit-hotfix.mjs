import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const sourceRel = 'supabase/functions/audit-log/index.ts'
const bridgeRel = 'public/supabase-service.js'
const outputDir = path.join(root, 'deploy', 'hotfix')
const output = path.join(outputDir, 'AUDIT-CONTRACT-SOURCE-SYNC-HOTFIX.zip')

const overlayFiles = [
  sourceRel,
  bridgeRel,
  'src/components/admin/AdminAuditLog.vue',
  'src/types/legacy.ts',
  'tests/v880-audit-contract-hardening.test.mjs',
  'tests/audit-hotfix-packaging.test.mjs',
  'scripts/verify-release.mjs',
  'scripts/package-audit-hotfix.mjs',
  'deploy/edge-functions/audit-log.zip',
]

function requireMarker(text, marker, label) {
  if (!text.includes(marker)) throw new Error(`${label} is stale: missing ${marker}`)
}

const source = fs.readFileSync(path.join(root, sourceRel), 'utf8')
const bridge = fs.readFileSync(path.join(root, bridgeRel), 'utf8')
requireMarker(source, 'AUDIT_LIST_CONTRACT_VERSION = 2', 'audit-log source')
requireMarker(source, 'contractVersion:AUDIT_LIST_CONTRACT_VERSION', 'audit-log source')
requireMarker(bridge, 'AUDIT_EDGE_OUTDATED', 'legacy audit bridge')

const npmNode = process.execPath
const packageEdge = spawnSync(npmNode, ['scripts/package-edge-functions.mjs'], {
  cwd: root,
  stdio: 'inherit',
})
if (packageEdge.status !== 0) throw new Error(`Edge packaging failed with status ${packageEdge.status}`)

for (const rel of overlayFiles) {
  if (!fs.existsSync(path.join(root, rel))) throw new Error(`Missing hotfix source file: ${rel}`)
}

fs.mkdirSync(outputDir, { recursive: true })
fs.rmSync(output, { force: true })
const zip = spawnSync('zip', ['-q', output, ...overlayFiles], {
  cwd: root,
  encoding: 'utf8',
})
if (zip.status !== 0) throw new Error(`Audit hotfix ZIP failed: ${zip.stderr || zip.stdout || zip.status}`)

console.log(`Audit hotfix packaged with repository-relative paths: ${path.relative(root, output)}`)
