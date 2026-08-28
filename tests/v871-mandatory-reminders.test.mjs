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
  const temp=path.join(os.tmpdir(),`owl-reminders-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.ts`)
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

function stateLiteral(){
  return `{
    version:1,activeSchoolYearId:'sy',activeClassId:'c1',availableClasses:[],settings:{registrationDeadlineTime:'20:00'},
    users:[
      {id:'m1',code:'CS01',name:'Cán sự',role:'monitor',classId:'c1',active:true},
      {id:'s1',code:'HS01',name:'HS 1',role:'student',classId:'c1',active:true},
      {id:'s2',code:'HS02',name:'HS 2',role:'student',classId:'c1',active:true}
    ],
    weeks:[{id:'w1',number:4,startDate:'2026-08-24',endDate:'2026-08-28'}],
    periods:[{n:1,start:'08:00',end:'08:45'}],
    schedule:[{dow:0,period:1},{dow:1,period:1}],overrides:[],currentWeekId:'w1',notifications:[],registrations:[]
  }`
}

test('learner owl includes a mandatory reminder when a future self-study slot is not registered',()=>{
  const owlUrl=typedOwlModuleUrl()
  const code=`
    import assert from 'node:assert/strict';
    import { buildOwlContextMessages } from ${JSON.stringify(owlUrl)};
    const state=${stateLiteral()};
    const user=state.users.find(x=>x.id==='s1');
    state.registrations=[{id:'r1',studentId:'s1',weekId:'w1',dow:0,period:1,content:'Toán',status:'approved'}];
    const nowMs=new Date('2026-08-24T09:00:00+07:00').getTime();
    const messages=buildOwlContextMessages({state,user,path:'/dashboard',weekId:'w1',nowMs});
    assert.equal(messages.some(x=>/chưa đăng ký/i.test(x.text)),true,JSON.stringify(messages));
  `
  assert.doesNotThrow(()=>runTypedModule(code))
})

test('learner owl warns before a registered self-study session starts',()=>{
  const owlUrl=typedOwlModuleUrl()
  const code=`
    import assert from 'node:assert/strict';
    import { buildOwlContextMessages } from ${JSON.stringify(owlUrl)};
    const state=${stateLiteral()};
    const user=state.users.find(x=>x.id==='s1');
    state.registrations=[{id:'r1',studentId:'s1',weekId:'w1',dow:0,period:1,content:'Toán',status:'approved'}];
    const nowMs=new Date('2026-08-24T07:30:00+07:00').getTime();
    const messages=buildOwlContextMessages({state,user,path:'/dashboard',weekId:'w1',nowMs});
    const reminder=messages.find(x=>/sắp bắt đầu|30 phút|buổi tự học/i.test(x.text)&&x.urgent);
    assert.ok(reminder,JSON.stringify(messages));
  `
  assert.doesNotThrow(()=>runTypedModule(code))
})

test('monitor owl includes class-support reminders and urgent near-session incompleteness',()=>{
  const owlUrl=typedOwlModuleUrl()
  const code=`
    import assert from 'node:assert/strict';
    import { buildOwlContextMessages } from ${JSON.stringify(owlUrl)};
    const state=${stateLiteral()};
    const user=state.users.find(x=>x.id==='m1');
    state.registrations=[
      {id:'rm',studentId:'m1',weekId:'w1',dow:0,period:1,content:'Toán',status:'approved'},
      {id:'r2',studentId:'s2',weekId:'w1',dow:0,period:1,content:'Văn',status:'needs_revision',teacherComment:'Sửa rõ hơn'}
    ];
    const nowMs=new Date('2026-08-24T07:30:00+07:00').getTime();
    const messages=buildOwlContextMessages({state,user,path:'/dashboard',weekId:'w1',nowMs});
    assert.equal(messages.some(x=>/lớp.*chưa đăng ký/i.test(x.text)),true,JSON.stringify(messages));
    assert.equal(messages.some(x=>/lớp.*cần chỉnh sửa/i.test(x.text)),true,JSON.stringify(messages));
    assert.equal(messages.some(x=>x.urgent&&/lớp.*chưa hoàn tất|chưa hoàn tất.*lớp/i.test(x.text)),true,JSON.stringify(messages));
  `
  assert.doesNotThrow(()=>runTypedModule(code))
})

test('mandatory learner urgent reminders auto-open even if the optional manager owl preference is off',()=>{
  const owl=read('src/components/owl/WiseOwl.vue')
  assert.match(owl,/mandatoryLearnerAlerts|learnerMandatoryAlerts/)
  assert.match(owl,/student.*monitor|monitor.*student/)
  assert.match(owl,/message\.value\?\.urgent[\s\S]{0,180}(mandatoryLearnerAlerts|learnerMandatoryAlerts)/)
})
