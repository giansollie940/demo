/**
 * Góc tuyên dương theo tháng. Tháng là chuỗi 'YYYY-MM' theo giờ Việt Nam; '' = cả năm học.
 * Danh sách tháng hợp lệ do máy chủ trả về (award_months), từ tháng đầu năm học tới tháng hiện tại.
 */
export const AWARD_TIME_ZONE = 'Asia/Ho_Chi_Minh'

export function currentAwardMonth(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: AWARD_TIME_ZONE, year: 'numeric', month: '2-digit' }).formatToParts(now)
  const year = parts.find(p => p.type === 'year')?.value ?? String(now.getUTCFullYear())
  const month = parts.find(p => p.type === 'month')?.value ?? String(now.getUTCMonth() + 1).padStart(2, '0')
  return `${year}-${month}`
}

export function awardMonthLabel(month: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(month)
  return match ? `Tháng ${Number(match[2])}/${match[1]}` : 'Toàn năm học'
}

/** Newest month first; the selected month is always offered, even if the server did not list it. */
export function awardMonthOptions(serverMonths: readonly string[] | undefined, selected: string): string[] {
  const months = new Set((serverMonths ?? []).filter(m => /^\d{4}-(0[1-9]|1[0-2])$/.test(m)))
  if (selected) months.add(selected)
  return [...months].sort().reverse()
}

// ===== Kỳ xem tuyên dương: tháng, tuần hoặc cả năm học =====
export type AwardMode = 'month' | 'week' | 'year'
export interface AwardPeriod { mode: AwardMode; month: string; week: string }
export interface AwardWeekOption { id: string; label: string }

export function defaultAwardPeriod(now: Date = new Date()): AwardPeriod {
  return { mode: 'month', month: currentAwardMonth(now), week: '' }
}

/** What `load` gets: one month, one week, or nothing (= the whole school year). */
export function awardPayload(period: AwardPeriod): { month?: string; week_id?: string } {
  if (period.mode === 'month' && period.month) return { month: period.month }
  if (period.mode === 'week' && period.week) return { week_id: period.week }
  return {}
}

/** "Tuần 9 (28/9–4/10)" when the dates are known, otherwise "Tuần 9". */
export function awardWeekLabel(number: number, start?: string | null, end?: string | null): string {
  const day = (iso?: string | null) => {
    const m = /^\d{4}-(\d{2})-(\d{2})/.exec(iso ?? '')
    return m ? `${Number(m[2])}/${Number(m[1])}` : ''
  }
  const range = day(start) && day(end) ? ` (${day(start)}–${day(end)})` : ''
  return `Tuần ${number}${range}`
}

export function awardPeriodLabel(period: AwardPeriod, weeks: readonly AwardWeekOption[] = []): string {
  if (period.mode === 'month' && period.month) return awardMonthLabel(period.month).toLowerCase()
  if (period.mode === 'week' && period.week) return (weeks.find(w => w.id === period.week)?.label ?? 'tuần đã chọn').toLowerCase()
  return 'trong năm học'
}
