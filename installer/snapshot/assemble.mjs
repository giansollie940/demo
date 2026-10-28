#!/usr/bin/env node
// Turns the rows produced by installer/snapshot/generate.sql into installer/sql/10-baseline.sql.
//
//   node installer/snapshot/assemble.mjs <rows.json>
//
// <rows.json> is the query result: a JSON array of {ord, name, ddl}, or a tool-output file that wraps
// that array in text (the array is located by its first "[{" and last "}]").
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const SECTION = {
  20: 'Schemas', 30: 'Enum types', 40: 'Sequences', 50: 'Tables', 60: 'Functions',
  70: 'Column defaults', 80: 'Primary key, unique and check constraints', 85: 'Foreign keys',
  90: 'Indexes', 100: 'Views', 110: 'Triggers', 120: 'Row level security', 125: 'Policies',
  130: 'Schema privileges', 131: 'Table and sequence privileges', 132: 'Function privileges',
  140: 'Table comments', 141: 'Column comments', 142: 'Function comments', 143: 'Schema comments',
  150: 'Realtime publication', 151: 'Replica identity', 160: 'Storage buckets',
}

// Values that identify the source project must never end up in the shared baseline.
const FORBIDDEN = [/[a-z]{20}\.supabase\.co/, /\bsb_(publishable|secret)_/, /\beyJ[A-Za-z0-9_-]{20,}/]

export function parseRows(text) {
  let rows
  try {
    rows = JSON.parse(text)
    if (!Array.isArray(rows) && typeof rows.result === 'string') rows = rows.result
  } catch { rows = text }
  if (typeof rows === 'string') {
    const start = rows.indexOf('[{'), end = rows.lastIndexOf('}]')
    if (start < 0 || end < start) throw new Error('no result array found')
    rows = JSON.parse(rows.slice(start, end + 2))
  }
  if (!Array.isArray(rows) || !rows.length) throw new Error('empty snapshot')
  for (const r of rows) {
    if (typeof r.ddl !== 'string' || !Number.isInteger(Number(r.ord))) throw new Error('bad row')
  }
  return rows.map(r => ({ ord: Number(r.ord), name: String(r.name), ddl: r.ddl }))
}

export function assemble(rows, { generatedAt = new Date().toISOString().slice(0, 10) } = {}) {
  const sorted = [...rows].sort((a, b) => a.ord - b.ord || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
  const out = [
    '-- Sổ Tự Học — database baseline for a brand-new Supabase project.',
    `-- Generated ${generatedAt} by installer/snapshot (schema only: no rows, no secrets).`,
    '-- Do not edit by hand: change the source database, then regenerate.',
    'set check_function_bodies = off;',
    'set client_min_messages = warning;',
  ]
  let section
  for (const r of sorted) {
    if (r.ord !== section) {
      section = r.ord
      out.push('', `-- ${'='.repeat(70)}`, `-- ${r.ord} ${SECTION[r.ord] ?? ''}`.trimEnd(), `-- ${'='.repeat(70)}`)
    }
    out.push(r.ddl.replace(/\r\n/g, '\n'))
  }
  const sql = out.join('\n') + '\n'
  for (const re of FORBIDDEN) {
    const m = sql.match(re)
    if (m) throw new Error(`baseline contains a project-specific value: ${m[0].slice(0, 12)}…`)
  }
  return sql
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const src = process.argv[2]
  if (!src) { console.error('usage: assemble.mjs <rows.json>'); process.exit(2) }
  const rows = parseRows(readFileSync(src, 'utf8'))
  const target = new URL('../sql/10-baseline.sql', import.meta.url)
  writeFileSync(target, assemble(rows))
  const counts = {}
  for (const r of rows) counts[r.ord] = (counts[r.ord] ?? 0) + 1
  console.log(`wrote ${fileURLToPath(target)}: ${rows.length} statements`, counts)
}
