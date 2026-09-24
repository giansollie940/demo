import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const realtime = fs.readFileSync('database/upgrade/15-VERIFY-002-DEVICE-POLICY-REALTIME.sql','utf8')
const helper = fs.readFileSync('database/upgrade/16-VERIFY-002-DEVICE-SLOT-KEY-SEARCH-PATH.sql','utf8')

test('VERIFY-002 realtime migration changes only publication membership', () => {
  assert.match(realtime, /alter\s+publication\s+supabase_realtime\s+add\s+table\s+public\.device_use_policy_signals/i)
  assert.doesNotMatch(realtime, /drop\s+publication/i)
  assert.doesNotMatch(realtime, /delete\s+from|truncate|drop\s+table|update\s+public\./i)
})

test('VERIFY-002 helper patch preserves slot-key algorithm and narrows execution', () => {
  assert.match(helper, /create\s+or\s+replace\s+function\s+public\.device_use_slot_key/i)
  assert.match(helper, /immutable/i)
  assert.match(helper, /set\s+search_path\s*=\s*pg_catalog\s*,\s*public/i)
  assert.match(helper, /pg_catalog\.hashtextextended/i)
  assert.match(helper, /revoke\s+all[\s\S]*from\s+public\s*,\s*anon\s*,\s*authenticated/i)
  assert.doesNotMatch(helper, /security\s+definer/i)
})
