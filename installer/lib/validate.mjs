// Input checks shared by the setup page and the setup API. Messages are shown to the user as is.

/** https://<ref>.supabase.co → ref (20 lowercase letters), or null. */
export function projectRefFromUrl(url) {
  const m = /^https:\/\/([a-z]{20})\.supabase\.co\/?$/.exec(String(url || '').trim())
  return m ? m[1] : null
}

export function checkAccessToken(raw) {
  const token = String(raw || '').trim()
  if (!token) return { error: 'Hãy dán Supabase Access Token.' }
  if (!/^sbp_[A-Za-z0-9_]{20,}$/.test(token)) {
    return { error: 'Access Token phải bắt đầu bằng "sbp_". Hãy chép lại toàn bộ token vừa tạo.' }
  }
  return { value: token }
}

export function checkGroqKey(raw) {
  const key = String(raw || '').trim()
  if (!key) return { value: '' } // optional
  if (!/^gsk_[A-Za-z0-9]{20,}$/.test(key)) return { error: 'Groq API key phải bắt đầu bằng "gsk_".' }
  return { value: key }
}

/** Same normalisation as the app's login screen (public/supabase-service.js). */
export function normalizeLoginCode(raw) {
  return String(raw || '').trim().toLowerCase().replace(/[^a-z0-9._-]/g, '')
}

export function checkAdmin({ code, fullName, password } = {}) {
  const clean = normalizeLoginCode(code)
  if (!/^[a-z0-9._-]{2,32}$/.test(clean)) {
    return { error: 'Tên đăng nhập dài 2–32 ký tự, chỉ gồm chữ thường không dấu, số, dấu chấm, gạch dưới hoặc gạch ngang.' }
  }
  const name = String(fullName || '').trim().replace(/\s+/g, ' ')
  if (name.length < 2 || name.length > 100) return { error: 'Họ tên dài 2–100 ký tự.' }
  const pass = String(password || '')
  if (pass.length < 8 || !/\p{L}/u.test(pass) || !/\d/u.test(pass)) {
    return { error: 'Mật khẩu cần ít nhất 8 ký tự và có cả chữ lẫn số.' }
  }
  if (pass.length > 72) return { error: 'Mật khẩu dài tối đa 72 ký tự.' }
  return { value: { code: clean, fullName: name, password: pass } }
}

/** Cloudflare R2 for homework photos: optional, but all four fields or none. */
export function checkR2(input = {}) {
  const v = {
    accountId: String(input.accountId || '').trim(),
    bucket: String(input.bucket || '').trim(),
    accessKeyId: String(input.accessKeyId || '').trim(),
    secretAccessKey: String(input.secretAccessKey || '').trim(),
  }
  const filled = Object.values(v).filter(Boolean).length
  if (filled === 0) return { value: null }
  if (filled < 4) return { error: 'Điền đủ cả 4 ô của Cloudflare R2, hoặc để trống cả 4 để bỏ qua.' }
  if (!/^[0-9a-f]{32}$/.test(v.accountId)) return { error: 'Account ID của Cloudflare gồm 32 ký tự 0-9, a-f.' }
  if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(v.bucket)) return { error: 'Tên bucket R2 không hợp lệ.' }
  if (v.accessKeyId.length < 16 || v.secretAccessKey.length < 32) return { error: 'Access Key ID hoặc Secret Access Key không đúng định dạng.' }
  return { value: v }
}

/** Origin of the site being installed, e.g. https://ten-truong.vercel.app */
export function checkOrigin(raw) {
  try {
    const u = new URL(String(raw || ''))
    if (u.protocol !== 'https:' && u.hostname !== 'localhost') return { error: 'Địa chỉ trang phải dùng https.' }
    return { value: u.origin }
  } catch {
    return { error: 'Không xác định được địa chỉ trang.' }
  }
}

/** SQL string literal (standard_conforming_strings is on in Supabase). */
export function sqlLiteral(value) {
  const s = String(value)
  if (s.includes('\0')) throw new Error('NUL character in SQL literal')
  return `'${s.replace(/'/g, "''")}'`
}

export function fillTemplate(sql, values) {
  return sql.replace(/\{\{([A-Z_]+)\}\}/g, (_, name) => {
    if (!(name in values)) throw new Error(`missing template value ${name}`)
    return sqlLiteral(values[name])
  })
}
