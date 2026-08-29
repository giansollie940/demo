import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { cleanupR7Leftovers, R7_STALE_PATHS } from '../scripts/cleanup-r7-leftovers.mjs'

test('R6.6.1 cleanup removes stale R7 source/tests but preserves R6.6 files', async () => {
  const root = await mkdtemp(join(tmpdir(), 'r661-cleanup-'))
  const keep = 'src/pages/LoginPage.vue'
  await mkdir(join(root, 'src/pages'), { recursive: true })
  await writeFile(join(root, keep), 'keep-me')

  for (const relative of R7_STALE_PATHS) {
    const target = join(root, relative)
    await mkdir(join(target, '..'), { recursive: true })
    await writeFile(target, 'stale-r7')
  }

  const removed = await cleanupR7Leftovers(root)
  assert.equal(removed.length, R7_STALE_PATHS.length)

  for (const relative of R7_STALE_PATHS) {
    await assert.rejects(access(join(root, relative)))
  }
  await access(join(root, keep))
})
