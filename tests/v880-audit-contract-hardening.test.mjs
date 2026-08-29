import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read=(p)=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8')

test('audit list endpoint publishes an explicit versioned response contract',()=>{
  const edge=read('supabase/functions/audit-log/index.ts')
  assert.match(edge,/AUDIT_LIST_CONTRACT_VERSION\s*=\s*2/)
  assert.match(edge,/contract:\s*["']audit-list["']/)
  assert.match(edge,/contractVersion:\s*AUDIT_LIST_CONTRACT_VERSION/)
})

test('legacy audit bridge rejects the pre-list Edge response as an outdated deployment',()=>{
  const bridge=read('public/supabase-service.js')
  assert.match(bridge,/AUDIT_EDGE_OUTDATED/)
  assert.match(bridge,/Edge Function audit-log đang là phiên bản cũ/i)
  assert.match(bridge,/Array\.isArray\(data\?\.logs\)/)
  assert.match(bridge,/data\?\.count/)
})

test('audit UI distinguishes outdated Edge from schema and generic backend failures',()=>{
  const ui=read('src/components/admin/AdminAuditLog.vue')
  assert.match(ui,/AUDIT_EDGE_OUTDATED/)
  assert.match(ui,/AUDIT_SCHEMA_NOT_READY/)
  assert.match(ui,/Chỉ cần deploy lại Edge Function/i)
  assert.doesNotMatch(ui,/Hãy kiểm tra Edge Function <code>audit-log<\/code> và chạy SQL upgrade\/VERIFY nếu database chưa có schema Audit mới\./)
})

test('audit schema error guidance is version-agnostic for future releases',()=>{
  const edge=read('supabase/functions/audit-log/index.ts')
  assert.doesNotMatch(edge,/01-UPGRADE-CURRENT-TO-V8\.7\.1\.sql/)
  assert.doesNotMatch(edge,/VERIFY-V8\.7\.1\.sql/)
  assert.match(edge,/upgrade\/VERIFY của phiên bản đang dùng/i)
})


test('release verifier rejects an audit-log ZIP without the current list contract marker',()=>{
  const verifier=read('scripts/verify-release.mjs')
  assert.match(verifier,/name===['"]audit-log['"]/ )
  assert.match(verifier,/AUDIT_LIST_CONTRACT_VERSION/)
  assert.match(verifier,/audit-log ZIP/i)
})
