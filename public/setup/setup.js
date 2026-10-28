// Sổ Tự Học setup wizard. Keys typed here live only in this page's memory and go to /api/setup/step
// (the site's own server) over HTTPS; nothing is kept in browser storage.
const $ = sel => document.querySelector(sel)
const ORDER = ['env', 'password', 'token', 'groq', 'r2', 'admin', 'install', 'done']
const LABELS = {
  env: 'Cài đặt Vercel', password: 'Mật khẩu cài đặt', token: 'Kết nối Supabase', groq: 'AI duyệt đăng ký',
  r2: 'Ảnh báo bài', admin: 'Tài khoản quản trị', install: 'Cài đặt', done: 'Xong',
}
const state = { password: '', token: '', groqKey: '', r2: null, admin: null, steps: [], done: new Set(), current: 'env', busy: false }

function say(id, text, tone = 'info') {
  const el = $(`#${id}`)
  el.textContent = text || ''
  el.dataset.tone = tone
}

function renderNav() {
  $('#step-list').innerHTML = ORDER.filter(s => s !== 'done').map((s, i) => {
    const pos = ORDER.indexOf(state.current)
    const cls = s === state.current ? 'current' : ORDER.indexOf(s) < pos ? 'past' : ''
    return `<li class="${cls}"><span>${i + 1}</span>${LABELS[s]}</li>`
  }).join('')
}

function show(step) {
  state.current = step
  for (const el of document.querySelectorAll('.step')) el.hidden = el.dataset.step !== step
  renderNav()
  const first = document.querySelector(`.step[data-step="${step}"] input`)
  if (first) first.focus()
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

const next = step => show(ORDER[ORDER.indexOf(step) + 1])
const back = () => show(ORDER[Math.max(0, ORDER.indexOf(state.current) - 1)])

async function call(action, input) {
  let res
  try {
    res = await fetch('/api/setup/step', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: state.password, token: state.token, action, input }),
    })
  } catch {
    return { ok: false, status: 0, body: { error: 'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.' } }
  }
  let body = {}
  try { body = await res.json() } catch { body = { error: `Máy chủ trả lỗi HTTP ${res.status}.` } }
  return { ok: res.ok, status: res.status, body }
}

async function withBusy(button, fn) {
  if (state.busy) return
  state.busy = true
  const label = button.textContent
  button.disabled = true
  button.textContent = 'Đang kiểm tra…'
  try { await fn() } finally {
    state.busy = false
    button.disabled = false
    button.textContent = label
  }
}

const nextButton = step => document.querySelector(`[data-next="${step}"]`)

// ---- 1. Vercel settings
async function loadStatus() {
  let status
  try {
    const res = await fetch('/api/setup/status', { cache: 'no-store' })
    if (!res.ok) throw new Error(String(res.status))
    status = await res.json()
  } catch {
    say('env-msg', 'Trang cài đặt chỉ chạy trên bản deploy Vercel (bấm nút "Deploy to Vercel" trong README của repo).', 'error')
    return
  }
  state.steps = status.steps
  $('#project-ref').textContent = status.projectRef || '—'
  const items = [
    ['SUPABASE_URL', status.env.supabaseUrl, status.projectRef ? `project ${status.projectRef}` : 'thiếu hoặc sai dạng https://xxxx.supabase.co'],
    ['SUPABASE_PUBLISHABLE_KEY', status.env.publishableKey, status.env.publishableKey ? 'đã có' : 'thiếu'],
    ['SETUP_PASSWORD', status.env.setupPassword, status.env.setupPassword ? 'đã đặt' : 'thiếu hoặc ngắn hơn 8 ký tự'],
  ]
  $('#env-list').innerHTML = items.map(([name, ok, note]) =>
    `<li class="${ok ? 'ok' : 'bad'}"><b>${name}</b><span>${ok ? '✓' : '✗'} ${note}</span></li>`).join('')
  const ready = items.every(i => i[1])
  $('#env-help').hidden = ready
  nextButton('env').disabled = !ready
  say('env-msg', ready ? 'Đủ cả 3 biến. Bấm Tiếp tục.' : 'Còn thiếu biến môi trường, xem hướng dẫn bên dưới.', ready ? 'ok' : 'error')
}

// ---- 2. Password
$('#password-check').addEventListener('click', e => withBusy(e.currentTarget, async () => {
  state.password = $('#setup-password').value
  if (!state.password) return say('password-msg', 'Hãy nhập mật khẩu cài đặt.', 'error')
  const r = await call('login')
  if (!r.ok) return say('password-msg', r.body.error, 'error')
  say('password-msg', r.body.message, 'ok')
  next('password')
}))

// ---- 3. Supabase token
$('#token-check').addEventListener('click', e => withBusy(e.currentTarget, async () => {
  state.token = $('#token').value.trim()
  nextButton('token').disabled = true
  const r = await call('token')
  if (!r.ok) return say('token-msg', r.body.error, 'error')
  const usable = r.body.state === 'empty' || r.body.state === 'partial'
  say('token-msg', r.body.message, usable ? 'ok' : 'error')
  nextButton('token').disabled = !usable
}))

// ---- 4. Groq
$('#groq-check').addEventListener('click', e => withBusy(e.currentTarget, async () => {
  const groqKey = $('#groq').value.trim()
  nextButton('groq').disabled = true
  if (!groqKey) return say('groq-msg', 'Dán khoá Groq, hoặc bấm Bỏ qua.', 'error')
  const r = await call('groq', { groqKey })
  if (!r.ok) return say('groq-msg', r.body.error, 'error')
  state.groqKey = groqKey
  say('groq-msg', r.body.message, 'ok')
  nextButton('groq').disabled = false
}))

