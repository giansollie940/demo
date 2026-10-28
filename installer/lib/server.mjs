// Request handling for the setup API (api/setup/*.js) and the runtime config (api/config.js).
// Kept free of Vercel specifics so the tests can drive it with plain objects.
import { createHash, timingSafeEqual } from 'node:crypto'
import { checkGroqLive, checkR2Live } from './checks.mjs'
import { ApiError, createManagementClient } from './management.mjs'
import { LockedError, inspect, installSteps, runStep } from './plan.mjs'
import { checkAccessToken, checkAdmin, checkGroqKey, checkOrigin, checkR2, projectRefFromUrl } from './validate.mjs'

const pick = (env, names) => names.map(n => String(env[n] || '').trim()).find(Boolean) || ''

export function readEnv(env = process.env) {
  const projectUrl = pick(env, ['SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'VITE_SUPABASE_URL']).replace(/\/$/, '')
  return {
    projectUrl,
    ref: projectRefFromUrl(projectUrl),
    publishableKey: pick(env, ['SUPABASE_PUBLISHABLE_KEY', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
      'SUPABASE_ANON_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY']),
    setupPassword: String(env.SETUP_PASSWORD || ''),
    loginDomain: (pick(env, ['LOGIN_DOMAIN']) || 'users.example.com').toLowerCase(),
    productionHost: pick(env, ['VERCEL_PROJECT_PRODUCTION_URL']),
  }
}

/** Browser configuration served as /config.js (same shape the GitHub Pages workflow writes). */
export function appConfig(cfg) {
  return {
    mode: 'supabase',
    projectUrl: cfg.projectUrl,
    publishableKey: cfg.publishableKey,
    loginDomain: cfg.loginDomain,
    fallbackRefreshSeconds: 180,
    authBag: true,
    bagGame: true,
  }
}

/** Has the installer created the schema yet? Probed with the public key: a missing table is a 404. */
export async function schemaInstalled(cfg, { fetchImpl = globalThis.fetch } = {}) {
  try {
    const res = await fetchImpl(`${cfg.projectUrl}/rest/v1/periods?select=period_number&limit=1`, {
      headers: { apikey: cfg.publishableKey, Authorization: `Bearer ${cfg.publishableKey}` },
    })
    if (res.status === 404) return false
    const body = await res.text()
    return !body.includes('PGRST205') && !body.includes('42P01')
  } catch {
    return true // network trouble: never bounce a working site to the setup page
  }
}

export async function configScript(cfg, opts) {
  if (!cfg.ref || !cfg.publishableKey) {
    return "location.replace(new URL('setup/', location.href).href);\n"
  }
  if (!(await schemaInstalled(cfg, opts))) {
    return "if (!/\\/setup\\//.test(location.pathname)) location.replace(new URL('setup/', location.href).href);\n"
  }
  return `window.APP_CONFIG = ${JSON.stringify(appConfig(cfg), null, 2)};\n`
}

export function setupStatus(cfg, manifest) {
  return {
    env: {
      supabaseUrl: Boolean(cfg.ref),
      publishableKey: Boolean(cfg.publishableKey),
      setupPassword: cfg.setupPassword.length >= 8,
    },
    projectRef: cfg.ref,
    loginDomain: cfg.loginDomain,
    steps: installSteps(manifest),
  }
}

function passwordMatches(given, expected) {
  const a = createHash('sha256').update(String(given || '')).digest()
  const b = createHash('sha256').update(expected).digest()
  return timingSafeEqual(a, b)
}

/** The site's main address (production domain when Vercel exposes it) plus the one in use now. */
export function siteOrigins(cfg, requestOrigin) {
  const production = cfg.productionHost ? `https://${cfg.productionHost}` : ''
  const all = [...new Set([production, requestOrigin].filter(Boolean))]
  return { origin: all[0], allowedOrigins: all }
}

const reply = (status, body) => ({ status, body })

/**
 * One setup action. body = { password, token, action, input }.
 * Actions: login, token, groq, r2, or an install step id from installSteps().
 */
export async function handleSetupAction(body, { cfg, manifest, files, requestOrigin, fetchImpl, sleep }) {
  if (!cfg.ref || !cfg.publishableKey) return reply(400, { error: 'Thiếu SUPABASE_URL hoặc SUPABASE_PUBLISHABLE_KEY trong cài đặt Vercel.' })
  if (cfg.setupPassword.length < 8) return reply(400, { error: 'Chưa đặt SETUP_PASSWORD (ít nhất 8 ký tự) trong cài đặt Vercel.' })
  if (!passwordMatches(body?.password, cfg.setupPassword)) {
    await (sleep || (ms => new Promise(r => setTimeout(r, ms))))(1500)
    return reply(401, { error: 'Mật khẩu cài đặt không đúng.' })
  }
  const action = String(body?.action || '')
  if (action === 'login') return reply(200, { ok: true, message: 'Mật khẩu cài đặt đúng.' })

  if (action === 'groq') {
    const key = checkGroqKey(body?.input?.groqKey)
    if (key.error) return reply(400, { error: key.error })
    if (!key.value) return reply(200, { ok: true, message: 'Bỏ qua AI: đăng ký sẽ do giáo viên duyệt.' })
    const r = await checkGroqLive(key.value, { fetchImpl })
    return reply(r.ok ? 200 : 400, r.ok ? r : { error: r.message })
  }
  if (action === 'r2') {
    const r2 = checkR2(body?.input?.r2)
    if (r2.error) return reply(400, { error: r2.error })
    if (!r2.value) return reply(200, { ok: true, message: 'Bỏ qua ảnh báo bài: vẫn dùng được báo bài bằng chữ.' })
    const r = await checkR2Live(r2.value, { fetchImpl })
    return reply(r.ok ? 200 : 400, r.ok ? r : { error: r.message })
  }

  const token = checkAccessToken(body?.token)
  if (token.error) return reply(400, { error: token.error })
  const api = createManagementClient(token.value, { fetchImpl })

  try {
    if (action === 'token') {
      const project = await api.getProject(cfg.ref)
      const info = await inspect(api, cfg.ref)
      return reply(200, {
        ok: true,
        project: { name: project.name, region: project.region, status: project.status },
        state: info.state,
        message: {
          empty: `Kết nối được project "${project.name}". Project trống, sẵn sàng cài.`,
          partial: `Kết nối được project "${project.name}". Lần cài trước chưa xong: bấm Cài đặt để làm tiếp.`,
          installed: `Project "${project.name}" đã cài xong Sổ Tự Học. Trang cài đặt đã khoá.`,
          foreign: `Project "${project.name}" đã có dữ liệu khác. Hãy tạo một project Supabase trống.`,
        }[info.state],
      })
    }

    const steps = installSteps(manifest)
    if (!steps.some(s => s.id === action)) return reply(400, { error: 'Bước cài đặt không hợp lệ.' })
    const origin = checkOrigin(requestOrigin)
    if (origin.error) return reply(400, { error: origin.error })
    const input = {}
    if (action === 'secrets') {
      const groq = checkGroqKey(body?.input?.groqKey)
      const r2 = checkR2(body?.input?.r2)
      if (groq.error || r2.error) return reply(400, { error: groq.error || r2.error })
      input.groqKey = groq.value
      input.r2 = r2.value
    }
    if (action === 'admin') {
      const admin = checkAdmin(body?.input?.admin)
      if (admin.error) return reply(400, { error: admin.error })
      input.admin = admin.value
    }
    const result = await runStep(action, {
      api, ref: cfg.ref, projectUrl: cfg.projectUrl, loginDomain: cfg.loginDomain,
      ...siteOrigins(cfg, origin.value), files, manifest, input, fetchImpl,
    })
    return reply(200, { ok: true, ...result })
  } catch (error) {
    if (error instanceof LockedError) return reply(409, { error: error.message, locked: true })
    if (error instanceof ApiError && error.status === 401) {
      return reply(401, { error: 'Supabase từ chối Access Token: token sai, đã hết hạn hoặc đã bị xoá.' })
    }
    if (error instanceof ApiError && error.status === 403) {
      return reply(403, { error: 'Access Token không có quyền với project này. Hãy tạo token bằng tài khoản sở hữu project.' })
    }
    if (error instanceof ApiError && error.status === 404) {
      return reply(404, { error: `Không tìm thấy project ${cfg.ref} trong tài khoản của token này.` })
    }
    return reply(500, { error: `Lỗi: ${error.message}` })
  }
}
