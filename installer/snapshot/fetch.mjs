#!/usr/bin/env node
// Regenerates installer/sql/10-baseline.sql from a live project through the Management API.
//
//   SUPABASE_ACCESS_TOKEN=sbp_… SUPABASE_PROJECT_REF=abcd… node installer/snapshot/fetch.mjs
//
// Read-only: it runs installer/snapshot/generate.sql (catalog queries only). Afterwards add every file
// in supabase/migrations to "baselineMigrations" in installer/manifest.json and set "baselineDate".
import { readFileSync, writeFileSync } from 'node:fs'
import { createManagementClient } from '../lib/management.mjs'
import { assemble, parseRows } from './assemble.mjs'

const token = process.env.SUPABASE_ACCESS_TOKEN
const ref = process.env.SUPABASE_PROJECT_REF
if (!token || !ref) {
  console.error('Set SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_REF.')
  process.exit(2)
}
const query = readFileSync(new URL('./generate.sql', import.meta.url), 'utf8')
const rows = parseRows(JSON.stringify(await createManagementClient(token).runSql(ref, query)))
const target = new URL('../sql/10-baseline.sql', import.meta.url)
writeFileSync(target, assemble(rows))
console.log(`wrote installer/sql/10-baseline.sql: ${rows.length} statements`)
