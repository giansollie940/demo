import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
const root=resolve(import.meta.dirname,'..')
const read=(p)=>readFileSync(resolve(root,p),'utf8')

test('owl uses original layout pupil coordinates and user-configurable behavior',()=>{
  const owl=read('src/components/owl/WiseOwl.vue')
  assert.match(owl,/left-pupil\{left:19\.33%;top:49\.62%\}/)
  assert.match(owl,/right-pupil\{left:60\.29%;top:49\.62%\}/)
  assert.match(owl,/preferences\.owlEnabled/)
  assert.match(owl,/preferences\.owlFollowPointer/)
  assert.match(owl,/preferences\.owlHeadTilt/)
  assert.match(owl,/preferences\.owlAutoOpenUrgent/)
  assert.match(owl,/preferences\.owlQuotesEnabled/)
})

test('owl settings are real toggles persisted in preferences',()=>{
  const preferences=read('src/stores/preferences.ts')
  for(const name of ['owlEnabled','owlFollowPointer','owlHeadTilt','owlAutoOpenUrgent','owlQuotesEnabled']) assert.match(preferences,new RegExp(name))
  assert.match(preferences,/OWL_PREFS_KEY/)
  const settings=read('src/pages/SettingsPage.vue')
  for(const model of ['preferences.owlEnabled','preferences.owlFollowPointer','preferences.owlHeadTilt','preferences.owlAutoOpenUrgent','preferences.owlQuotesEnabled']) assert.match(settings,new RegExp(model.replaceAll('.','\\.')))
})

test('schedule displays only Tu hoc for selected slots and blank for unselected slots',()=>{
  const schedule=read('src/components/schedule/ScheduleGrid.vue')
  assert.match(schedule,/isSelected\(dow, period\.n\) \? 'Tự học' : ''/)
  assert.match(schedule,/isSelected\(activeDay, period\.n\) \? 'Tự học' : ''/)
  assert.doesNotMatch(schedule,/Có học|Không học|Bật|Tắt/)
})

test('tracking page can rerun AI for a session and individual registration',()=>{
  const tracking=read('src/pages/TrackingPage.vue')
  assert.match(tracking,/prepareSessionAiRereview/)
  assert.match(tracking,/prepareRegistrationAiRereview/)
  assert.match(tracking,/requestAiReview/)
  assert.match(tracking,/AI duyệt lại buổi này/)
  assert.match(tracking,/AI duyệt lại/)
  assert.match(tracking,/aiProgress/)
})

test('realtime updates registration and notification snapshots and profiles are subscribed',()=>{
  const realtime=read('src/realtime/useRealtimeInvalidation.ts')
  assert.match(realtime,/teacher_notifications/)
  assert.match(realtime,/applyRealtimeChange/)
  const auth=read('src/stores/auth.ts')
  assert.match(auth,/function applyRealtimeChange/)
  assert.match(auth,/registrations/)
  assert.match(auth,/notifications/)
  const service=read('public/supabase-service.js')
  assert.match(service,/"profiles"/)
})

test('handled registrations mark matching teacher notifications read',()=>{
  const mutations=read('src/features/approvals/approval-mutations.ts')
  assert.match(mutations,/markHandledRegistrationNotificationsRead/)
  assert.match(mutations,/markNotificationsRead/)
})

test('login copy is learning-centered and no longer exposes technical implementation phrases',()=>{
  const login=read('src/pages/LoginPage.vue')
  assert.doesNotMatch(login,/Tài khoản theo lớp|Phiên đăng nhập an toàn|Đồng bộ dữ liệu Supabase/)
  assert.match(login,/Xem kế hoạch tự học theo tuần/)
  assert.match(login,/Theo dõi tiến độ của bạn/)
  assert.match(login,/Nhận phản hồi từ giáo viên/)
})

test('buttons have lively modern hover and diamond loading while respecting reduced motion',()=>{
  const button=read('src/components/ui/AppButton.vue')
  assert.match(button,/diamond-loader/)
  assert.match(button,/translateY\(-2px\).*scale\(1\.02\)/s)
  assert.match(button,/::before/)
  assert.match(button,/prefers-reduced-motion/)
  const base=read('src/styles/base.css')
  assert.match(base,/skeleton-shimmer/)
  assert.match(base,/data-loading/)
})
