import type { CurrentUser, LegacyState, RegistrationRecord } from '../../types/legacy'
import { isRegistrationIssue, isRevisionOverdue, isTeacherQueueItem, needsTeacherAction, sessionStartMs } from '../registrations/registration-model'
import { effectiveScheduleForWeek } from '../schedule/schedule-model'

export interface OwlQuote { id?: string; text: string; author: string; url?: string }
export interface OwlMessage { kind: 'urgent' | 'page' | 'tip' | 'quote'; text: string; urgent?: boolean; quote?: OwlQuote }

export const OWL_QUOTES: OwlQuote[] = [
  { text: 'Hãy xây dựng niềm đam mê học tập. Nếu bạn làm được, bạn sẽ không ngừng tiến bộ.', author: "Anthony J. D'Angelo" },
  { text: 'Học từ ngày hôm qua, sống ngày hôm nay, hi vọng cho ngày mai. Điều quan trọng nhất là không ngừng đặt câu hỏi.', author: 'Albert Einstein' },
  { text: 'Trong cách học, phải lấy tự học làm cốt.', author: 'Hồ Chí Minh' },
  { text: 'Đầu tư vào tri thức đem lại lợi nhuận cao nhất.', author: 'Benjamin Franklin' },
  { text: 'Sự tò mò là ngọn bấc trong cây nến học hỏi.', author: 'William Arthur Ward' },
  { text: 'Lạc thú lớn nhất trong mọi lạc thú là học hỏi.', author: 'Aristotle' },
  { text: 'Qua tìm kiếm và vấp váp mà chúng ta học hỏi.', author: 'Johann Wolfgang von Goethe' },
  { text: 'Học hỏi trong tuổi trẻ sẽ đánh đuổi cái không tốt của tuổi già.', author: 'Leonardo da Vinci' },
]

function quoteKey(quote: OwlQuote): string { return String(quote.id || quote.text).trim().toLocaleLowerCase('vi') }
function normalizeQuotes(items: OwlQuote[]): OwlQuote[] {
  const seen = new Set<string>()
  return items.flatMap(item => {
    const text = String(item?.text || '').trim()
    if (!text) return []
    const quote = { ...item, text, author: String(item.author || 'Khuyết danh').trim() || 'Khuyết danh' }
    const key = quoteKey(quote)
    if (seen.has(key)) return []
    seen.add(key)
    return [quote]
  })
}

export function createQuoteRotator(baseQuotes: OwlQuote[] = OWL_QUOTES, { recentLimit = 4 } = {}) {
  const base = normalizeQuotes(baseQuotes)
  let cursor = 0
  let recent: string[] = []
  function next(extraQuotes: OwlQuote[] = []): OwlQuote {
    const pool = normalizeQuotes([...extraQuotes, ...base])
    if (!pool.length) return { text: 'Mỗi ngày học một điều mới là một bước tiến.', author: 'Cú Thông Thái' }
    const maxRecent = Math.min(Math.max(0, Number(recentLimit) || 0), Math.max(0, pool.length - 1))
    const blocked = new Set(recent.slice(-maxRecent))
    let selectedIndex = -1
    for (let offset = 0; offset < pool.length; offset += 1) {
      const index = (cursor + offset) % pool.length
      if (!blocked.has(quoteKey(pool[index]))) { selectedIndex = index; break }
    }
    if (selectedIndex < 0) selectedIndex = cursor % pool.length
    const selected = pool[selectedIndex]
    cursor = (selectedIndex + 1) % pool.length
    recent = [...recent, quoteKey(selected)].slice(-maxRecent)
    return selected
  }
  function reset() { cursor = 0; recent = [] }
  return { next, reset }
}

