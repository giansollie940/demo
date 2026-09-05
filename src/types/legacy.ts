export type UserRole = 'student' | 'monitor' | 'teacher' | 'admin'

export interface CurrentUser {
  id: string
  code: string
  name: string
  role: UserRole
  classId: string | null
  active: boolean
  deletedAt?: string | null
  avatarPath?: string | null
}


export interface SchoolYearRecord {
  id: string
  name: string
  startDate: string
  endDate: string
  active: boolean
}

export interface SchoolClass {
  id: string
  schoolYearId?: string | null
  code: string
  name: string
  active: boolean
}

export interface WeekRecord {
  id: string
  number: number
  startDate: string
  endDate: string
  status?: string
  manualStatus?: 'open' | 'locked' | null
  deadlineMode?: 'per_session_20' | 'specific' | string
  deadline?: string
  note?: string
}

export interface PeriodRecord {
  n: number
  start: string
  end: string
}

export interface TimetableAssignmentSnapshot {
  id:string
  classId:string
  schoolYearId:string
  templateVersionId:string
  effectiveFrom:string
  effectiveTo:string
  active:boolean
}

export interface TimetableVersionPeriodSnapshot {
  versionId:string
  weekday:number
  period:number
  start:string
  end:string
  session:'morning'|'afternoon'|'day'
}

export interface ScheduleSlot {
  dow: number
  period: number
}

export interface ScheduleOverride extends ScheduleSlot {
  id?: string
  classId?: string | null
  weekId: string
  active?: boolean
  reason?: string
}

export interface RegistrationRecord {
  id: string
  classId?: string | null
  studentId: string
  weekId: string
  dow: number
  period: number
  content: string
  note?: string
  status: string
  teacherComment?: string
  usesElectronicDevice?: boolean
  approvalSource?: 'manual' | 'ai' | string
  autoReviewReason?: string
  aiReviewStatus?: string
  aiDecision?: string
  aiCategory?: string
  aiConfidence?: number | null
  aiRevisionStatus?: string
  aiRevisionConfidence?: number | null
  aiReason?: string
  aiModel?: string
  aiReviewedAt?: string | null
  aiReviewCount?: number
  isEmergency?: boolean
  emergencyReason?: string
  emergencyRequestedAt?: string | null
  deviceDetectionSource?: string
  deviceDetectionConfidence?: number | null
  revisionOverdueAt?: string | null
  approvedAt?: number | null
  updatedAt?: number
  [key: string]: unknown
}


export interface DirectoryUser {
  id: string
  code: string
  fullName: string
  role: UserRole
  classId: string | null
  active: boolean
  deletedAt?: string | null
}

export interface TeacherUserChanges {
  changeCode?: boolean
  code: string
  fullName: string
  role: UserRole
  classId?: string | null
  active?: boolean
  password?: string
}

export interface TeacherDirectoryResponse {
  ok?: boolean
  users?: Array<Record<string, unknown>>
  user?: Record<string, unknown>
  password?: string
  [key: string]: unknown
}

export interface EmergencyRegistrationInput {
  weekId: string
  dow: number
  period: number
  content: string
  note?: string
  reason: string
  usesElectronicDevice?: boolean
}

export interface WeekData {
  overrides: ScheduleOverride[]
  registrations: RegistrationRecord[]
}

export interface TeacherNotificationRecord {
  id: string
  registrationId?: string | null
  studentId?: string | null
  weekId?: string | null
  type?: string
  title?: string
  message?: string
  isRead?: boolean
  createdAt?: string | null
  [key: string]: unknown
}

export interface LegacyState {
  version: number
  activeSchoolYearId: string | null
  selectedSchoolYearId: string | null
  availableSchoolYears: SchoolYearRecord[]
  activeClassId: string | null
  availableClasses: SchoolClass[]
  settings: Record<string, unknown> & {
    className?: string
    schoolYear?: string
    teacherName?: string
    announcement?: string
    registrationDeadlineTime?: string
  }
  users: CurrentUser[]
  weeks: WeekRecord[]
  periods: PeriodRecord[]
  timetableAssignments: TimetableAssignmentSnapshot[]
  timetableVersionPeriods: TimetableVersionPeriodSnapshot[]
  schedule: ScheduleSlot[]
  overrides: WeekData['overrides']
  registrations: RegistrationRecord[]
  notifications: TeacherNotificationRecord[]
  currentWeekId: string | null
  [key: string]: unknown
}

export interface LoadStateResult {
  currentUser: CurrentUser | null
  state: LegacyState | null
}

export interface RealtimeChange {
  table?: string
  eventType?: string
  id?: string | null
  deleted?: boolean
  structural?: boolean
  record?: Record<string, unknown>
  [key: string]: unknown
}

export interface LegacySupabaseService {
  enabled(): boolean
  init(): Promise<unknown>
  signInCode(code: string, password: string): Promise<unknown>
  signOut(): Promise<void>
  loadState(preferredClassId?: string | null, preferredSchoolYearId?: string | null): Promise<LoadStateResult>
  loadWeekData(weekId: string, classId?: string | null): Promise<WeekData>
  syncState(state: LegacyState, currentUser: CurrentUser): Promise<void>
  teacherRebaseWeeks(firstWeekStart: string, deadlineTime?: string, schoolYearId?: string | null): Promise<unknown>
  changeOwnPassword(currentPassword: string, newPassword: string): Promise<unknown>
  downloadAvatar(path: string): Promise<Blob | null>
  uploadOwnAvatar(blob: Blob): Promise<{ avatarPath: string }>
  deleteOwnAvatar(): Promise<{ avatarPath: null }>
  teacherResetPassword(userId: string, newPassword: string): Promise<unknown>
  teacherUpdateUser(userId: string, changes: TeacherUserChanges): Promise<unknown>
  teacherDeleteUser(userId: string, confirmCode: string): Promise<unknown>
  adminHardDeleteUser(userId: string, confirmCode: string, confirmPhrase: string): Promise<unknown>
  adminListAudit(filters?: Record<string, unknown>): Promise<{ok:true;contract?:string;contractVersion?:number;logs:Array<Record<string, unknown>>;limit?:number}>
  teacherCreateUser(changes: TeacherUserChanges): Promise<TeacherDirectoryResponse>
  teacherListUsers(classId?: string | null): Promise<TeacherDirectoryResponse>
  adminManageClasses(action: string, payload?: Record<string, unknown>): Promise<Record<string, unknown>>
  requestRegistrationRevision(registrationId: string, teacherComment: string): Promise<boolean>
  rejectOverdueRegistration(registrationId: string, teacherComment: string): Promise<boolean>
  emergencyRegister(input: EmergencyRegistrationInput): Promise<RegistrationRecord | null>
  requestAiReview(registrationId: string): Promise<unknown>
  prepareSessionAiRereview(input: { classId: string; weekId: string; dow: number; period: number }): Promise<string[]>
  prepareRegistrationAiRereview(registrationId: string): Promise<boolean>
  deleteRegistration(registrationId: string): Promise<boolean>
  markNotificationsRead(ids: string[]): Promise<void>
  resetSnapshot(state: LegacyState): void
  setActiveClassId(userId: string, classId: string): void
  getDailyQuote(): Promise<unknown>
  subscribeRealtime(
    onChange: (change: RealtimeChange) => void,
    onStatus?: (status: string, error?: unknown) => void,
  ): Promise<unknown> | unknown
  unsubscribeRealtime(): Promise<void> | void
}
