import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root=path.resolve(new URL('..',import.meta.url).pathname)
const read=(file)=>fs.readFileSync(path.join(root,file),'utf8')


test('admin navigation and routes are system-only while teacher retains class operations',()=>{
  const nav=read('src/features/navigation/navigation.ts')
  const routes=read('src/app/router/routes.ts')
  const guard=read('src/app/router/index.ts')
  assert.match(nav,/admin:\s*\['Quản trị hệ thống'\]/)
  assert.match(nav,/teacher:\s*\[[^\]]*'Duyệt đăng ký'[^\]]*'Quản lý tuần'[^\]]*'Cài đặt'/s)
  assert.doesNotMatch(routes,/const managers: UserRole\[\] = \['teacher', 'admin'\]/)
  for(const pathName of ['review','weeks','schedule','students']){
    assert.match(routes,new RegExp(`path: '${pathName}'.*roles: teachers`))
  }
  assert.match(routes,/path: 'admin'.*roles: \['admin'\]/)
  assert.match(guard,/auth\.currentUser\?\.role==='admin'.*\/admin/s)
})


test('admin topbar is system context only and teacher keeps year class week selectors',()=>{
  const top=read('src/components/layout/TopBar.vue')
  assert.match(top,/const isAdmin=computed/)
  assert.match(top,/const isTeacher=computed/)
  assert.match(top,/v-if="isTeacher" class="compact control-bubble"/) // class
  assert.match(top,/v-if="!isAdmin" class="compact control-bubble"/) // week
  assert.doesNotMatch(top,/auth\.currentUser\?\.role==='teacher'\|\|auth\.currentUser\?\.role==='admin'.*class="compact control-bubble"/s)
})


test('admin year overview merges directory and legacy context so an active year cannot display as zero',()=>{
  const page=read('src/pages/AdminPage.vue')
  assert.match(page,/mergedSchoolYears/)
  assert.match(page,/context\.schoolYears/)
  assert.match(page,/schoolYearsById|new Map/)
  assert.match(page,/mergedSchoolYears\.value\.length/)
  assert.match(page,/Đang hoạt động/)
})


test('admin school year tab can edit global week dates through root-admin edge action',()=>{
  const feature=read('src/features/admin/admin-directory.ts')
  const page=read('src/pages/AdminPage.vue')
  const card=read('src/components/admin/AdminSchoolYearCard.vue')
  const edge=read('supabase/functions/admin-manage-classes/index.ts')
  assert.match(feature,/AdminCalendarWeekRecord/)
  assert.match(feature,/weeks:AdminCalendarWeekRecord\[\]/)
  assert.match(feature,/updateSchoolYearWeek/)
  assert.match(feature,/adminManageClasses\('update_school_year_week'/)
  assert.match(edge,/action==="update_school_year_week"/)
  assert.match(edge,/from\("weeks"\).*update/s)
  assert.match(page,/updateSchoolYearWeek/)
  assert.match(card,/Tuần \{\{ week\.number \}\}/)
  assert.match(card,/type="date"/)
  assert.match(card,/Lưu lịch tuần/)
})


test('teacher class week supports auto manual-open manual-locked without changing global week dates',()=>{
  const types=read('src/types/legacy.ts')
  const bridge=read('public/supabase-service.js')
  const model=read('src/features/weeks/week-editor-model.ts')
  const card=read('src/components/weeks/WeekEditorCard.vue')
  const weeksPage=read('src/pages/WeeksPage.vue')
  assert.match(types,/manualStatus\?:\s*'open'\s*\|\s*'locked'\s*\|\s*null/)
  assert.match(bridge,/manual_status/)
  assert.match(model,/manualStatus:\s*week\.manualStatus\?\?null/)
  assert.match(model,/manualStatus:\s*draft\.manualStatus/)
  assert.match(card,/Chế độ vận hành/)
  assert.match(card,/value="auto"/)
  assert.match(card,/value="open"/)
  assert.match(card,/value="locked"/)
  assert.match(weeksPage,/Tự động đóng sau buổi tự học cuối/)
  assert.doesNotMatch(weeksPage,/WeekCalendarSetup/)
})


test('database class-week effective status honors manual override then automatic last-session lifecycle',()=>{
  for(const file of ['database/upgrade/01-UPGRADE-CURRENT-TO-V8.7.1.sql','database/fresh-install/01-INSTALL-V8.7.1-FROM-COMPATIBLE-BASELINE.sql']){
    const sql=read(file)
    assert.match(sql,/add column if not exists manual_status public\.week_status/i,file)
    assert.match(sql,/manual_status is null or manual_status in \('open'::public\.week_status,'locked'::public\.week_status\)/i,file)
    assert.match(sql,/create or replace function public\.class_week_effective_status/i,file)
    assert.match(sql,/v_manual_status='open'|manual_status[^;]*'open'/i,file)
    assert.match(sql,/v_manual_status='locked'|manual_status[^;]*'locked'/i,file)
    assert.match(sql,/study_schedule/i,file)
    assert.match(sql,/week_schedule_overrides/i,file)
    assert.match(sql,/periods/i,file)
  }
  const verify=read('database/verify/VERIFY-V8.7.1.sql')
  assert.match(verify,/class_week_manual_status_column/)
  assert.match(verify,/class_week_effective_status_manual_override/)
})


test('teacher settings show class and school year as read-only metadata rather than editable structure fields',()=>{
  const settings=read('src/pages/SettingsPage.vue')
  assert.match(settings,/class-year-meta/)
  assert.match(settings,/context\.selectedClass/)
  assert.match(settings,/context\.selectedSchoolYear/)
  assert.doesNotMatch(settings,/v-model=".*className/)
  assert.doesNotMatch(settings,/v-model=".*schoolYear/)
})


test('sidebar uses macOS dock magnification while preserving one-shot rotating ring and reduced motion',()=>{
  const sidebar=read('src/components/layout/SidebarNav.vue')
  assert.match(sidebar,/hoveredIndex/)
  assert.match(sidebar,/dockScale/)
  assert.match(sidebar,/distance===0/)
  assert.match(sidebar,/distance===1/)
  assert.match(sidebar,/--dock-scale/)
  assert.match(sidebar,/scale\(var\(--dock-scale\)/)
  assert.match(sidebar,/cubic-bezier\([^)]*1\.5[^)]*\)/)
  assert.match(sidebar,/nav-ring-spin \.62s/)
  assert.match(sidebar,/@media\(prefers-reduced-motion:reduce\)[\s\S]*--dock-scale:1/)
})
