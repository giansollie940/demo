import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read=(p)=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8')

test('audit hotfix packager overlays exact repository-relative paths',()=>{
  const script=read('scripts/package-audit-hotfix.mjs')
  for (const rel of [
    'supabase/functions/audit-log/index.ts',
    'public/supabase-service.js',
    'src/components/admin/AdminAuditLog.vue',
    'src/types/legacy.ts',
    'tests/v880-audit-contract-hardening.test.mjs',
    'scripts/verify-release.mjs',
    'deploy/edge-functions/audit-log.zip',
  ]) assert.match(script,new RegExp(rel.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')))
  assert.doesNotMatch(script,/frontend-patch|release-guard/)
})

test('audit hotfix packager refuses stale source before creating an overlay',()=>{
  const script=read('scripts/package-audit-hotfix.mjs')
  assert.match(script,/AUDIT_LIST_CONTRACT_VERSION/)
  assert.match(script,/contractVersion/)
  assert.match(script,/AUDIT_EDGE_OUTDATED/)
  assert.match(script,/throw new Error/)
})

test('release verifier requires packaged audit source to equal repository source',()=>{
  const verifier=read('scripts/verify-release.mjs')
  assert.match(verifier,/audit-log source and ZIP source differ/i)
  assert.match(verifier,/supabase["']?,\s*["']functions["']?,\s*["']audit-log["']?,\s*["']index\.ts["']/)
})
