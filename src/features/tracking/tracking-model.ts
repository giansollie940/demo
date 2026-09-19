import type { CurrentUser, RegistrationRecord, ScheduleSlot } from '../../types/legacy'
import { needsTeacherAction } from '../registrations/registration-model'

export type TrackingBucket='registered'|'missing'|'attention'
export type TrackingFilter='all'|'registered'|'missing'|'attention'|'device'|'no-device'|'unknown-device'
export type TrackingSort='name'|'code'|'status'
export type TrackingDeviceState='device'|'no-device'|'unknown-device'|'missing'
export interface TrackingRow {user:CurrentUser;registration:RegistrationRecord|null;bucket:TrackingBucket}
export interface SessionTrackingSummary {session:ScheduleSlot;total:number;registered:number;missing:number;attention:number;completion:number;rows:TrackingRow[]}
export interface TrackingQuickReportRow {id:string;code:string;name:string;deviceState:TrackingDeviceState;registration:RegistrationRecord|null}

export function activeLearners(users:CurrentUser[]){return users.filter(user=>user.active!==false&&['student','monitor'].includes(user.role))}
export function registrationBucket(registration:RegistrationRecord|null):TrackingBucket{if(!registration||registration.status==='draft')return'missing';if(registration.revisionOverdueAt||needsTeacherAction(registration))return'attention';return'registered'}
export function registrationForSession(registrations:RegistrationRecord[],studentId:string,session:ScheduleSlot){return registrations.find(row=>row.studentId===studentId&&Number(row.dow)===Number(session.dow)&&Number(row.period)===Number(session.period)&&row.isDeleted!==true)??null}
export function trackingDeviceState(row:TrackingRow):TrackingDeviceState{if(!row.registration||row.bucket==='missing')return'missing';if(row.registration.usesElectronicDevice===true)return'device';if(row.registration.usesElectronicDevice===false)return'no-device';return'unknown-device'}

export function summarizeTrackingSession({users,registrations,session}:{users:CurrentUser[];registrations:RegistrationRecord[];session:ScheduleSlot}):SessionTrackingSummary{
  let registered=0,missing=0,attention=0
  const rows=activeLearners(users).map(user=>{const registration=registrationForSession(registrations,user.id,session),bucket=registrationBucket(registration);if(bucket==='missing')missing++;else registered++;if(bucket==='attention')attention++;return{user,registration,bucket}})
  const total=rows.length
  return{session,total,registered,missing,attention,completion:total?Math.round(registered/total*100):0,rows}
}

export function filterTrackingRows(rows:TrackingRow[],filter:TrackingFilter,query='',sort:TrackingSort='name'){
  const needle=query.trim().toLocaleLowerCase('vi')
  const filtered=rows.filter(row=>{
    if(needle){const haystack=`${row.user.code} ${row.user.name} ${row.registration?.content??''}`.toLocaleLowerCase('vi');if(!haystack.includes(needle))return false}
    if(filter==='all')return true
    if(filter==='registered')return row.bucket!=='missing'
    if(filter==='missing')return row.bucket==='missing'
    if(filter==='attention')return row.bucket==='attention'
    return trackingDeviceState(row)===filter
  })
  const rank:Record<TrackingBucket,number>={attention:0,missing:1,registered:2}
  return[...filtered].sort((a,b)=>sort==='code'?a.user.code.localeCompare(b.user.code,'vi',{numeric:true}):sort==='status'?rank[a.bucket]-rank[b.bucket]||a.user.name.localeCompare(b.user.name,'vi'):a.user.name.localeCompare(b.user.name,'vi'))
}

export function trackingFilterCounts(rows:TrackingRow[]):Record<TrackingFilter,number>{
  const states=rows.map(trackingDeviceState)
  return{all:rows.length,registered:rows.filter(row=>row.bucket!=='missing').length,missing:rows.filter(row=>row.bucket==='missing').length,attention:rows.filter(row=>row.bucket==='attention').length,device:states.filter(value=>value==='device').length,'no-device':states.filter(value=>value==='no-device').length,'unknown-device':states.filter(value=>value==='unknown-device').length}
}

export function trackingQuickReport(rows:TrackingRow[],filter:Extract<TrackingFilter,'missing'|'device'|'no-device'|'unknown-device'>,query='',sort:TrackingSort='name'):TrackingQuickReportRow[]{
  return filterTrackingRows(rows,filter,query,sort).map(row=>({id:row.user.id,code:row.user.code,name:row.user.name,deviceState:trackingDeviceState(row),registration:row.registration}))
}
