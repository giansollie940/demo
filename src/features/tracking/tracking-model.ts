import type { CurrentUser, RegistrationRecord, ScheduleSlot } from '../../types/legacy'
import { needsTeacherAction } from '../registrations/registration-model'

export type TrackingBucket = 'registered' | 'missing' | 'attention'
export type TrackingFilter = 'all' | 'registered' | 'missing' | 'attention' | 'device' | 'no-device'
export type TrackingSort = 'name' | 'code' | 'status'

export interface TrackingRow {
  user: CurrentUser
  registration: RegistrationRecord | null
  bucket: TrackingBucket
}

export interface SessionTrackingSummary {
  session: ScheduleSlot
  total: number
  registered: number
  missing: number
  attention: number
  completion: number
  rows: TrackingRow[]
}

export function activeLearners(users: CurrentUser[]): CurrentUser[] {
  return users.filter(user => user.active !== false && ['student', 'monitor'].includes(user.role))
}

export function registrationBucket(registration: RegistrationRecord | null): TrackingBucket {
  if (!registration || registration.status === 'draft') return 'missing'
  if (registration.revisionOverdueAt) return 'attention'
  if (needsTeacherAction(registration)) return 'attention'
  return 'registered'
}

export function registrationForSession(
  registrations: RegistrationRecord[],
  studentId: string,
  session: ScheduleSlot,
): RegistrationRecord | null {
  return registrations.find(row =>
    row.studentId === studentId
    && Number(row.dow) === Number(session.dow)
    && Number(row.period) === Number(session.period)
    && row.isDeleted !== true,
  ) ?? null
}

export function summarizeTrackingSession({
  users,
  registrations,
  session,
}: {
  users: CurrentUser[]
  registrations: RegistrationRecord[]
  session: ScheduleSlot
}): SessionTrackingSummary {
  let registered = 0
  let missing = 0
  let attention = 0
  const rows = activeLearners(users).map(user => {
    const registration = registrationForSession(registrations, user.id, session)
    const bucket = registrationBucket(registration)
    if (bucket === 'missing') missing += 1
    else registered += 1
    if (bucket === 'attention') attention += 1
    return { user, registration, bucket }
  })
  const total = rows.length
  return { session, total, registered, missing, attention, completion: total ? Math.round(registered / total * 100) : 0, rows }
}

export function filterTrackingRows(
  rows: TrackingRow[],
  filter: TrackingFilter,
  query = '',
  sort: TrackingSort = 'name',
): TrackingRow[] {
  const needle = query.trim().toLocaleLowerCase('vi')
  const filtered = rows.filter(row => {
    if (needle) {
      const haystack = `${row.user.code} ${row.user.name} ${row.registration?.content ?? ''}`.toLocaleLowerCase('vi')
      if (!haystack.includes(needle)) return false
    }
    if (filter === 'all') return true
    if (filter === 'registered') return row.bucket !== 'missing'
    if (filter === 'missing') return row.bucket === 'missing'
    if (filter === 'attention') return row.bucket === 'attention'
    if (filter === 'device') return Boolean(row.registration?.usesElectronicDevice)
    return Boolean(row.registration && row.bucket !== 'missing' && row.registration.usesElectronicDevice !== true)
  })
  const rank: Record<TrackingBucket, number> = { attention: 0, missing: 1, registered: 2 }
  return [...filtered].sort((a, b) => {
    if (sort === 'code') return a.user.code.localeCompare(b.user.code, 'vi', { numeric: true })
    if (sort === 'status') return rank[a.bucket] - rank[b.bucket] || a.user.name.localeCompare(b.user.name, 'vi')
    return a.user.name.localeCompare(b.user.name, 'vi')
  })
}

export function trackingFilterCounts(rows: TrackingRow[]): Record<TrackingFilter, number> {
  return {
    all: rows.length,
    registered: rows.filter(row => row.bucket !== 'missing').length,
    missing: rows.filter(row => row.bucket === 'missing').length,
    attention: rows.filter(row => row.bucket === 'attention').length,
    device: rows.filter(row => row.registration?.usesElectronicDevice === true).length,
    'no-device': rows.filter(row => row.registration && row.bucket !== 'missing' && row.registration.usesElectronicDevice !== true).length,
  }
}
