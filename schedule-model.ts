import type {
  LegacyState,
  PeriodRecord,
  ScheduleOverride,
  ScheduleSlot,
} from '../../types/legacy'

function slotKey(slot: ScheduleSlot): string {
  return `${slot.dow}-${slot.period}`
}

function canonicalSlots(slots: ScheduleSlot[]): ScheduleSlot[] {
  const unique = new Map<string, ScheduleSlot>()
  for (const slot of slots) {
    const normalized = { dow: Number(slot.dow), period: Number(slot.period) }
    unique.set(slotKey(normalized), normalized)
  }
  return [...unique.values()].sort((a, b) => a.dow - b.dow || a.period - b.period)
}

export function normalizeScheduleSlots(
  slots: ScheduleSlot[],
  periods: PeriodRecord[],
): ScheduleSlot[] {
  if (!slots.length) throw new Error('Thời khóa biểu phải có ít nhất một tiết.')

  const periodNumbers = new Set(periods.map(period => Number(period.n)))
  const normalized = slots.map(slot => {
    const dow = Number(slot.dow)
    const period = Number(slot.period)
    if (!Number.isInteger(dow) || dow < 0 || dow > 4) {
      throw new Error('Ngày học không hợp lệ.')
    }
    if (!Number.isInteger(period) || !periodNumbers.has(period)) {
      throw new Error('Tiết học không tồn tại.')
    }
    return { dow, period }
  })

  return canonicalSlots(normalized)
}

export function effectiveScheduleForWeek(state: LegacyState, weekId: string): ScheduleSlot[] {
  const overrides = state.overrides.filter(row => row.weekId === weekId)
  if (!overrides.length) return canonicalSlots(state.schedule)
  return canonicalSlots(
    overrides
      .filter(row => row.active !== false)
      .map(row => ({ dow: row.dow, period: row.period })),
  )
}

export function createWeekScheduleDraft(state: LegacyState, weekId: string): ScheduleSlot[] {
  return structuredClone(effectiveScheduleForWeek(state, weekId))
}

export function applyDefaultSchedule(state: LegacyState, slots: ScheduleSlot[]): LegacyState {
  const next = structuredClone(state)
  next.schedule = normalizeScheduleSlots(slots, state.periods)
  return next
}

export function applyWeekSchedule(
  state: LegacyState,
  classId: string,
  weekId: string,
  slots: ScheduleSlot[],
): LegacyState {
  const normalized = normalizeScheduleSlots(slots, state.periods)
  const next = structuredClone(state)
  const rows: ScheduleOverride[] = normalized.map(slot => ({
    classId,
    weekId,
    dow: slot.dow,
    period: slot.period,
    active: true,
  }))
  next.overrides = [
    ...next.overrides.filter(row => row.weekId !== weekId),
    ...rows,
  ]
  return next
}

export function resetWeekSchedule(state: LegacyState, weekId: string): LegacyState {
  const next = structuredClone(state)
  next.overrides = next.overrides.filter(row => row.weekId !== weekId)
  return next
}

export function diffSchedule(
  base: ScheduleSlot[],
  candidate: ScheduleSlot[],
): { added: ScheduleSlot[]; removed: ScheduleSlot[] } {
  const normalizedBase = canonicalSlots(base)
  const normalizedCandidate = canonicalSlots(candidate)
  const baseKeys = new Set(normalizedBase.map(slotKey))
  const candidateKeys = new Set(normalizedCandidate.map(slotKey))
  return {
    added: normalizedCandidate.filter(slot => !baseKeys.has(slotKey(slot))),
    removed: normalizedBase.filter(slot => !candidateKeys.has(slotKey(slot))),
  }
}
