// Minimal client for the Supabase Management API (https://api.supabase.com) and the project's
// Auth admin endpoint. Only what the installer needs. The access token is passed per call and never
// stored or logged.
const API = 'https://api.supabase.com/v1'

export class ApiError extends Error {
  constructor(message, status, body) {
    super(message)
    this.status = status
    this.body = body
  }
}

async function readBody(res) {
  const text = await res.text()
  try { return JSON.parse(text) } catch { return text }
}

function describe(body) {
  if (!body) return ''
  if (typeof body === 'string') return body.slice(0, 500)
  return String(body.message || body.msg || body.error_description || body.error || JSON.stringify(body)).slice(0, 500)
}

export function createManagementClient(token, { fetchImpl = globalThis.fetch } = {}) {
  if (!token) throw new Error('missing access token')
  const call = async (method, path, { json, form, query } = {}) => {
    const url = new URL(API + path)
    for (const [k, v] of Object.entries(query || {})) url.searchParams.set(k, v)
    const headers = { Authorization: `Bearer ${token}` }
    let body
    if (json !== undefined) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(json) }
    if (form) body = form
    const res = await fetchImpl(url, { method, headers, body })
    const data = await readBody(res)
    if (!res.ok) throw new ApiError(describe(data) || `HTTP ${res.status}`, res.status, data)
    return data
  }
  return {
    getProject: ref => call('GET', `/projects/${ref}`),
    /** Runs SQL as the project's postgres role; the whole text is one transaction. */
    runSql: (ref, query) => call('POST', `/projects/${ref}/database/query`, { json: { query } }),
    setSecrets: (ref, secrets) => call('POST', `/projects/${ref}/secrets`, {
      json: Object.entries(secrets).map(([name, value]) => ({ name, value })),
    }),
    getApiKeys: ref => call('GET', `/projects/${ref}/api-keys`, { query: { reveal: 'true' } }),
    updateAuthConfig: (ref, config) => call('PATCH', `/projects/${ref}/config/auth`, { json: config }),
    /** files: [{ path, content }]; entrypoint is one of the paths. */
    deployFunction: (ref, { slug, entrypoint, verifyJwt, files }) => {
      const form = new FormData()
      form.append('metadata', JSON.stringify({ name: slug, entrypoint_path: entrypoint, verify_jwt: verifyJwt }))
      for (const f of files) form.append('file', new Blob([f.content], { type: 'application/typescript' }), f.path)
      return call('POST', `/projects/${ref}/functions/deploy`, { form, query: { slug } })
    },
  }
}

/** The key the installer uses for Auth admin calls: a secret key, or else the legacy service_role key. */
export function pickServerKey(keys) {
  const list = Array.isArray(keys) ? keys : []
  const usable = k => k && typeof k.api_key === 'string' && k.api_key && !k.disabled
  const secret = list.find(k => k.type === 'secret' && usable(k))
  if (secret) return secret.api_key
  const legacy = list.find(k => (k.name === 'service_role' || k.id === 'service_role') && usable(k))
  if (legacy) return legacy.api_key
  throw new Error('Không tìm thấy khoá máy chủ (secret / service_role) của project.')
}

/** Auth admin API of the project itself (not the Management API). */
export function createAuthAdmin(projectUrl, serverKey, { fetchImpl = globalThis.fetch } = {}) {
  const call = async (method, path, json) => {
    const res = await fetchImpl(`${projectUrl}/auth/v1${path}`, {
      method,
      headers: { apikey: serverKey, Authorization: `Bearer ${serverKey}`, 'Content-Type': 'application/json' },
      body: json === undefined ? undefined : JSON.stringify(json),
    })
    const data = await readBody(res)
    if (!res.ok) throw new ApiError(describe(data) || `HTTP ${res.status}`, res.status, data)
    return data
  }
  return {
    createUser: user => call('POST', '/admin/users', user),
    updateUser: (id, changes) => call('PUT', `/admin/users/${id}`, changes),
  }
}
