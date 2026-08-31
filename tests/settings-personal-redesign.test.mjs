import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root=resolve(import.meta.dirname,'..')
const read=(path)=>readFileSync(resolve(root,path),'utf8')

test('personal settings remain reachable from the profile menu for every role',()=>{
  const router=read('src/app/router/index.ts')
  assert.match(router,/auth\.currentUser\?\.role==='admin'&&to\.path!==\'\/admin\'&&to\.path!==\'\/settings\'/)

  const topbar=read('src/components/layout/TopBar.vue')
  assert.match(topbar,/const personalSettingsTarget=computed\(\(\)=>\(\{path:'\/settings',query:\{view:'personal'\}\}\)\)/)
})

test('admin sidebar does not expose personal settings',()=>{
  const navigation=read('src/features/navigation/navigation.ts')
  assert.doesNotMatch(navigation,/item\('Tùy chọn cá nhân','\/settings\?view=personal','Settings',admins\)/)
  assert.doesNotMatch(navigation,/admin:\[[^\]]*'Tùy chọn cá nhân'/)
})

test('teacher settings page does not show a personal/application mode switch',()=>{
  const page=read('src/pages/SettingsPage.vue')
  assert.doesNotMatch(page,/teacher-settings-switch/)
  assert.doesNotMatch(page,/aria-label="Chế độ cài đặt"/)
})

test('teacher application settings no longer duplicate Owl controls',()=>{
  const page=read('src/pages/SettingsPage.vue')
  assert.match(page,/const tabs=\[\{id:'general',label:'Chung & đăng ký'\},\{id:'ai',label:'AI duyệt'\}\]/)
  assert.doesNotMatch(page,/id:'owl'/)
  assert.doesNotMatch(page,/activeTab==='owl'/)
  assert.doesNotMatch(page,/activeTab!==\'owl\'/)
})

test('personal settings uses three compact cards for learners and two for teacher or admin',()=>{
  const page=read('src/pages/SettingsPage.vue')
  assert.match(page,/class="personal-card profile-account-card"/)
  assert.match(page,/class="personal-card appearance-owl-card"/)
  assert.match(page,/v-if="isLearner"[^>]*class="personal-card alerts-card"/)
  assert.doesNotMatch(page,/class="personal-card avatar-card"/)
  assert.doesNotMatch(page,/class="personal-card account-card"/)
})

test('all five Owl preferences live in personal settings',()=>{
  const page=read('src/pages/SettingsPage.vue')
  for(const pref of ['owlEnabled','owlFollowPointer','owlHeadTilt','owlAutoOpenUrgent','owlQuotesEnabled']){
    assert.match(page,new RegExp(`preferences\\.${pref}`))
  }
  assert.match(page,/GIAO DIỆN & CÚ THÔNG THÁI/)
})
