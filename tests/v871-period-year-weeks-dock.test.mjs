import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root=path.resolve(new URL('..',import.meta.url).pathname)
const read=(file)=>fs.readFileSync(path.join(root,file),'utf8')

test('active school year selector uses only a green status dot without active text',()=>{
  const top=read('src/components/layout/TopBar.vue')
  assert.match(top,/year-status-dot/)
  assert.match(top,/selectedSchoolYear\?\.active/)
  assert.doesNotMatch(top,/item\.active\?' · Đang hoạt động'/)
  assert.doesNotMatch(top,/>Đang hoạt động</)
})

test('teacher week management uses one master list and one detail editor instead of expanding every week',()=>{
  const page=read('src/pages/WeeksPage.vue')
  assert.match(page,/selectedDraftId/)
  assert.match(page,/selectedDraft/)
  assert.match(page,/week-master-detail/)
  assert.match(page,/week-master-list/)
  assert.match(page,/week-detail-panel/)
  assert.doesNotMatch(page,/<WeekEditorCard\s+v-for=/)
})

test('admin school year management exposes period timetable per school year',()=>{
  const feature=read('src/features/admin/admin-directory.ts')
  const page=read('src/pages/AdminPage.vue')
  const card=read('src/components/admin/AdminSchoolYearCard.vue')
  const edge=read('supabase/functions/admin-manage-classes/index.ts')
  assert.match(feature,/AdminSchoolYearPeriodRecord/)
  assert.match(feature,/periods:AdminSchoolYearPeriodRecord\[\]/)
  assert.match(feature,/updateSchoolYearPeriods/)
  assert.match(edge,/school_year_periods/)
  assert.match(edge,/action==="update_school_year_periods"/)
  assert.match(page,/yearPeriods/)
  assert.match(card,/Khung giờ tiết học/)
  assert.match(card,/Sao chép từ khung giờ mặc định|Lưu khung giờ/)
})

test('database stores period times per school year and session lifecycle resolves year-specific periods',()=>{
  for(const file of ['database/upgrade/01-UPGRADE-CURRENT-TO-V8.7.1.sql','database/fresh-install/01-INSTALL-V8.7.1-FROM-COMPATIBLE-BASELINE.sql']){
    const sql=read(file)
    assert.match(sql,/create table if not exists public\.school_year_periods/i,file)
    assert.match(sql,/primary key\s*\(school_year_id,period_number\)/i,file)
    assert.match(sql,/insert into public\.school_year_periods[\s\S]*from public\.school_years[\s\S]*public\.periods/i,file)
    assert.match(sql,/create or replace function public\.study_session_start/i,file)
    assert.match(sql,/school_year_periods/i,file)
    assert.match(sql,/class_week_effective_status[\s\S]*school_year_periods/i,file)
    assert.match(sql,/admin_replace_school_year_periods/i,file)
  }
  const verify=read('database/verify/VERIFY-V8.7.1.sql')
  assert.match(verify,/school_year_periods_table/)
  assert.match(verify,/school_year_periods_seeded/)
  assert.match(verify,/study_session_start_year_periods/)
})

test('macOS dock magnification displaces neighbors and reserves brand safe zone',()=>{
  const sidebar=read('src/components/layout/SidebarNav.vue')
  const shell=read('src/layouts/AppShell.vue')
  assert.match(sidebar,/dockShift/)
  assert.match(sidebar,/distance===2/)
  assert.match(sidebar,/--dock-shift-y/)
  assert.match(sidebar,/translateY\(var\(--dock-shift-y\)\)/)
  assert.match(sidebar,/dock-neighbor-shrink|--dock-neighbor-scale/)
  assert.match(shell,/dock-safe-zone|nav-safe-zone/)
  assert.match(shell,/side-head[\s\S]*z-index:/)
  assert.match(sidebar,/@media\(prefers-reduced-motion:reduce\)[\s\S]*--dock-shift-y:0px/)
})
