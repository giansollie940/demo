// Vercel: /config.js (see vercel.json) — the browser configuration, built from environment variables.
// Until the database is installed it sends visitors to the setup page instead.
import { configScript, readEnv } from '../installer/lib/server.mjs'

export default async function handler(req, res) {
  const script = await configScript(readEnv())
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8')
  res.setHeader('Cache-Control', script.startsWith('window.APP_CONFIG') ? 'public, max-age=0, s-maxage=300' : 'no-store')
  res.status(200).send(script)
}
