// Live checks for the optional keys, run from the setup API so the browser never calls third parties.
import { createHash, createHmac, randomBytes } from 'node:crypto'

export async function checkGroqLive(key, { fetchImpl = globalThis.fetch } = {}) {
  const res = await fetchImpl('https://api.groq.com/openai/v1/models', { headers: { Authorization: `Bearer ${key}` } })
  if (res.ok) return { ok: true, message: 'Khoá Groq dùng được.' }
  if (res.status === 401 || res.status === 403) return { ok: false, message: 'Groq từ chối khoá này. Hãy tạo khoá mới và dán lại.' }
  return { ok: false, message: `Không kiểm tra được khoá Groq (HTTP ${res.status}). Thử lại sau ít phút.` }
}

/** AWS Signature V4 for one request to Cloudflare R2 (region "auto", service "s3"). */
export function signR2Request({ accountId, accessKeyId, secretAccessKey }, method, path, now = new Date()) {
  const host = `${accountId}.r2.cloudflarestorage.com`
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '')
  const day = amzDate.slice(0, 8)
  const payloadHash = createHash('sha256').update('').digest('hex')
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date'
  const canonical = [method, path, '', `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`,
    signedHeaders, payloadHash].join('\n')
  const scope = `${day}/auto/s3/aws4_request`
  const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, createHash('sha256').update(canonical).digest('hex')].join('\n')
  const hmac = (k, d) => createHmac('sha256', k).update(d).digest()
  const signingKey = hmac(hmac(hmac(hmac(`AWS4${secretAccessKey}`, day), 'auto'), 's3'), 'aws4_request')
  const signature = createHmac('sha256', signingKey).update(toSign).digest('hex')
  return {
    url: `https://${host}${path}`,
    headers: {
      'x-amz-date': amzDate,
      'x-amz-content-sha256': payloadHash,
      Authorization: `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    },
  }
}

/** HEAD a random missing object: 404 proves the keys and bucket work without writing anything. */
export async function checkR2Live(r2, { fetchImpl = globalThis.fetch } = {}) {
  const path = `/${r2.bucket}/installer-check/${randomBytes(8).toString('hex')}`
  const { url, headers } = signR2Request(r2, 'HEAD', path)
  const res = await fetchImpl(url, { method: 'HEAD', headers })
  if (res.status === 404 || res.ok) return { ok: true, message: 'Cloudflare R2 dùng được.' }
  if (res.status === 401 || res.status === 403) return { ok: false, message: 'R2 từ chối khoá này: kiểm tra Access Key ID, Secret và quyền đọc/ghi bucket.' }
  return { ok: false, message: `Không kiểm tra được R2 (HTTP ${res.status}). Kiểm tra Account ID và tên bucket.` }
}