// ---- 5. R2
const r2Input = () => ({
  accountId: $('#r2-account').value.trim(), bucket: $('#r2-bucket').value.trim(),
  accessKeyId: $('#r2-key').value.trim(), secretAccessKey: $('#r2-secret').value.trim(),
})
$('#r2-check').addEventListener('click', e => withBusy(e.currentTarget, async () => {
  const r2 = r2Input()
  nextButton('r2').disabled = true
  if (!Object.values(r2).some(Boolean)) return say('r2-msg', 'Điền 4 ô của Cloudflare R2, hoặc bấm Bỏ qua.', 'error')
  const r = await call('r2', { r2 })
  if (!r.ok) return say('r2-msg', r.body.error, 'error')
  state.r2 = r2
  say('r2-msg', r.body.message, 'ok')
  nextButton('r2').disabled = false
}))

for (const btn of document.querySelectorAll('[data-skip]')) {
  btn.addEventListener('click', () => {
    if (btn.dataset.skip === 'groq') { state.groqKey = ''; $('#groq').value = '' }
    if (btn.dataset.skip === 'r2') { state.r2 = null; for (const id of ['r2-account', 'r2-bucket', 'r2-key', 'r2-secret']) $(`#${id}`).value = '' }
    next(btn.dataset.skip)
  })
}

// ---- 6. Admin
$('#admin-next').addEventListener('click', () => {
  const fullName = $('#admin-name').value.trim().replace(/\s+/g, ' ')
  const code = $('#admin-code').value.trim().toLowerCase()
  const password = $('#admin-pass').value
  if (fullName.length < 2) return say('admin-msg', 'Hãy nhập họ tên.', 'error')
  if (!/^[a-z0-9._-]{2,32}$/.test(code)) return say('admin-msg', 'Tên đăng nhập dài 2–32 ký tự: chữ thường không dấu, số, dấu chấm, gạch dưới hoặc gạch ngang.', 'error')
  if (password.length < 8 || !/\p{L}/u.test(password) || !/\d/.test(password)) return say('admin-msg', 'Mật khẩu cần ít nhất 8 ký tự và có cả chữ lẫn số.', 'error')
  if (password !== $('#admin-pass2').value) return say('admin-msg', 'Hai lần nhập mật khẩu chưa khớp.', 'error')
  state.admin = { fullName, code, password }
  say('admin-msg', '')
  renderInstall()
  next('admin')
})

// ---- 7. Install
function renderInstall() {
  $('#summary').innerHTML = [
    `Project Supabase: <b>${$('#project-ref').textContent}</b>`,
    `AI duyệt đăng ký: <b>${state.groqKey ? 'có (Groq)' : 'không, giáo viên duyệt tay'}</b>`,
    `Ảnh báo bài: <b>${state.r2 ? 'có (Cloudflare R2)' : 'không'}</b>`,
    `Tài khoản quản trị: <b>${state.admin?.code ?? ''}</b>`,
  ].map(x => `<li>${x}</li>`).join('')
  $('#progress').innerHTML = state.steps.map(s =>
    `<li data-id="${s.id}" class="${state.done.has(s.id) ? 'done' : ''}"><span class="label">${s.label}</span><span class="detail"></span></li>`).join('')
}

function markStep(id, cls, detail) {
  const li = document.querySelector(`#progress li[data-id="${CSS.escape(id)}"]`)
  if (!li) return
  li.className = cls
  li.querySelector('.detail').textContent = detail || ''
  if (cls === 'running') li.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
}

$('#install-run').addEventListener('click', async () => {
  if (state.busy) return
  state.busy = true
  const run = $('#install-run')
  run.disabled = true
  $('#install-back').disabled = true
  say('install-msg', 'Đang cài, đừng đóng trang này. Thường mất 2–4 phút.', 'info')
  let failed = false
  for (const step of state.steps) {
    if (state.done.has(step.id)) continue
    markStep(step.id, 'running', 'đang chạy…')
    const input = step.id === 'secrets' ? { groqKey: state.groqKey, r2: state.r2 }
      : step.id === 'admin' ? { admin: state.admin } : undefined
    const r = await call(step.id, input)
    if (r.ok) {
      state.done.add(step.id)
      markStep(step.id, 'done', r.body.message)
      continue
    }
    markStep(step.id, 'failed', r.body.error)
    say('install-msg', `Bước "${step.label}" chưa xong: ${r.body.error} Sửa xong thì bấm "Thử lại" — các bước đã xong sẽ không chạy lại.`, 'error')
    failed = true
    break
  }
  state.busy = false
  run.disabled = false
  $('#install-back').disabled = false
  if (failed) { run.textContent = 'Thử lại'; return }
  state.token = ''
  state.groqKey = ''
  state.r2 = null
  $('#done-code').textContent = state.admin.code
  show('done')
})

// ---- shared controls
for (const btn of document.querySelectorAll('[data-next]')) btn.addEventListener('click', () => next(btn.dataset.next))
for (const btn of document.querySelectorAll('[data-back]')) btn.addEventListener('click', back)
for (const btn of document.querySelectorAll('[data-eye]')) {
  btn.addEventListener('click', () => {
    const input = $(`#${btn.dataset.eye}`)
    const hidden = input.type === 'password'
    input.type = hidden ? 'text' : 'password'
    btn.textContent = hidden ? 'Ẩn' : 'Hiện'
  })
}
for (const [inputId, buttonId] of [['setup-password', 'password-check'], ['token', 'token-check'], ['groq', 'groq-check']]) {
  $(`#${inputId}`).addEventListener('keydown', e => { if (e.key === 'Enter') $(`#${buttonId}`).click() })
}

show('env')
loadStatus()
