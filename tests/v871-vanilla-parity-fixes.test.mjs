import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import os from 'node:os'

const root=path.resolve(new URL('..',import.meta.url).pathname)
const read=(file)=>fs.readFileSync(path.join(root,file),'utf8')

function typedOwlModuleUrl(){
  const source=read('src/features/owl/owl-model.ts')
  const registrationUrl=pathToFileURL(path.join(root,'src/features/registrations/registration-model.ts')).href
  const scheduleUrl=pathToFileURL(path.join(root,'src/features/schedule/schedule-model.ts')).href
  const patched=source
    .replace("from '../registrations/registration-model'",`from ${JSON.stringify(registrationUrl)}`)
    .replace("from '../schedule/schedule-model'",`from ${JSON.stringify(scheduleUrl)}`)
  const temp=path.join(os.tmpdir(),`owl-model-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.ts`)
  fs.writeFileSync(temp,patched)
  return pathToFileURL(temp).href
}

function runTypedModule(code){
  return execFileSync(process.execPath,[
    '--experimental-strip-types',
    '--experimental-specifier-resolution=node',
    '--input-type=module',
    '-e',code,
  ],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']})
}

test('owl urgent state ignores stale unread notifications after linked registration was approved',()=>{
  const owlUrl=typedOwlModuleUrl()
  const code=`
    import assert from 'node:assert/strict';
    import { buildOwlContextMessages } from ${JSON.stringify(owlUrl)};
    const user={id:'t1',code:'GV01',name:'GV',role:'teacher',classId:'c1',active:true};
    const state={
      version:1,activeSchoolYearId:'sy',activeClassId:'c1',availableClasses:[],settings:{},users:[user],
      weeks:[{id:'w1',number:1,startDate:'2026-08-24',endDate:'2026-08-28'},{id:'w2',number:2,startDate:'2026-08-31',endDate:'2026-09-04'}],
      periods:[],schedule:[],overrides:[],currentWeekId:'w1',
      registrations:[{id:'r-approved',studentId:'s1',weekId:'w2',dow:0,period:1,content:'Toán',status:'approved',approvalSource:'manual'}],
      notifications:[{id:'n1',registrationId:'r-approved',weekId:'w2',type:'manual_review',title:'Cần xử lý',isRead:false}],
    };
    const messages=buildOwlContextMessages({state,user,path:'/dashboard'});
    assert.equal(messages.some(x=>x.urgent),false,JSON.stringify(messages));
    assert.equal(messages.some(x=>/cần giáo viên xử lý|thông báo chưa đọc/i.test(x.text)),false,JSON.stringify(messages));
  `
  assert.doesNotThrow(()=>runTypedModule(code))
})

test('owl urgent state still reflects a real submitted registration that needs teacher action',()=>{
  const owlUrl=typedOwlModuleUrl()
  const code=`
    import assert from 'node:assert/strict';
    import { buildOwlContextMessages } from ${JSON.stringify(owlUrl)};
    const user={id:'t1',code:'GV01',name:'GV',role:'teacher',classId:'c1',active:true};
    const state={version:1,activeSchoolYearId:'sy',activeClassId:'c1',availableClasses:[],settings:{},users:[user],
      weeks:[{id:'w1',number:1,startDate:'2026-08-24',endDate:'2026-08-28'}],periods:[],schedule:[],overrides:[],currentWeekId:'w1',
      registrations:[{id:'r1',studentId:'s1',weekId:'w1',dow:0,period:1,content:'Toán',status:'submitted',approvalSource:'manual',aiReviewStatus:'manual_review'}],notifications:[]};
    const messages=buildOwlContextMessages({state,user,path:'/dashboard'});
    assert.equal(messages.some(x=>x.urgent),true,JSON.stringify(messages));
  `
  assert.doesNotThrow(()=>runTypedModule(code))
})


test('approval captures notification ids before canonical reload so handled notifications cannot be stranded unread',()=>{
  const source=read('src/features/approvals/approval-mutations.ts')
  const approveStart=source.indexOf('export async function approveRegistrationsMutation')
  const slice=source.slice(approveStart,source.indexOf('export function saveTeacherCommentMutation'))
  const capture=Math.max(slice.indexOf('notificationIds'),slice.indexOf('handledNotificationIds'))
  const commit=slice.indexOf('const canonical=await commitStateMutation')
  assert.ok(capture>=0&&commit>=0&&capture<commit,'notification ids must be captured before commitStateMutation reloads canonical state')
})

test('shell restores subtle school background, signed-in profile identity, and sidebar encouragement',()=>{
  const shell=read('src/layouts/AppShell.vue')
  const top=read('src/components/layout/TopBar.vue')
  assert.match(shell,/school-pattern-bg\.png/)
  assert.match(shell,/Mỗi tiết tự học là một bước tiến nhỏ/)
  assert.match(top,/profile-chip/)
  assert.match(top,/auth\.currentUser\?\.name|auth\.currentUser\.name/)
  assert.match(top,/Giáo viên|Quản trị viên|Học sinh|Cán sự lớp/)
})

test('revision overdue has a dedicated issues route and page for learner and manager views',()=>{
  const routes=read('src/app/router/routes.ts')
  const navigation=read('src/features/navigation/navigation.ts')
  const sidebar=read('src/components/layout/SidebarNav.vue')
  assert.ok(fs.existsSync(path.join(root,'src/pages/IssuesPage.vue')),'IssuesPage.vue must exist')
  const issues=read('src/pages/IssuesPage.vue')
  assert.match(routes,/IssuesPage/)
  assert.match(routes,/path:\s*['"]issues['"]/)
  assert.match(navigation,/["']Báo cáo lỗi["'].*["']\/issues["']/)
  assert.match(sidebar,/TriangleAlert/)
  assert.match(issues,/isRevisionOverdue/)
  assert.match(issues,/studentId\s*===\s*auth\.currentUser\?\.id|studentId\s*===\s*auth\.currentUser\.id/)
  assert.match(issues,/Báo cáo lỗi/)
  assert.match(issues,/teacherComment/)
})

test('registration overdue status is clock-reactive instead of relying on a render-time Date.now call',()=>{
  const page=read('src/pages/RegistrationPage.vue')
  assert.match(page,/useNowTicker/)
  assert.match(page,/nowMs\.value/)
  assert.doesNotMatch(page,/nowMs:\s*Date\.now\(\)/)
})

test('dashboard separates overdue reports from active revision requests',()=>{
  const model=read('src/features/dashboard/dashboard-model.ts')
  const page=read('src/pages/DashboardPage.vue')
  assert.match(model,/issues:number/)
  assert.match(model,/isRevisionOverdue/)
  assert.match(page,/(?:classMetrics|personalMetrics)\.issues/)
  assert.match(page,/Báo cáo lỗi/)
})
