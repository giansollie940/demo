import type {
  EmergencyRegistrationInput,
  LegacySupabaseService,
  RegistrationRecord,
} from '../../src/types/legacy'

declare const service: LegacySupabaseService
declare const registration: RegistrationRecord
declare const emergencyInput: EmergencyRegistrationInput

const confidence: number | null | undefined = registration.aiConfidence
const emergency: boolean | undefined = registration.isEmergency
const approvalSource: string | undefined = registration.approvalSource
const reviewStatus: string | undefined = registration.aiReviewStatus

void confidence
void emergency
void approvalSource
void reviewStatus
void service.requestRegistrationRevision(registration.id, 'Ghi rõ mục tiêu.')
void service.emergencyRegister(emergencyInput)
void service.requestAiReview(registration.id)
void service.prepareSessionAiRereview({ classId: 'class-1', weekId: 'week-1', dow: 0, period: 1 })
void service.prepareRegistrationAiRereview(registration.id)
void service.deleteRegistration(registration.id)
void service.markNotificationsRead(['notification-1'])
