import type { RegistrationRecord } from '../../types/legacy'

export type DeviceSlotState = 'open' | 'locked' | 'allow_override'

/**
 * One row of `device_use_policy('state', …)`. `weekday` is the database's 1–5.
 *
 * Students receive only the first four fields: the rest name who pressed which
 * button, which is a teacher's business. So everything below `session_start` is
 * optional here, and nothing a student sees may depend on it.
 */
export interface DevicePolicySlot {
  weekday: number
  period_number: number
  state: DeviceSlotState
  session_start: string | null
  /**
   * Whether the recurring slot is locked **right now**, as opposed to `state`,
   * which answers what the policy was for the selected week's session. The two
   * differ for a past week that sat inside an interval since released — and
   * that difference is what the Lock/Unlock button has to follow.
   */
  current_recurring_state?: DeviceSlotState
  locked_at?: string | null
  override_id?: string | null
}

export type DevicePolicyMap = Map<string, DevicePolicySlot>

/** The app counts days from 0 (Thứ 2); the database counts from 1. */
export const slotKey = (dow: number, period: number) => `${dow}:${period}`

export function devicePolicyMap(rows: DevicePolicySlot[] | null | undefined): DevicePolicyMap {
  const map: DevicePolicyMap = new Map()
  for (const row of rows ?? []) map.set(slotKey(Number(row.weekday) - 1, Number(row.period_number)), row)
  return map
}

/**
 * A slot the policy said nothing about is open. That matters on the read side:
 * the state call only returns slots on the class timetable, and a session the
 * timetable does not know about cannot be locked either (BR-010-003).
 */
export function deviceSlotState(map: DevicePolicyMap | null | undefined, dow: number, period: number): DeviceSlotState {
  return map?.get(slotKey(dow, period))?.state ?? 'open'
}

export const deviceChoiceDisabled = (state: DeviceSlotState) => state === 'locked'

export function deviceSlotNotice(state: DeviceSlotState): string {
  if (state === 'locked') return 'Buổi này tạm thời không cho đăng ký sử dụng thiết bị điện tử.'
  if (state === 'allow_override') return 'Buổi này được giáo viên mở riêng việc đăng ký thiết bị điện tử.'
  return ''
}

/**
 * What every screen shows in place of a bare yes/no.
 *
 * BR-010-010 is specific: during a lock a registration must not read as "Có
 * thiết bị" merely because the student asked for one earlier. But it must not
 * read as a plain "Không" either, or the student cannot tell the difference
 * between a choice they made and a rule they are under. So the three cases are
 * three different sentences, and they are derived from the two columns the row
 * already carries — no extra call, and no screen can drift from another.
 */
export type DeviceDisplayTone = 'yes' | 'no' | 'locked'
export interface DeviceDisplay { tone: DeviceDisplayTone; label: string; short: string }

export function deviceDisplay(registration: RegistrationRecord | null | undefined): DeviceDisplay {
  if (!registration) return { tone: 'no', label: 'Chưa có đăng ký', short: 'Chưa có đăng ký' }
  if (registration.effectiveUsesElectronicDevice === true)
    return { tone: 'yes', label: 'Có đăng ký sử dụng', short: 'Có đăng ký' }
  if (registration.usesElectronicDevice === true)
    return { tone: 'locked', label: 'Không — buổi này đang bị khóa thiết bị', short: 'Đang bị khóa' }
  return { tone: 'no', label: 'Không đăng ký', short: 'Không đăng ký' }
}

/**
 * The one place that decides whether a registration counts as "has a device".
 *
 * `uses_electronic_device` is what the student asked for and
 * `effective_uses_electronic_device` is what the policy allowed, so a screen
 * that counts the first is counting requests, not devices in the room. Older
 * rows written before FEAT-010 have the two in agreement; the fallback keeps a
 * cached page from reading every session as device-free before the new column
 * arrives.
 */
export function usesDevice(registration: RegistrationRecord | null | undefined): boolean {
  if (!registration) return false
  if (registration.effectiveUsesElectronicDevice === undefined) return registration.usesElectronicDevice === true
  return registration.effectiveUsesElectronicDevice === true
}

/** One row of the teacher's slot list, ready to render. */
export interface DeviceSlotRow {
  dow: number
  period: number
  state: DeviceSlotState
  sessionStart: number | null
  lockedAt: number | null
  overrideId: string | null
  started: boolean
  canAllow: boolean
  canRevoke: boolean
  /** Is there an open interval on this slot now? Drives Lock vs Unlock. */
  recurringLocked: boolean
}

const ms = (value: string | null) => (value ? new Date(value).getTime() : null)

