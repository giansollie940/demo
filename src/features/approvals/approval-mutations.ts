import type { LegacyState, LegacySupabaseService } from '../../types/legacy'
import { registrationManagerActions } from '../registrations/registration-model'
import { commitStateMutation, refreshMutationRuntime, type LegacyMutationRuntime } from '../shared/legacy-mutation'

export interface ApprovalMutationRuntime extends Omit<LegacyMutationRuntime, 'service'> {
  service: Pick<LegacySupabaseService, 'syncState' | 'teacherRebaseWeeks' | 'requestRegistrationRevision' | 'deleteRegistration' | 'markNotificationsRead'>
}

function handledNotificationIds(state:LegacyState,registrationIds:string[]):string[]{
  const selected=new Set(registrationIds)
  return (state.notifications??[])
    .filter(item=>item.isRead!==true&&item.registrationId&&selected.has(String(item.registrationId)))
    .map(item=>String(item.id||''))
    .filter(Boolean)
}

export async function markHandledRegistrationNotificationsRead(runtime:ApprovalMutationRuntime,registrationIds:string[]):Promise<boolean>{
  const ids=handledNotificationIds(runtime.getState(),registrationIds)
  if(!ids.length)return false
  await runtime.service.markNotificationsRead(ids)
  return true
}

export async function approveRegistrationsMutation(
  runtime: ApprovalMutationRuntime,
  classId: string,
  registrationIds: string[],
  nowMs = Date.now(),
): Promise<LegacyState> {
  const selected = new Set(registrationIds)
  // Capture before commitStateMutation reloads canonical state. The DB trigger may remove
  // the notification during approval, while a late Realtime event could otherwise reinsert
  // a stale unread copy in the client.
  const notificationIds=handledNotificationIds(runtime.getState(),registrationIds)
  const canonical=await commitStateMutation(runtime, classId, source => {
    const next = structuredClone(source)
    for (const row of next.registrations) {
      if (!selected.has(row.id)) continue
      const week = next.weeks.find(item => item.id === row.weekId)
      if (!week) continue
      const actions = registrationManagerActions({ registration: row, week, periods: next.periods, nowMs })
      if (!actions.canApprove) continue
      Object.assign(row, { status: 'approved', approvalSource: 'manual', approvedAt: nowMs })
    }
    return next
  })
  if(notificationIds.length){
    await runtime.service.markNotificationsRead(notificationIds)
    return refreshMutationRuntime(runtime,classId)
  }
  return canonical
}

export function saveTeacherCommentMutation(
  runtime: ApprovalMutationRuntime,
  classId: string,
  registrationId: string,
  comment: string,
): Promise<LegacyState> {
  const value = comment.trim()
  if (!value) return Promise.reject(new Error('Vui lòng nhập nội dung nhận xét.'))
  return commitStateMutation(runtime, classId, source => {
    const next = structuredClone(source)
    const row = next.registrations.find(item => item.id === registrationId)
    if (!row) throw new Error('Không tìm thấy đăng ký.')
    row.teacherComment = value
    return next
  })
}

export async function requestManagedRevision(
  runtime: ApprovalMutationRuntime,
  classId: string,
  registrationId: string,
  comment: string,
): Promise<LegacyState> {
  const value = comment.trim()
  if (!value) throw new Error('Vui lòng nhập nội dung yêu cầu chỉnh sửa.')
  await runtime.service.requestRegistrationRevision(registrationId, value)
  await markHandledRegistrationNotificationsRead(runtime,[registrationId])
  return refreshMutationRuntime(runtime, classId)
}

export async function deleteManagedRegistration(
  runtime: ApprovalMutationRuntime,
  classId: string,
  registrationId: string,
): Promise<LegacyState> {
  await runtime.service.deleteRegistration(registrationId)
  await markHandledRegistrationNotificationsRead(runtime,[registrationId])
  return refreshMutationRuntime(runtime, classId)
}
