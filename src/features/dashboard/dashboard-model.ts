import type { CurrentUser, RegistrationRecord, ScheduleSlot } from '../../types/legacy'
export interface DashboardMetrics{students:number;slots:number;expected:number;submitted:number;approved:number;needsRevision:number;electronicDevices:number;completion:number}
export function buildDashboardMetrics({users,registrations,slots}:{users:CurrentUser[];registrations:RegistrationRecord[];slots:ScheduleSlot[]}):DashboardMetrics{
  const students=users.filter(user=>user.active!==false&&(user.role==='student'||user.role==='monitor')).length
  const submitted=registrations.filter(row=>row.status!=='draft').length
  const approved=registrations.filter(row=>row.status==='approved').length
  const needsRevision=registrations.filter(row=>row.status==='needs_revision').length
  const electronicDevices=registrations.filter(row=>row.usesElectronicDevice===true).length
  const expected=students*slots.length
  return{students,slots:slots.length,expected,submitted,approved,needsRevision,electronicDevices,completion:expected?Math.min(100,Math.round(submitted/expected*100)):0}
}
