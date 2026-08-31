import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const root=fileURLToPath(new URL('../',import.meta.url))
const path=(relative)=>`${root}${relative}`
const read=(relative)=>readFile(path(relative),'utf8')

test('database migration applies one explicit profile/avatar visibility matrix',async()=>{
  const migration='database/upgrade/05-UPGRADE-V8.8.0-AVATAR-VISIBILITY.sql'
  assert.equal(existsSync(path(migration)),true,'R6.14 visibility migration must exist')
  const source=await read(migration)
  assert.match(source,/create\s+or\s+replace\s+function\s+public\.can_view_profile\s*\(/i)
  assert.match(source,/target_profile_id\s*=\s*auth\.uid\(\)/i)
  assert.match(source,/is_root_admin\(\)/i)
  assert.match(source,/viewer_role\s+in\s*\('student','monitor'\)/i)
  assert.match(source,/target_role\s+in\s*\('student','monitor'\)/i)
  assert.match(source,/target_role\s*=\s*'teacher'/i)
  assert.match(source,/class_teachers/i)
  assert.match(source,/viewer_role\s*=\s*'teacher'/i)
  assert.match(source,/drop\s+policy\s+if\s+exists\s+avatars_authenticated_read/i)
  assert.match(source,/create\s+policy\s+avatars_visible_profile_read/i)
  assert.match(source,/can_view_profile/i)
  assert.match(source,/drop\s+policy\s+if\s+exists\s+profiles_select_v840/i)
  assert.match(source,/create\s+policy\s+profiles_select_v841/i)
  assert.match(source,/revoke\s+(?:all|execute)[\s\S]*can_view_profile[\s\S]*from\s+anon/i)
  assert.match(source,/grant\s+execute[\s\S]*can_view_profile[\s\S]*to\s+authenticated/i)
})

test('shared remote avatar component loads only through profile RLS and private Storage',async()=>{
  const component='src/components/profile/RemoteUserAvatar.vue'
  assert.equal(existsSync(path(component)),true,'RemoteUserAvatar component must exist')
  const source=await read(component)
  assert.match(source,/from\(['"]profiles['"]\)/)
  assert.match(source,/avatar_path/)
  assert.match(source,/legacyApi\.downloadAvatar/)
  assert.match(source,/UserAvatar/)
})

test('existing class/admin people lists render the shared remote avatar',async()=>{
  const files=[
    'src/components/students/StudentDirectory.vue',
    'src/components/tracking/StudentTrackingRow.vue',
    'src/components/admin/AdminStudentCard.vue',
    'src/components/admin/AdminTeacherCard.vue',
  ]
  for(const file of files){
    const source=await read(file)
    assert.match(source,/RemoteUserAvatar/,`${file} must render permitted avatars`)
  }
})

test('learner dashboard exposes a class people panel with assigned teachers and permitted avatars',async()=>{
  const migration=await read('database/upgrade/05-UPGRADE-V8.8.0-AVATAR-VISIBILITY.sql')
  assert.match(migration,/create\s+or\s+replace\s+function\s+public\.visible_class_people\s*\(/i)
  assert.match(migration,/class_teachers/i)
  const panel='src/components/profile/ClassPeoplePanel.vue'
  assert.equal(existsSync(path(panel)),true,'ClassPeoplePanel must exist')
  const source=await read(panel)
  assert.match(source,/visible_class_people/)
  assert.match(source,/RemoteUserAvatar/)
  const wrapper='src/pages/DashboardWithPeoplePage.vue'
  assert.equal(existsSync(path(wrapper)),true,'Dashboard wrapper must exist')
  const wrapperSource=await read(wrapper)
  assert.match(wrapperSource,/DashboardPage/)
  assert.match(wrapperSource,/ClassPeoplePanel/)
  assert.match(wrapperSource,/student/)
  assert.match(wrapperSource,/monitor/)
  const routes=await read('src/app/router/routes.ts')
  assert.match(routes,/DashboardWithPeoplePage/)
})