function weekRegistrations(state: LegacyState, weekId: string | null | undefined): RegistrationRecord[] {
  const targetWeekId = weekId || state.currentWeekId
  return state.registrations.filter(row => row.weekId === targetWeekId && row.isDeleted !== true)
}
function learnerCount(state: LegacyState): number { return state.users.filter(user => user.active !== false && ['student','monitor'].includes(user.role)).length }
function mine(state: LegacyState, user: CurrentUser, weekId: string | null | undefined): RegistrationRecord[] { return weekRegistrations(state, weekId).filter(row => row.studentId === user.id) }
function routeName(path: string): string { return path.replace(/^\//, '') || 'dashboard' }
function overdue(row: RegistrationRecord, state: LegacyState, nowMs: number): boolean {
  const week = state.weeks.find(item => item.id === row.weekId)
  if (!week) return Boolean(row.revisionOverdueAt)
  return isRevisionOverdue(row, { week, periods: state.periods, nowMs })
}
/**
 * Cả hai loại của mục Báo cáo lỗi: HS không sửa kịp, và GV/AI không duyệt kịp
 * trước giờ buổi tự học bắt đầu.
 */
function reported(row: RegistrationRecord, state: LegacyState, nowMs: number): boolean {
  const week = state.weeks.find(item => item.id === row.weekId)
  if (!week) return Boolean(row.revisionOverdueAt)
  return isRegistrationIssue(row, { week, periods: state.periods, nowMs })
}
/**
 * Cú chỉ được nhắc những việc GV còn bấm được nút. Đăng ký đã sang Báo cáo lỗi
 * vì buổi học bắt đầu mất rồi thì duyệt cũng vô nghĩa; đếm nó vào lời nhắc thì
 * chấm đỏ không bao giờ tắt và GV không có cách nào làm nó tắt.
 */
function pendingForTeacher(row: RegistrationRecord, state: LegacyState, nowMs: number): boolean {
  const week = state.weeks.find(item => item.id === row.weekId)
  if (!week) return needsTeacherAction(row)
  return isTeacherQueueItem(row, { week, periods: state.periods, nowMs })
}

function slotKey(dow: number, period: number): string { return `${Number(dow)}-${Number(period)}` }
function activeLearners(state: LegacyState): CurrentUser[] {
  return state.users.filter(candidate => candidate.active !== false && ['student','monitor'].includes(candidate.role))
}
function dayLabel(dow: number): string { return `Thứ ${Number(dow) + 2}` }
function minutesUntil(startMs: number, nowMs: number): number { return Math.max(1, Math.ceil((startMs - nowMs) / 60_000)) }

function learnerScheduleMessages({ state, user, weekId, nowMs }: { state: LegacyState; user: CurrentUser; weekId: string | null | undefined; nowMs: number }): OwlMessage[] {
  const targetWeekId = weekId || state.currentWeekId
  const week = state.weeks.find(item => item.id === targetWeekId)
  if (!targetWeekId || !week) return []
  const schedule = effectiveScheduleForWeek(state, targetWeekId)
  const own = mine(state, user, targetWeekId)
  const ownBySlot = new Map(own.map(row => [slotKey(row.dow, row.period), row]))
  const future = schedule
    .map(slot => ({ ...slot, startMs: sessionStartMs({ week, dow: slot.dow, period: slot.period, periods: state.periods }) }))
    .filter(slot => Number.isFinite(slot.startMs) && slot.startMs > nowMs)
    .sort((a, b) => a.startMs - b.startMs)
  const messages: OwlMessage[] = []
  const missing = future.filter(slot => !ownBySlot.has(slotKey(slot.dow, slot.period)))
  if (missing.length) {
    const soonest = missing[0]
    const within24Hours = soonest.startMs - nowMs <= 24 * 60 * 60 * 1000
    messages.push({
      kind: within24Hours ? 'urgent' : 'page',
      urgent: within24Hours || undefined,
      text: within24Hours
        ? `Bạn còn ${missing.length} buổi tự học chưa đăng ký; buổi gần nhất ${dayLabel(soonest.dow)} · Tiết ${soonest.period} sẽ bắt đầu trong khoảng ${minutesUntil(soonest.startMs, nowMs)} phút.`
        : `Bạn còn ${missing.length} buổi tự học chưa đăng ký trong Tuần ${week.number}.`,
    })
  }
  const nextRegistered = future.find(slot => ownBySlot.has(slotKey(slot.dow, slot.period)))
  if (nextRegistered && nextRegistered.startMs - nowMs <= 60 * 60 * 1000) {
    messages.push({ kind:'urgent', urgent:true, text:`Buổi tự học ${dayLabel(nextRegistered.dow)} · Tiết ${nextRegistered.period} sắp bắt đầu sau khoảng ${minutesUntil(nextRegistered.startMs, nowMs)} phút.` })
  }
  return messages
}

function monitorClassSupportMessages({ state, weekId, nowMs }: { state: LegacyState; weekId: string | null | undefined; nowMs: number }): OwlMessage[] {
  const targetWeekId = weekId || state.currentWeekId
  const week = state.weeks.find(item => item.id === targetWeekId)
  if (!targetWeekId || !week) return []
  const learners = activeLearners(state)
  const registrations = weekRegistrations(state, targetWeekId)
  const byLearnerAndSlot = new Map(registrations.map(row => [`${row.studentId}:${slotKey(row.dow, row.period)}`, row]))
  const future = effectiveScheduleForWeek(state, targetWeekId)
    .map(slot => ({ ...slot, startMs: sessionStartMs({ week, dow: slot.dow, period: slot.period, periods: state.periods }) }))
    .filter(slot => Number.isFinite(slot.startMs) && slot.startMs > nowMs)
    .sort((a, b) => a.startMs - b.startMs)
  const missingStudents = new Set<string>()
  for (const learner of learners) {
    if (future.some(slot => !byLearnerAndSlot.has(`${learner.id}:${slotKey(slot.dow, slot.period)}`))) missingStudents.add(learner.id)
  }
  const revisionStudents = new Set(registrations
    .filter(row => row.status === 'needs_revision' && !overdue(row, state, nowMs))
    .map(row => row.studentId))
  const messages: OwlMessage[] = []
  if (missingStudents.size) messages.push({ kind:'page', text:`Lớp còn ${missingStudents.size} học sinh/cán sự chưa đăng ký đủ các buổi tự học sắp tới.` })
  if (revisionStudents.size) messages.push({ kind:'page', text:`Lớp có ${revisionStudents.size} học sinh/cán sự cần chỉnh sửa đăng ký.` })
  const next = future[0]
  if (next && next.startMs - nowMs <= 60 * 60 * 1000) {
    const incomplete = learners.filter(learner => {
      const row = byLearnerAndSlot.get(`${learner.id}:${slotKey(next.dow, next.period)}`)
      return !row || row.status !== 'approved'
    }).length
    if (incomplete) messages.push({ kind:'urgent', urgent:true, text:`Lớp còn ${incomplete} học sinh/cán sự chưa hoàn tất đăng ký cho buổi tự học ${dayLabel(next.dow)} · Tiết ${next.period} sắp bắt đầu.` })
  }
  return messages
}

export function buildOwlContextMessages({ state, user, path, weekId = state.currentWeekId, nowMs = Date.now() }: { state: LegacyState; user: CurrentUser; path: string; weekId?: string | null; nowMs?: number }): OwlMessage[] {
  const route = routeName(path)
  const week = state.weeks.find(item => item.id === weekId) ?? state.weeks.find(item => item.id === state.currentWeekId)
  const weekLabel = week ? `Tuần ${week.number}` : 'tuần đang xem'
  const manager = ['teacher','admin'].includes(user.role)
  const messages: OwlMessage[] = []
  if (manager) {
    const current = weekRegistrations(state, weekId)
    const unresolved = current.filter(row => pendingForTeacher(row, state, nowMs))
    const waiting = unresolved.length
    // The red dot represents actionable work, never a generic unread-notification count.
    // This prevents an already-approved registration from keeping the owl in alert state
    // when a stale or late notification event is still present locally.
    if (waiting) messages.push({ kind:'urgent', urgent:true, text:`${weekLabel} còn ${waiting} đăng ký cần giáo viên xử lý.` })
    if (route === 'students') messages.push({ kind:'page', text:`Lớp hiện có ${learnerCount(state)} học sinh/cán sự đang hoạt động.` })
    else if (route === 'review') messages.push({ kind:'page', text: waiting ? `Mở từng đăng ký để xem lý do AI và phản hồi học sinh.` : `Danh sách duyệt của ${weekLabel} hiện đã gọn.` })
    else if (route === 'tracking') messages.push({ kind:'page', text:`Theo dõi từng buổi bằng bộ lọc để tìm nhanh học sinh chưa đăng ký hoặc cần xử lý.` })
    else if (route === 'issues') messages.push({ kind:'page', text:`Báo cáo lỗi giữ hai loại đã quá giờ bắt đầu tiết: học sinh chưa sửa kịp, và đăng ký không được duyệt kịp. Cả hai đều không còn nằm trong hàng chờ giáo viên.` })
    else if (route === 'weeks') messages.push({ kind:'page', text:`Bạn đang quản lý ${weekLabel}. Tuần kế tiếp được mở sớm để học sinh đăng ký trước.` })
    else if (route === 'schedule') messages.push({ kind:'page', text:`Thời khóa biểu hiện có ${state.schedule.length} tiết mặc định; tuần có lịch riêng sẽ dùng override.` })
    else if (route === 'statistics') messages.push({ kind:'page', text:`Thống kê đang so sánh đăng ký hợp lệ, cần xử lý và chưa đăng ký theo tuần.` })
    else if (route === 'admin' && user.role === 'admin') messages.push({ kind:'page', text:`Quản trị lớp, giáo viên và phân quyền vẫn dùng các Edge Function hiện có.` })
    else if (route === 'settings') messages.push({ kind:'page', text:`Cài đặt chỉ được lưu khi bạn bấm “Lưu cài đặt”.` })
    else messages.push({ kind:'page', text:`Dashboard ${weekLabel}: ${learnerCount(state)} học sinh/cán sự hoạt động.` })
  } else {
    const own = mine(state, user, weekId)
    messages.push(...learnerScheduleMessages({ state, user, weekId, nowMs }))
    if (user.role === 'monitor') messages.push(...monitorClassSupportMessages({ state, weekId, nowMs }))
    const needs = own.filter(row => row.status === 'needs_revision' && !overdue(row, state, nowMs)).length
    // Đăng ký "không duyệt" đã hết đường chờ duyệt, nên không được đếm là
    // "đang chờ duyệt" nữa — nếu không HS sẽ ngồi đợi một kết quả không tới.
    // Tách hai loại: HS không sửa kịp là việc của HS, còn không được duyệt kịp
    // thì HS đã nộp đúng hạn — không được nói như thể HS làm sai.
    const lateRevision = own.filter(row => overdue(row, state, nowMs)).length
    const notApproved = own.filter(row => reported(row, state, nowMs) && !overdue(row, state, nowMs)).length
    const issues = lateRevision + notApproved
    const submitted = own.filter(row => row.status === 'submitted' && !reported(row, state, nowMs)).length
    if (needs) messages.push({ kind:'urgent', urgent:true, text:`Bạn có ${needs} đăng ký được giáo viên hoặc AI yêu cầu chỉnh sửa.` })
    if (lateRevision) messages.push({ kind:'page', text:`Bạn có ${lateRevision} đăng ký đã chuyển sang Báo cáo lỗi vì chưa sửa trước giờ bắt đầu tiết.` })
    if (notApproved) messages.push({ kind:'page', text:`Bạn có ${notApproved} đăng ký không được duyệt kịp trước giờ bắt đầu tiết. Bạn đã nộp đúng hạn nên đây không phải lỗi của bạn.` })
    if (route === 'register' || route === 'dashboard') messages.push({ kind:'page', text: submitted ? `${weekLabel}: ${submitted} đăng ký của bạn đang chờ duyệt.` : `${weekLabel}: hãy hoàn thiện nội dung trước deadline từng buổi.` })
    else if (route === 'issues') messages.push({ kind:'page', text: issues ? `Mở từng mục để xem đăng ký quá hạn sửa và đăng ký không được duyệt kịp.` : `${weekLabel} chưa có Báo cáo lỗi.` })
    else if (route === 'history') messages.push({ kind:'page', text:`Lịch sử của bạn có ${state.registrations.filter(row=>row.studentId===user.id).length} lượt đăng ký.` })
    else if (route === 'comments') messages.push({ kind:'page', text:`Bạn có ${state.registrations.filter(row=>row.studentId===user.id&&row.teacherComment).length} đăng ký từng nhận phản hồi giáo viên.` })
  }
  messages.push({ kind:'tip', text:'Mẹo: tập trung một mục tiêu rõ ràng cho mỗi buổi tự học sẽ giúp việc phản hồi nhanh hơn.' })
  const order: Record<OwlMessage['kind'],number> = { urgent:0, page:1, tip:2, quote:3 }
  return messages.sort((a,b)=>order[a.kind]-order[b.kind])
}

export function messageFromQuote(quote: OwlQuote): OwlMessage {
  return { kind:'quote', text:`${quote.text} — ${quote.author}`, quote }
}
