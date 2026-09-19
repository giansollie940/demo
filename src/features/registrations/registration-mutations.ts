import type {
  EmergencyRegistrationInput,
  LegacyState,
  LegacySupabaseService,
  RegistrationRecord,
} from '../../types/legacy'
import {
  commitStateMutation,
  refreshMutationRuntime,
  type LegacyMutationRuntime,
} from '../shared/legacy-mutation'

export interface RegistrationMutationRuntime extends Omit<LegacyMutationRuntime, 'service'> {
  service: Pick<
    LegacySupabaseService,
    'syncState' | 'teacherRebaseWeeks' | 'requestAiReview' | 'emergencyRegister' | 'deleteRegistration'
  >
}

export interface RegistrationDraftInput {
  classId: string
  weekId: string
  dow: number
  period: number
  content: string
  note?: string
  usesElectronicDevice?: boolean
  status: 'draft' | 'submitted'
}

export interface RegistrationMutationResult {
  state: LegacyState
  registration: RegistrationRecord
}

export interface RegistrationAiResult extends RegistrationMutationResult {
  aiAttempted: boolean
  aiError: string | null
}

function findRegistration(
  state: LegacyState,
  studentId: string,
  weekId: string,
  dow: number,
  period: number,
): RegistrationRecord | null {
  return state.registrations.find(row =>
    row.studentId === studentId
    && row.weekId === weekId
    && Number(row.dow) === Number(dow)
    && Number(row.period) === Number(period),
  ) ?? null
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'AI không xử lý được đăng ký.'
}

export async function saveRegistrationMutation(
  runtime: RegistrationMutationRuntime,
  input: RegistrationDraftInput,
  nowMs = Date.now(),
): Promise<RegistrationMutationResult> {
  const content = input.content.trim()
  if (!content) throw new Error('Bạn cần nhập nội dung tự học.')
  const studentId = runtime.currentUser.id
  const canonical = await commitStateMutation(runtime, input.classId, source => {
    const next = structuredClone(source)
    let row = findRegistration(next, studentId, input.weekId, input.dow, input.period)
    const wasApproved = row?.status === 'approved'
    if (!row) {
      row = {
        id: `local-${nowMs}`,
        classId: input.classId,
        studentId,
        weekId: input.weekId,
        dow: input.dow,
        period: input.period,
        content,
        status: input.status,
        teacherComment: '',
        approvalSource: 'manual',
        autoReviewReason: '',
        updatedAt: nowMs,
      }
      next.registrations.push(row)
    }
    Object.assign(row, {
      content,
      note: input.note?.trim() ?? '',
      usesElectronicDevice: input.usesElectronicDevice === true,
      status: wasApproved ? 'submitted' : input.status,
      updatedAt: nowMs,
    })
    if (wasApproved) {
      Object.assign(row, {
        approvalSource: 'manual',
        approvedAt: null,
        aiReviewStatus: 'not_needed',
        aiDecision: '',
        aiCategory: '',
        aiConfidence: null,
        aiRevisionStatus: '',
        aiRevisionConfidence: null,
        aiReason: '',
      })
    }
    return next
  })
  const registration = findRegistration(canonical, studentId, input.weekId, input.dow, input.period)
  if (!registration) throw new Error('Không tải lại được đăng ký sau khi lưu.')
  return { state: canonical, registration }
}

export async function submitRegistrationWithAi(
  runtime: RegistrationMutationRuntime,
  input: Omit<RegistrationDraftInput, 'status'>,
  nowMs = Date.now(),
): Promise<RegistrationAiResult> {
  const saved = await saveRegistrationMutation(runtime, { ...input, status: 'submitted' }, nowMs)
  if (saved.registration.aiReviewStatus !== 'pending') {
    return { ...saved, aiAttempted: false, aiError: null }
  }
  let aiError: string | null = null
  try {
    await runtime.service.requestAiReview(saved.registration.id)
  } catch (error) {
    aiError = messageOf(error)
  }
  const canonical = await refreshMutationRuntime(runtime, input.classId)
  const registration = findRegistration(canonical, runtime.currentUser.id, input.weekId, input.dow, input.period)
  if (!registration) throw new Error('Không tải lại được đăng ký sau khi AI xử lý.')
  return { state: canonical, registration, aiAttempted: true, aiError }
}

export async function createEmergencyRegistrationWithAi(
  runtime: RegistrationMutationRuntime,
  input: EmergencyRegistrationInput & { classId: string },
): Promise<RegistrationAiResult> {
  if (!input.content.trim()) throw new Error('Bạn cần nhập nội dung tự học.')
  if (input.reason.trim().length < 5) throw new Error('Hãy ghi lý do cần đăng ký bổ sung.')
  const created = await runtime.service.emergencyRegister({
    weekId: input.weekId,
    dow: input.dow,
    period: input.period,
    content: input.content.trim(),
    note: input.note?.trim() ?? '',
    reason: input.reason.trim(),
    usesElectronicDevice: input.usesElectronicDevice === true,
  })
  if (!created) throw new Error('Không tải được đăng ký bổ sung vừa tạo.')
  let aiAttempted = false
  let aiError: string | null = null
  if (created.aiReviewStatus === 'pending') {
    aiAttempted = true
    try {
      await runtime.service.requestAiReview(created.id)
    } catch (error) {
      aiError = messageOf(error)
    }
  }
  const canonical = await refreshMutationRuntime(runtime, input.classId)
  const registration = findRegistration(canonical, runtime.currentUser.id, input.weekId, input.dow, input.period)
  if (!registration) throw new Error('Không tải lại được đăng ký bổ sung.')
  return { state: canonical, registration, aiAttempted, aiError }
}

export async function cancelEmergencyRegistration(
  runtime: RegistrationMutationRuntime,
  classId: string,
  registrationId: string,
): Promise<LegacyState> {
  const row = runtime.getState().registrations.find(item => item.id === registrationId)
  if (!row?.isEmergency) throw new Error('Chỉ có thể hủy đăng ký bổ sung.')
  await runtime.service.deleteRegistration(registrationId)
  return refreshMutationRuntime(runtime, classId)
}
