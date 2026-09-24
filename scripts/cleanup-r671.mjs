import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const staleAssets = [
  'public/assets/images/student-cards.png',
]

for (const rel of staleAssets) {
  const target = path.join(root, rel)
  if (fs.existsSync(target)) {
    fs.rmSync(target, { force: true })
    console.log(`Removed ${rel}`)
  }
}
