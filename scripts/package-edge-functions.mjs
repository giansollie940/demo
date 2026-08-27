import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const functionsRoot = path.join(root, 'supabase', 'functions')
const outputRoot = path.join(root, 'deploy', 'edge-functions')
const sharedRoot = path.join(functionsRoot, '_shared')
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

function copyDir(source, target) {
  fs.mkdirSync(target, { recursive: true })
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const src = path.join(source, entry.name)
    const dst = path.join(target, entry.name)
    if (entry.isDirectory()) copyDir(src, dst)
    else fs.copyFileSync(src, dst)
  }
}

if (!fs.existsSync(sharedRoot)) throw new Error(`Missing shared source: ${sharedRoot}`)
fs.mkdirSync(outputRoot, { recursive: true })

for (const name of functions) {
  const functionRoot = path.join(functionsRoot, name)
  const indexPath = path.join(functionRoot, 'index.ts')
  if (!fs.existsSync(indexPath)) throw new Error(`Missing Edge Function source: ${indexPath}`)

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), `so-tu-hoc-${name}-`))
  const sourceRoot = path.join(tempRoot, 'source')
  try {
    copyDir(functionRoot, sourceRoot)
    copyDir(sharedRoot, path.join(tempRoot, '_shared'))

    const output = path.join(outputRoot, `${name}.zip`)
    fs.rmSync(output, { force: true })
    const result = spawnSync('zip', ['-q', '-r', output, 'source', '_shared'], {
      cwd: tempRoot,
      encoding: 'utf8',
    })
    if (result.status !== 0) {
      throw new Error(`zip failed for ${name}: ${result.stderr || result.stdout || `status ${result.status}`}`)
    }
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true })
  }
}

console.log(`Packaged ${functions.length} Edge Functions into ${path.relative(root, outputRoot)}/`)
