import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { validateAvatarFile } from '../src/features/profile/avatar-image.js'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('avatar validation accepts animated GIF up to the existing 5 MiB limit', () => {
  assert.equal(validateAvatarFile({ type: 'image/gif', size: 1024 }).ok, true)
  assert.match(validateAvatarFile({ type: 'image/svg+xml', size: 1024 }).message, /GIF/)
})

test('personal settings routes GIF directly to upload instead of the static crop editor', async () => {
  const source = await read('src/pages/SettingsPage.vue')
  assert.match(source, /image\/gif/)
  assert.match(source, /file\.type\s*===\s*['"]image\/gif['"]/)
  assert.match(source, /auth\.uploadAvatar\(file\)/)
})

test('avatar storage supports gif and webp paths while keeping one active object', async () => {
  const source = await read('src/features/profile/avatar-storage.ts')
  assert.match(source, /avatar\.gif/)
  assert.match(source, /avatar\.webp/)
  assert.match(source, /image\/gif/)
  assert.match(source, /image\/webp/)
  assert.match(source, /set_own_avatar_path/)
  assert.match(source, /remove\(\[stalePath\]\)/)
})

test('auth store uses the unified avatar storage module for upload and delete', async () => {
  const source = await read('src/stores/auth.ts')
  assert.match(source, /uploadOwnAvatarBlob/)
  assert.match(source, /deleteOwnAvatarFiles/)
})

test('Supabase migration allows private GIF and WEBP avatar objects only', async () => {
  const source = await read('database/upgrade/03-UPGRADE-V8.8.0-ANIMATED-GIF-AVATARS.sql')
  assert.match(source, /allowed_mime_types[\s\S]*image\/webp[\s\S]*image\/gif/i)
  assert.match(source, /avatar\.webp/)
  assert.match(source, /avatar\.gif/)
  assert.match(source, /set_own_avatar_path/i)
  assert.doesNotMatch(source, /alter table storage\.objects enable row level security/i)
})
