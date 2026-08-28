import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root=path.resolve(new URL('..',import.meta.url).pathname)
const read=(file)=>fs.readFileSync(path.join(root,file),'utf8')
const exists=(file)=>fs.existsSync(path.join(root,file))

test('release is V8.8.0 and includes the new upgrade and verifier',()=>{
  const pkg=JSON.parse(read('package.json'))
  assert.equal(pkg.version,'8.8.0')
  assert.ok(exists('database/upgrade/01-UPGRADE-CURRENT-TO-V8.8.0.sql'))
  assert.ok(exists('database/verify/VERIFY-V8.8.0.sql'))
})

test('admin learner and teacher editing uses dialogs and includes reset-password dialog',()=>{
  const page=read('src/pages/AdminPage.vue')
  assert.ok(exists('src/components/admin/AdminUserDialog.vue'))
  assert.ok(exists('src/components/admin/AdminPasswordDialog.vue'))
  assert.match(page,/AdminUserDialog/)
  assert.match(page,/AdminPasswordDialog/)
  assert.doesNotMatch(page,/window\.prompt\(['"](?:Mã đăng nhập|Họ và tên|Vai trò|Mã lớp|Tên giáo viên|Mã giáo viên)/)
  const password=read('src/components/admin/AdminPasswordDialog.vue')
  assert.match(password,/Tạo mật khẩu ngẫu nhiên/)
  assert.match(password,/Đặt lại mật khẩu/)
})

test('admin mutations expose optimistic cache updates and visible database loading states',()=>{
  const directory=read('src/features/admin/admin-directory.ts')
  const page=read('src/pages/AdminPage.vue')
  assert.match(directory,/setQueryData/)
  assert.match(page,/Đang đồng bộ|Đang lưu|Đang đặt lại|busyKey/)
  assert.match(page,/resetManagedPassword/)
})

test('admin can open personal settings and configure Wise Owl without class settings',()=>{
  const routes=read('src/app/router/routes.ts')
  const settings=read('src/pages/SettingsPage.vue')
  const topbar=read('src/components/layout/TopBar.vue')
  assert.match(routes,/path:\s*['"]settings['"][\s\S]*admin/)
  assert.match(settings,/owlEnabled|Cú Thông Thái/)
  assert.match(settings,/isAdmin|role===['"]admin['"]/)
  assert.match(topbar,/Tùy chọn cá nhân/)
})

test('tracking quick reports are scoped to the selected session and distinguish unknown device state',()=>{
  assert.ok(exists('src/components/tracking/TrackingQuickReport.vue'))
  const model=read('src/features/tracking/tracking-model.ts')
  const page=read('src/pages/TrackingPage.vue')
  assert.match(model,/unknown-device/)
  assert.match(model,/quickReport|QuickReport/i)
  assert.match(page,/TrackingQuickReport/)
  assert.match(page,/selectedSummary/)
  assert.match(page,/missing|device|no-device/)
})

test('week detail uses a compact master column and deadline overlay instead of conditional grid row',()=>{
  const weeks=read('src/pages/WeeksPage.vue')
  const editor=read('src/components/weeks/WeekEditorCard.vue')
  assert.match(weeks,/clamp\(310px,28vw,370px\)/)
  assert.match(editor,/deadline-popover|deadline-overlay/)
  assert.doesNotMatch(editor,/v-if="modelValue\.deadlineMode === 'specific'" class="field-control"/)
})

test('timetable engine supports generated periods exceptions custom breaks and weekday inheritance',()=>{
  assert.ok(exists('src/features/timetable/timetable-engine.ts'))
  assert.ok(exists('src/features/timetable/timetable-types.ts'))
  assert.ok(exists('tests/unit/timetable-engine.spec.ts'))
  const engine=read('src/features/timetable/timetable-engine.ts')
  assert.match(engine,/calculateTimetable/)
  assert.match(engine,/custom/)
  assert.match(engine,/periodOverrides/)
  assert.match(engine,/dayOverrides/)
})

test('database contains versioned timetable templates assignments and dynamic lifecycle resolution',()=>{
  const sql=read('database/upgrade/01-UPGRADE-CURRENT-TO-V8.8.0.sql')
  const verify=read('database/verify/VERIFY-V8.8.0.sql')
  for(const name of ['timetable_templates','timetable_template_versions','class_timetable_assignments']) assert.match(sql,new RegExp(`create table if not exists public\\.${name}`,'i'))
  assert.match(sql,/effective_from/i)
  assert.match(sql,/effective_to/i)
  assert.match(sql,/TIMETABLE_TEMPLATE_MIGRATED|DEFAULT_TIMETABLE/i)
  assert.match(sql,/study_session_start/i)
  assert.match(verify,/timetable_templates/i)
  assert.match(verify,/class_timetable_assignments/i)
})

test('admin API exposes timetable template/version/assignment actions with audit',()=>{
  const edge=read('supabase/functions/admin-manage-classes/index.ts')
  const directory=read('src/features/admin/admin-directory.ts')
  assert.match(edge,/create_timetable_template/)
  assert.match(edge,/save_timetable_version/)
  assert.match(edge,/assign_timetable_template/)
  assert.match(edge,/ADMIN_(CREATE|SAVE|ASSIGN)_TIMETABLE/)
  assert.match(directory,/timetableTemplates/)
  assert.match(directory,/timetableAssignments/)
})

test('admin school year UI includes timetable builder with live preview and effective class assignment',()=>{
  assert.ok(exists('src/components/admin/AdminTimetableBuilder.vue'))
  assert.ok(exists('src/components/admin/AdminTimetableAssignment.vue'))
  const year=read('src/components/admin/AdminSchoolYearCard.vue')
  assert.match(year,/AdminTimetableBuilder|Mẫu TKB/)
})

test('teacher schedule uses generated timetable and monitor view is read-only',()=>{
  const page=read('src/pages/SchedulePage.vue')
  const routes=read('src/app/router/routes.ts')
  assert.match(page,/generated|resolvedPeriods|periods/i)
  assert.match(page,/readOnly|isMonitor/)
  assert.match(routes,/schedule[\s\S]*monitor/)
})

test('password reset audit never stores password and uses target-aware actions',()=>{
  const edge=read('supabase/functions/admin-reset-password/index.ts')
  assert.match(edge,/ADMIN_RESET_(STUDENT|MONITOR|TEACHER)_PASSWORD|ADMIN_RESET_USER_PASSWORD/)
  assert.doesNotMatch(edge,/newData:\s*\{[^}]*password:\s*newPassword/s)
})

test('all registration time guards use the class-specific timetable resolver',()=>{
  const sql=read('database/upgrade/01-UPGRADE-CURRENT-TO-V8.8.0.sql')
  assert.match(sql,/create or replace function public\.guard_student_registration_update\([\s\S]*study_session_start\(old\.class_id\s*,\s*old\.week_id\s*,\s*old\.weekday\s*,\s*old\.period_number\)/i)
  assert.match(sql,/create or replace function public\.sync_revision_overdue_reports\([\s\S]*study_session_start\(r\.class_id\s*,\s*r\.week_id\s*,\s*r\.weekday\s*,\s*r\.period_number\)/i)
  assert.match(sql,/create or replace function public\.delete_registration_safely\([\s\S]*study_session_start\(v_registration\.class_id\s*,\s*v_registration\.week_id\s*,\s*v_registration\.weekday\s*,\s*v_registration\.period_number\)/i)
  assert.match(sql,/create policy registrations_student_update_v840[\s\S]*study_session_start\(class_id\s*,\s*week_id\s*,\s*weekday\s*,\s*period_number\)/i)
})

test('default timetable migration is idempotent by the reserved default-template name',()=>{
  const sql=read('database/upgrade/01-UPGRADE-CURRENT-TO-V8.8.0.sql')
  assert.match(sql,/insert into public\.timetable_templates[\s\S]*where not exists\([\s\S]*t\.school_year_id\s*=\s*sy\.id[\s\S]*t\.name\s*=\s*'TKB mặc định V8\.8\.0'/i)
})

test('V8.8 verifier checks class-specific registration guards and default timetable migration coverage',()=>{
  const verify=read('database/verify/VERIFY-V8.8.0.sql')
  for(const marker of [
    'guard_student_registration_class_specific',
    'revision_overdue_class_specific',
    'delete_registration_class_specific',
    'student_update_policy_class_specific',
    'default_template_per_year',
    'active_classes_have_timetable'
  ]) assert.match(verify,new RegExp(marker,'i'))
  assert.match(verify,/pg_get_functiondef/i)
  assert.match(verify,/pg_get_expr|pg_policies/i)
})

test('admin password dialog validates that generated/manual passwords include a digit',()=>{
  const password=read('src/components/admin/AdminPasswordDialog.vue')
  assert.match(password,/!\s*\/\\d\/\.test\(password\.value\)/)
})

test('admin edit dialogs stay open while database mutations are saving and close only after success',()=>{
  const page=read('src/pages/AdminPage.vue')
  assert.doesNotMatch(page,/const promise=updateManagedUser[\s\S]{0,180}userDialogOpen\.value=false;await promise/)
  assert.doesNotMatch(page,/const promise=updateTeacher[\s\S]{0,180}userDialogOpen\.value=false;await promise/)
  assert.match(page,/await updateManagedUser\(/)
  assert.match(page,/await updateTeacher\(/)
})

test('timetable validation accepts zero default breaks consistently between frontend and Edge',()=>{
  const engine=read('src/features/timetable/timetable-engine.ts')
  const edge=read('supabase/functions/admin-manage-classes/index.ts')
  assert.match(engine,/shortBreakMinutes\)\|\|config\.shortBreakMinutes<0/)
  assert.match(engine,/longBreakMinutes\)\|\|config\.longBreakMinutes<0/)
  assert.match(edge,/defaultPeriodMinutes[\s\S]{0,500}value<1/)
  assert.match(edge,/\["shortBreakMinutes","longBreakMinutes"\][\s\S]{0,300}value<0/)
})

test('timetable generator and persisted preview share the 40 period ceiling',()=>{
  const engine=read('src/features/timetable/timetable-engine.ts')
  const edge=read('supabase/functions/admin-manage-classes/index.ts')
  assert.match(engine,/MAX_TIMETABLE_PERIODS\s*=\s*40/)
  assert.match(engine,/number\s*<=\s*MAX_TIMETABLE_PERIODS/)
  assert.match(edge,/periods\.length>40/)
  assert.match(edge,/number>40/)
})

test('timetable assignments are rejected outside the selected school year at Edge and SQL layers',()=>{
  const edge=read('supabase/functions/admin-manage-classes/index.ts')
  const sql=read('database/upgrade/01-UPGRADE-CURRENT-TO-V8.8.0.sql')
  const verify=read('database/verify/VERIFY-V8.8.0.sql')
  assert.match(edge,/school_years["']?\)?\.select\(["']start_date,end_date["']/)
  assert.match(edge,/effectiveFrom\s*<\s*.*start_date|effectiveFrom<.*start_date/)
  assert.match(edge,/effectiveTo\s*>\s*.*end_date|effectiveTo>.*end_date/)
  assert.match(sql,/select\s+start_date\s*,\s*end_date\s+into\s+v_year_start\s*,\s*v_year_end/i)
  assert.match(sql,/p_effective_from\s*<\s*v_year_start/i)
  assert.match(sql,/p_effective_to\s*>\s*v_year_end/i)
  assert.match(verify,/assignment_ranges_within_school_year/i)
})

test('default timetable migration infers morning and afternoon around the largest long gap',()=>{
  const sql=read('database/upgrade/01-UPGRADE-CURRENT-TO-V8.8.0.sql')
  assert.match(sql,/largest_gap/i)
  assert.match(sql,/gap_minutes\s*>=\s*30/i)
  assert.match(sql,/'afternoonStart'/i)
  assert.match(sql,/'afternoonEnd'/i)
  assert.match(sql,/gap_minutes\s*<\s*30/i)
})

test('database mutations expose visible row or button loading feedback across manager workflows',()=>{
  const trackingPage=read('src/pages/TrackingPage.vue')
  const trackingRow=read('src/components/tracking/StudentTrackingRow.vue')
  const students=read('src/components/students/StudentDirectory.vue')
  const adminClass=read('src/components/admin/AdminClassCard.vue')
  const adminPage=read('src/pages/AdminPage.vue')
  assert.match(trackingPage,/status\.value=['"]saving['"][\s\S]{0,160}Đang (?:xử lý|đồng bộ)/)
  assert.match(trackingRow,/busy-indicator[\s\S]*Đang xử lý/)
  assert.match(students,/Đang xử lý/)
  assert.match(adminClass,/busy\?:boolean/)
  assert.match(adminClass,/:loading="busy"/)
  assert.match(adminPage,/:busy="busyKey===`class:\$\{item\.id\}`"/)
})

test('timetable assignment form prevents dates outside its school year before calling backend',()=>{
  const form=read('src/components/admin/AdminTimetableAssignment.vue')
  assert.match(form,/form\.from>=props\.yearStart/)
  assert.match(form,/form\.to<=props\.yearEnd/)
  assert.match(form,/:min="yearStart"/)
  assert.match(form,/:max="yearEnd"/)
})

test('V8.8 verifier normalizes PostgreSQL pretty-printed whitespace portably',()=>{
  const verify=read('database/verify/VERIFY-V8.8.0.sql')
  assert.match(verify,/\[\[:space:\]\]\+/)
  assert.doesNotMatch(verify,/'\\\\s\+'/)
  assert.match(verify,/pg_get_expr\(p\.polqual\s*,\s*p\.polrelid\)/i)
})
