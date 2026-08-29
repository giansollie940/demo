import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')

test('app shell preserves independent topbar owl and content stacking layers', () => {
  const shell = read('src/layouts/AppShell.vue')
  assert.doesNotMatch(shell, /\.main\s*>\s*\*\s*\{[^}]*z-index\s*:\s*1/i)
  assert.match(shell, /\.content\s*\{[^}]*z-index\s*:\s*10/i)
  const topbar = read('src/components/layout/TopBar.vue')
  assert.match(topbar, /\.topbar\{[^}]*z-index\s*:\s*60/i)
  assert.match(topbar, /\.profile-dropdown\{[^}]*z-index\s*:\s*100/i)
  const owl = read('src/components/owl/WiseOwl.vue')
  assert.match(owl, /\.wise-owl\{[^}]*position\s*:\s*fixed[^}]*z-index\s*:\s*80/i)
})
test('R7 desktop dock keeps icon transforms visible while its expanded navigation region can scroll', () => {
  const nav = read('src/components/layout/SidebarNav.vue')
  const baseRule = nav.match(/\.side-nav\{([^}]*)\}/i)?.[1] ?? ''
  assert.match(baseRule, /overflow\s*:\s*visible/i)
  assert.match(nav, /@media\(max-height:\s*760px\)[^{]*\{[^}]*\.side-nav\{[^}]*overflow-y\s*:\s*auto/i)
  const shell = read('src/layouts/AppShell.vue')
  assert.match(shell, /\.sidebar-r7\s*\{[^}]*overflow:\s*visible/is)
  assert.match(shell, /\.nav-safe-zone\s*\{[^}]*overflow-y:\s*auto/is)
  assert.match(shell, /\.nav-safe-zone\s*\{[^}]*overflow-x:\s*visible/is)
})
test('audit UI distinguishes backend failure from a truly empty audit log', () => {
  const audit = read('src/components/admin/AdminAuditLog.vue')
  const bridge = read('public/supabase-service.js')
  assert.match(bridge, /Array\.isArray\(data\?\.logs\)/)
  assert.match(bridge, /AUDIT_EDGE_OUTDATED/)
  assert.match(bridge, /AUDIT_INVALID_RESPONSE/)
  assert.match(audit, /query\.isError\.value/)
  assert.match(audit, /queryErrorHelp/)
  assert.match(audit, /Không tải được Nhật ký hệ thống/)
  assert.match(audit, /Chưa có nhật ký hệ thống/)
  assert.match(audit, /query\.error\.value/)
})

test('current database upgrade and verifier guarantee audit list schema', () => {
  const upgrade = read('database/upgrade/01-UPGRADE-CURRENT-TO-V8.7.1.sql')
  assert.match(upgrade, /alter table public\.audit_logs[\s\S]*add column if not exists class_id uuid/i)
  assert.match(upgrade, /alter table public\.audit_logs[\s\S]*add column if not exists source text/i)
  assert.match(upgrade, /audit_logs_source_check/i)
  const verify = read('database/verify/VERIFY-V8.7.1.sql')
  assert.match(verify, /'audit_class_id_column'/)
  assert.match(verify, /'audit_source_column'/)
  assert.match(verify, /'audit_source_constraint'/)
})
