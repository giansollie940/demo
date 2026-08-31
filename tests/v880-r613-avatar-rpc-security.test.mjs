import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const read=(path)=>readFile(new URL(`../${path}`,import.meta.url),'utf8')

test('avatar RPC migration explicitly revokes anonymous execute access',async()=>{
  const source=await read('database/upgrade/04-UPGRADE-V8.8.0-AVATAR-RPC-ANON-REVOKE.sql')
  assert.match(source,/revoke\s+(?:all|execute)\s+on\s+function\s+public\.set_own_avatar_path\(text\)\s+from\s+anon/i)
  assert.match(source,/grant\s+execute\s+on\s+function\s+public\.set_own_avatar_path\(text\)\s+to\s+authenticated/i)
})
