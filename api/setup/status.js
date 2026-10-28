// Vercel: GET /api/setup/status — which settings are present and the list of install steps.
// Reveals no secret: only whether each environment variable is set.
import { createFileSource, loadManifest } from '../../installer/lib/plan.mjs'
import { readEnv, setupStatus } from '../../installer/lib/server.mjs'

export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  res.status(200).json(setupStatus(readEnv(), loadManifest(createFileSource(process.cwd()))))
}
