import type { CurrentUser, LegacyState, RegistrationRecord } from '../../types/legacy'

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

function currentWeekRegistrations(state: LegacyState): RegistrationRecord[] {
  return state.registrations.filter(row => row.weekId === state.currentWeekId && row.isDeleted !== true)
}
function learnerCount(state: LegacyState): number { return state.users.filter(user => user.active !== false && ['student','monitor'].includes(user.role)).length }
function mine(state: LegacyState, user: CurrentUser): RegistrationRecord[] { return currentWeekRegistrations(state).filter(row => row.studentId === user.id) }
function routeName(path: string): string { return path.replace(/^\//, '') || 'dashboard' }

export function buildOwlContextMessages({ state, user, path }: { state: LegacyState; user: CurrentUser; path: string }): OwlMessage[] {
  const route = routeName(path)
  const week = state.weeks.find(item => item.id === state.currentWeekId)
  const weekLabel = week ? `Tuần ${week.number}` : 'tuần đang xem'
  const manager = ['teacher','admin'].includes(user.role)
  const messages: OwlMessage[] = []
  if (manager) {
    const waiting = currentWeekRegistrations(state).filter(row => row.status === 'submitted' || row.aiReviewStatus === 'error').length
    const unread = (Array.isArray(state.notifications) ? state.notifications : []).filter(item => !(item as {isRead?:boolean})?.isRead).length
    if (waiting) messages.push({ kind:'urgent', urgent:true, text:`${weekLabel} còn ${waiting} đăng ký cần giáo viên xử lý.` })
    if (unread) messages.push({ kind:'urgent', urgent:true, text:`Bạn có ${unread} thông báo chưa đọc.` })
    if (route === 'students') messages.push({ kind:'page', text:`Lớp hiện có ${learnerCount(state)} học sinh/cán sự đang hoạt động.` })
    else if (route === 'review') messages.push({ kind:'page', text: waiting ? `Mở từng đăng ký để xem lý do AI và phản hồi học sinh.` : `Danh sách duyệt của ${weekLabel} hiện đã gọn.` })
    else if (route === 'tracking') messages.push({ kind:'page', text:`Theo dõi từng buổi bằng bộ lọc để tìm nhanh học sinh chưa đăng ký hoặc cần xử lý.` })
    else if (route === 'weeks') messages.push({ kind:'page', text:`Bạn đang quản lý ${weekLabel}. Tuần kế tiếp được mở sớm để học sinh đăng ký trước.` })
    else if (route === 'schedule') messages.push({ kind:'page', text:`Thời khóa biểu hiện có ${state.schedule.length} tiết mặc định; tuần có lịch riêng sẽ dùng override.` })
    else if (route === 'statistics') messages.push({ kind:'page', text:`Thống kê đang so sánh đăng ký hợp lệ, cần xử lý và chưa đăng ký theo tuần.` })
    else if (route === 'admin' && user.role === 'admin') messages.push({ kind:'page', text:`Quản trị lớp, giáo viên và phân quyền vẫn dùng các Edge Function hiện có.` })
    else if (route === 'settings') messages.push({ kind:'page', text:`Cài đặt chỉ được lưu khi bạn bấm “Lưu cài đặt”.` })
    else messages.push({ kind:'page', text:`Dashboard ${weekLabel}: ${learnerCount(state)} học sinh/cán sự hoạt động.` })
  } else {
    const own = mine(state, user)
    const needs = own.filter(row => row.status === 'needs_revision').length
    const submitted = own.filter(row => row.status === 'submitted').length
    if (needs) messages.push({ kind:'urgent', urgent:true, text:`Bạn có ${needs} đăng ký được giáo viên yêu cầu chỉnh sửa.` })
    if (route === 'register' || route === 'dashboard') messages.push({ kind:'page', text: submitted ? `${weekLabel}: ${submitted} đăng ký của bạn đang chờ duyệt.` : `${weekLabel}: hãy hoàn thiện nội dung trước deadline từng buổi.` })
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
