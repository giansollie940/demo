import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root=path.resolve(new URL('..',import.meta.url).pathname)
const read=(file)=>fs.readFileSync(path.join(root,file),'utf8')

test('legacy state exposes selected and available school years and loadState accepts a preferred year',()=>{
  const types=read('src/types/legacy.ts')
  const bridge=read('public/supabase-service.js')
  const auth=read('src/stores/auth.ts')
  const context=read('src/stores/context.ts')
  assert.match(types,/interface SchoolYearRecord/)
  assert.match(types,/availableSchoolYears:\s*SchoolYearRecord\[\]/)
  assert.match(types,/selectedSchoolYearId:\s*string \| null/)
  assert.match(types,/loadState\(preferredClassId\?: string \| null, preferredSchoolYearId\?: string \| null\)/)
  assert.match(bridge,/async function loadState\(preferredClassId=null,preferredSchoolYearId=null\)/)
  assert.match(auth,/reload\(preferredClassId:string\|null=null,preferredSchoolYearId:string\|null=null\)/)
  assert.match(context,/selectedSchoolYearId/)
  assert.match(context,/selectSchoolYear/)
})

test('topbar replaces duplicate class identity with school year bubble and reloads dependent context',()=>{
  const source=read('src/components/layout/TopBar.vue')
  assert.match(source,/class="school-year-bubble"/)
  assert.match(source,/changeSchoolYear/)
  assert.match(source,/context\.schoolYears/)
  assert.match(source,/auth\.reload\(null,id\)/)
  assert.doesNotMatch(source,/identity-bubble"><b>\{\{ context\.selectedClass/)
  assert.match(source,/const isTeacher=computed/)
  assert.match(source,/const isAdmin=computed/)
  assert.match(source,/v-if="isTeacher\|\|isAdmin" class="school-year-bubble/)
})

test('admin directory and Edge API expose school year list create and activate actions',()=>{
  const feature=read('src/features/admin/admin-directory.ts')
  const edge=read('supabase/functions/admin-manage-classes/index.ts')
  assert.match(feature,/schoolYears:AdminSchoolYearRecord\[\]/)
  assert.match(feature,/createSchoolYear/)
  assert.match(feature,/setActiveSchoolYear/)
  assert.match(feature,/adminManageClasses\('create_school_year'/)
  assert.match(feature,/adminManageClasses\('set_active_school_year'/)
  assert.match(edge,/schoolYears/)
  assert.match(edge,/action==="create_school_year"/)
  assert.match(edge,/action==="set_active_school_year"/)
  assert.match(edge,/admin_create_school_year/)
  assert.match(edge,/admin_set_active_school_year/)
})

test('database provides atomic root-admin school year creation activation and week generation',()=>{
  for(const file of ['database/upgrade/01-UPGRADE-CURRENT-TO-V8.7.1.sql','database/fresh-install/01-INSTALL-V8.7.1-FROM-COMPATIBLE-BASELINE.sql']){
    const sql=read(file)
    assert.match(sql,/create or replace function public\.admin_create_school_year/i,file)
    assert.match(sql,/create or replace function public\.admin_set_active_school_year/i,file)
    assert.match(sql,/generate_series/i,file)
    assert.match(sql,/insert into public\.weeks/i,file)
    assert.match(sql,/ROOT_ADMIN_REQUIRED|v_actor_role/i,file)
  }
  const verify=read('database/verify/VERIFY-V8.7.1.sql')
  assert.match(verify,/admin_create_school_year/i)
  assert.match(verify,/admin_set_active_school_year/i)
})

test('admin page has a Năm học tab with create and activate controls and no year deletion',()=>{
  const page=read('src/pages/AdminPage.vue')
  assert.match(page,/id:'years',label:'Năm học'/)
  assert.match(page,/tab==='years'/)
  assert.match(page,/Tạo năm học/)
  assert.match(page,/Ngày bắt đầu tuần 1/)
  assert.match(page,/Ngày kết thúc năm học/)
  assert.match(page,/setActiveSchoolYear/)
  assert.doesNotMatch(page,/deleteSchoolYear|delete_school_year/)
})


test('admin week rebase follows the selected school year instead of silently changing the global active year',()=>{
  const types=read('src/types/legacy.ts')
  const bridge=read('public/supabase-service.js')
  const mutations=read('src/features/weeks/week-mutations.ts')
  assert.match(types,/teacherRebaseWeeks\(firstWeekStart: string, deadlineTime\?: string, schoolYearId\?: string \| null\)/)
  assert.match(bridge,/async function teacherRebaseWeeks\(firstWeekStart, deadlineTime="20:00", schoolYearId=null\)/)
  assert.match(bridge,/schoolYearId\?sb\.from\("school_years"\).*\.eq\("id",schoolYearId\)/s)
  assert.match(mutations,/runtime\.getState\(\)\.selectedSchoolYearId/)
})

test('sidebar uses compact bubbles and a short rotating gradient ring only on hover',()=>{
  const sidebar=read('src/components/layout/SidebarNav.vue')
  assert.match(sidebar,/class="nav-icon-bubble"/)
  assert.match(sidebar,/conic-gradient/)
  assert.match(sidebar,/@keyframes\s+nav-ring-spin/)
  assert.match(sidebar,/\.nav-item:hover \.nav-icon-bubble::before[^}]*animation:nav-ring-spin/s)
  assert.doesNotMatch(sidebar,/\.nav-item\.active \.nav-icon-bubble::before[^}]*animation:/s)
  assert.match(sidebar,/@media\(prefers-reduced-motion:reduce\)[\s\S]*animation:none!important/)
})
