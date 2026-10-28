// Vercel: POST /api/setup/step — one setup action. The Supabase Access Token and keys arrive with each
// request from the setup page and are used for that request only: nothing is stored or logged.
import { createFileSource, loadManifest } from '../../installer/lib/plan.mjs'
import { handleSetupAction, readEnv } from '../../installer/lib/server.mjs'

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  const proto = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0]
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '')
  const files = createFileSource(process.cwd())
  const { status, body } = await handleSetupAction(req.body || {}, {
    cfg: readEnv(), manifest: loadManifest(files), files, requestOrigin: `${proto}://${host}`,
  })
  res.status(status).json(body)
}