/**
 * Lock and Unlock are "from now on", so they stay available whatever this
 * week's session has done — locking on Friday is how you reach next Wednesday.
 * Opening or closing *one* session is the opposite: it is about a session that
 * has not happened yet, and BR-010-007 forbids reaching back. Hiding those two
 * buttons once the session has started is the UI half of that; the RPC refuses
 * it as well, because a disabled button is not a rule.
 */
export function deviceSlotRows(rows: DevicePolicySlot[] | null | undefined, nowMs: number): DeviceSlotRow[] {
  return (rows ?? [])
    .map(row => {
      const sessionStart = ms(row.session_start)
      const started = sessionStart !== null && sessionStart <= nowMs
      return {
        dow: Number(row.weekday) - 1,
        period: Number(row.period_number),
        state: row.state,
        sessionStart,
        lockedAt: ms(row.locked_at ?? null),
        overrideId: row.override_id ?? null,
        // Falling back to `state` would reintroduce the bug this field exists to
        // fix, so the fallback is the safe direction instead: with no answer
        // from the server, offer Lock rather than a no-op Unlock.
        recurringLocked: row.current_recurring_state === 'locked',
        started,
        canAllow: row.state === 'locked' && !started,
        canRevoke: row.state === 'allow_override' && !started,
      }
    })
    .sort((a, b) => a.dow - b.dow || a.period - b.period)
}

// ---------------------------------------------------------------------------
// Policy history — Sol RC3 R-001
//
// FINAL §8 promises the Teacher can "xem lịch sử lock/unlock/override" and the
// Admin can "xem trạng thái/audit". RC3 had the backend for both and no screen
// for either, which is not a permission a user has.
// ---------------------------------------------------------------------------

export interface DevicePolicyIntervalRow {
  id: string
  weekday: number
  period_number: number
  locked_at: string
  locked_by: string | null
  unlocked_at: string | null
  unlocked_by: string | null
}

export interface DevicePolicyOverrideRow {
  id: string
  interval_id: string
  week_id: string
  weekday: number
  period_number: number
  created_at: string
  created_by: string | null
  revoked_at: string | null
  revoked_by: string | null
}

export interface DevicePolicyHistoryPayload {
  intervals?: DevicePolicyIntervalRow[] | null
  overrides?: DevicePolicyOverrideRow[] | null
}

export type DeviceHistoryKind = 'lock' | 'unlock' | 'allow' | 'revoke_allow'

export interface DeviceHistoryEvent {
  kind: DeviceHistoryKind
  at: number
  dow: number
  period: number
  weekId: string | null
  actorId: string | null
}

/**
 * Flatten the two history tables into one timeline, newest first.
 *
 * Two tables, four events: an interval contributes a lock and — only if it has
 * been closed — an unlock; an override contributes an allow and, if revoked, a
 * revoke. An open interval must not produce a phantom unlock, which is the one
 * thing a naive `[locked_at, unlocked_at]` mapping gets wrong.
 */
export function deviceHistoryEvents(payload: DevicePolicyHistoryPayload | null | undefined): DeviceHistoryEvent[] {
  const events: DeviceHistoryEvent[] = []
  const at = (value: string) => new Date(value).getTime()

  for (const row of payload?.intervals ?? []) {
    const slot = { dow: Number(row.weekday) - 1, period: Number(row.period_number), weekId: null }
    events.push({ kind: 'lock', at: at(row.locked_at), actorId: row.locked_by ?? null, ...slot })
    if (row.unlocked_at) {
      events.push({ kind: 'unlock', at: at(row.unlocked_at), actorId: row.unlocked_by ?? null, ...slot })
    }
  }
  for (const row of payload?.overrides ?? []) {
    const slot = { dow: Number(row.weekday) - 1, period: Number(row.period_number), weekId: row.week_id }
    events.push({ kind: 'allow', at: at(row.created_at), actorId: row.created_by ?? null, ...slot })
    if (row.revoked_at) {
      events.push({ kind: 'revoke_allow', at: at(row.revoked_at), actorId: row.revoked_by ?? null, ...slot })
    }
  }
  return events.sort((a, b) => b.at - a.at)
}

export const DEVICE_HISTORY_LABEL: Record<DeviceHistoryKind, string> = {
  lock: 'Khóa',
  unlock: 'Mở khóa',
  allow: 'Mở riêng một buổi',
  revoke_allow: 'Hủy mở riêng',
}

const DAYS = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6']
export const deviceSlotLabel = (dow: number, period: number) =>
  `${DAYS[dow] ?? `Ngày ${dow + 1}`} · Tiết ${period}`
