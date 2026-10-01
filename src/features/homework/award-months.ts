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
