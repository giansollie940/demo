import { describe, expect, it } from 'vitest'
import { buildApprovalModel } from '../../src/features/approvals/approval-model'
import {
  approveRegistrationsMutation,
  deleteManagedRegistration,
  requestManagedRevision,
  saveTeacherCommentMutation,
  type ApprovalMutationRuntime,
} from '../../src/features/approvals/approval-mutations'
import type { CurrentUser, LegacyState, RegistrationRecord } from '../../src/types/legacy'

const at = (iso:string)=>new Date(iso).getTime()
function regs():RegistrationRecord[]{return[
  {id:'reg-1',studentId:'student-1',weekId:'week-1',dow:0,period:1,content:'A',status:'submitted',aiReviewStatus:'not_needed'},
  {id:'reg-2',studentId:'student-2',weekId:'week-1',dow:0,period:1,content:'B',status:'submitted',aiReviewStatus:'pending'},
  {id:'reg-3',studentId:'student-3',weekId:'week-1',dow:0,period:1,content:'C',status:'approved',isEmergency:true},
  {id:'reg-4',studentId:'student-4',weekId:'week-1',dow:0,period:1,content:'D',status:'needs_revision'},
]}
function stateFixture():LegacyState{return{version:1,activeSchoolYearId:'year-1',selectedSchoolYearId:'year-1',availableSchoolYears:[{id:'year-1',name:'2026–2027',startDate:'2026-08-24',endDate:'2027-05-30',active:true}],activeClassId:'class-1',availableClasses:[],settings:{},users:[],weeks:[{id:'week-1',number:1,startDate:'2026-08-24',endDate:'2026-08-30'}],periods:[{n:1,start:'07:00',end:'07:40'}],schedule:[{dow:0,period:1}],overrides:[],registrations:regs(),notifications:[],currentWeekId:'week-1'}}
function userFixture():CurrentUser{return{id:'teacher-1',code:'GV01',name:'Cô Lan',role:'teacher',classId:'class-1',active:true}}
function runtimeFixture(){let canonical=stateFixture();const events:string[]=[];const service={async syncState(next:LegacyState){events.push('sync');canonical=structuredClone(next)},async teacherRebaseWeeks(){return{}},async requestRegistrationRevision(id:string,comment:string){events.push(`revision:${id}:${comment}`);const row=canonical.registrations.find(item=>item.id===id);if(row)Object.assign(row,{status:'needs_revision',teacherComment:comment});return true},async deleteRegistration(id:string){events.push(`delete:${id}`);canonical.registrations=canonical.registrations.filter(row=>row.id!==id);return true},async markNotificationsRead(ids:string[]){events.push(`read:${ids.join(',')}`)}};const runtime:ApprovalMutationRuntime={service,currentUser:userFixture(),getState:()=>canonical,async reload(){events.push('reload');return structuredClone(canonical)},hydrate(){events.push('hydrate')},async invalidate(){events.push('invalidate')}};return{runtime,events,getState:()=>structuredClone(canonical)}}

describe('approval model',()=>{
  it('counts real filters, AI waiting, and emergency rows',()=>{
    expect(buildApprovalModel(regs(),{week:{id:'week-1',number:1,startDate:'2026-08-24',endDate:'2026-08-30'},periods:[{n:1,start:'07:00',end:'07:40'}],nowMs:at('2026-08-23T19:00:00+07:00')})).toMatchObject({counts:{attention:1,approved:1,revision:1,all:4},aiWaiting:1,emergency:1})
  })
})

describe('approval mutations',()=>{
  it('approves only eligible selected rows and preserves unrelated rows',async()=>{
    const fixture=runtimeFixture();await approveRegistrationsMutation(fixture.runtime,'class-1',['reg-1','reg-2'],at('2026-08-23T19:00:00+07:00'));expect(fixture.getState().registrations.find(row=>row.id==='reg-1')).toMatchObject({status:'approved',approvalSource:'manual'});expect(fixture.getState().registrations.find(row=>row.id==='reg-2')?.status).toBe('submitted');expect(fixture.events).toEqual(['sync','reload','hydrate','invalidate'])
  })
  it('saves a teacher comment without changing status',async()=>{
    const fixture=runtimeFixture();await saveTeacherCommentMutation(fixture.runtime,'class-1','reg-3','Tiếp tục phát huy.');expect(fixture.getState().registrations.find(row=>row.id==='reg-3')).toMatchObject({status:'approved',teacherComment:'Tiếp tục phát huy.'})
  })
  it('requests revision through RPC then reloads canonical state',async()=>{
    const fixture=runtimeFixture();await requestManagedRevision(fixture.runtime,'class-1','reg-3','Ghi rõ bài cần làm.');expect(fixture.getState().registrations.find(row=>row.id==='reg-3')).toMatchObject({status:'needs_revision',teacherComment:'Ghi rõ bài cần làm.'});expect(fixture.events).toEqual(['revision:reg-3:Ghi rõ bài cần làm.','reload','hydrate','invalidate'])
  })
  it('deletes through the safe bridge method and reloads',async()=>{
    const fixture=runtimeFixture();await deleteManagedRegistration(fixture.runtime,'class-1','reg-1');expect(fixture.getState().registrations.some(row=>row.id==='reg-1')).toBe(false);expect(fixture.events).toEqual(['delete:reg-1','reload','hydrate','invalidate'])
  })
})
