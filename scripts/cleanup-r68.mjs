import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const staleAssets = [
  'public/assets/images/student-cards.png',
  'public/assets/images/empty-state.png',
]

for (const relative of staleAssets) {
  const target = path.join(root, relative)
  if (fs.existsSync(target)) {
    fs.rmSync(target, { force: true })
    console.log(`Removed stale asset: ${relative}`)
  } else {
    console.log(`Already clean: ${relative}`)
  }
}
