import type { PeriodRecord, RegistrationRecord, WeekRecord } from '../../types/legacy'
import { matchesApprovalFilter, type ApprovalFilter } from '../registrations/registration-model'

export interface ApprovalModel {
  counts: Record<ApprovalFilter, number>
  aiWaiting: number
  emergency: number
}

export function buildApprovalModel(
  registrations: RegistrationRecord[],
  options: { week: WeekRecord; periods: PeriodRecord[]; nowMs: number },
): ApprovalModel {
  const counts: Record<ApprovalFilter, number> = { attention: 0, approved: 0, revision: 0, all: registrations.length }
  for (const row of registrations) {
    if (matchesApprovalFilter(row, 'attention', options)) counts.attention += 1
    if (matchesApprovalFilter(row, 'approved', options)) counts.approved += 1
    if (matchesApprovalFilter(row, 'revision', options)) counts.revision += 1
  }
  return {
    counts,
    aiWaiting: registrations.filter(row =>
      !row.isEmergency
      && row.status === 'submitted'
      && (row.approvalSource ?? 'manual') === 'manual'
      && ['pending', 'processing'].includes(row.aiReviewStatus ?? ''),
    ).length,
    emergency: registrations.filter(row => row.isEmergency).length,
  }
}

export function filterApprovals(
  registrations: RegistrationRecord[],
  filter: ApprovalFilter,
  options: { week: WeekRecord; periods: PeriodRecord[]; nowMs: number },
): RegistrationRecord[] {
  return registrations.filter(row => matchesApprovalFilter(row, filter, options))
}
