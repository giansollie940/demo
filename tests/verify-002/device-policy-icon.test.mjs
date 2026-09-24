import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = path => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')

test('Teacher and Admin enter Device Policy through Schedule, without a standalone sidebar item', () => {
  const nav = read('src/features/navigation/navigation.ts')
  assert.match(nav, /'Thời khóa biểu','\/schedule','CalendarClock',teachers/)
  assert.match(nav, /'Năm học','\/admin\?tab=years','CalendarRange',admins/)
  assert.doesNotMatch(nav, /item\('Thiết bị điện tử'/)
  assert.match(read('src/pages/SchedulePage.vue'), /<DevicePolicyIcon\/> Thiết bị điện tử/)
  assert.match(read('src/pages/AdminPage.vue'), /<DevicePolicyIcon\/> Thiết bị điện tử/)
})

test('shared DevicePolicyIcon is a device+lock function icon, not a state indicator', () => {
  const icon = read('src/components/icons/DevicePolicyIcon.vue')
  assert.match(icon, /device-policy-icon/)
  assert.match(icon, /<rect x="4" y="3" width="11" height="15" rx="2"/)
  assert.match(icon, /<rect x="14\.5" y="6" width="5\.5" height="10" rx="1\.3"/)
  assert.match(icon, /<path d="M14\.4 14\.2v-1a1\.6 1\.6 0 1 1 3\.2 0v1"/)
  assert.doesNotMatch(icon, /LOCKED|UNLOCKED|OVERRIDE/)
})

test('Teacher page and Admin panel import the same reusable icon', () => {
  const teacher = read('src/pages/DevicePolicyPage.vue')
  const admin = read('src/components/admin/AdminDevicePolicy.vue')
  assert.match(teacher, /components\/icons\/DevicePolicyIcon\.vue/)
  assert.match(admin, /icons\/DevicePolicyIcon\.vue/)
  assert.match(teacher, /<DevicePolicyIcon \/>/)
  assert.match(admin, /<DevicePolicyIcon \/>/)
  assert.match(teacher, /class="device-policy-hero-icon"[^>]*><DevicePolicyIcon :size="30" \/>/)
  assert.doesNotMatch(teacher, /<PageArtwork name="schedule"/)
  assert.match(teacher, /@media\(max-width:560px\)\{\.device-policy-hero-icon/)
  assert.match(teacher, /<Lock v-if="row\.state === 'locked'"/)
  assert.match(teacher, /<LockOpen v-else/)
})
