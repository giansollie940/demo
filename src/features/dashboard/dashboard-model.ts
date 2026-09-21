import type { CurrentUser, PeriodRecord, RegistrationRecord, ScheduleSlot, WeekRecord } from '../../types/legacy'
import { isRegistrationIssue } from '../registrations/registration-model'
import { usesDevice } from '../registrations/device-policy'

export interface DashboardMetrics{students:number;slots:number;expected:number;submitted:number;approved:number;needsRevision:number;issues:number;electronicDevices:number;completion:number}
export function buildDashboardMetrics({users,registrations,slots,week=null,periods=[],nowMs=Date.now()}:{users:CurrentUser[];registrations:RegistrationRecord[];slots:ScheduleSlot[];week?:WeekRecord|null;periods?:PeriodRecord[];nowMs?:number}):DashboardMetrics{
  const students=users.filter(user=>user.active!==false&&(user.role==='student'||user.role==='monitor')).length
  const submitted=registrations.filter(row=>row.status!=='draft').length
  const approved=registrations.filter(row=>row.status==='approved').length
  const isIssue=(row:RegistrationRecord)=>week?isRegistrationIssue(row,{week,periods,nowMs}):Boolean(row.revisionOverdueAt)
  const issues=registrations.filter(isIssue).length
  const needsRevision=registrations.filter(row=>row.status==='needs_revision'&&!isIssue(row)).length
  // FEAT-010: đếm quyền hiệu lực. Xem device-policy.usesDevice.
  const electronicDevices=registrations.filter(usesDevice).length
  const expected=students*slots.length
  return{students,slots:slots.length,expected,submitted,approved,needsRevision,issues,electronicDevices,completion:expected?Math.min(100,Math.round(submitted/expected*100)):0}
}
