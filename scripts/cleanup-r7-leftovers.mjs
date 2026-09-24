import { rm, access } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const R7_STALE_PATHS = Object.freeze([
  'docs/superpowers/plans/2026-08-30-r7-reference-source-of-truth.md',
  'docs/superpowers/specs/2026-08-30-r7-reference-source-of-truth-design.md',
  'src/assets/images/r7-dashboard-students@2x.png',
  'src/assets/images/r7-login-panorama-soft@2x.png',
  'src/assets/images/r7-login-students@2x.png',
  'src/components/dashboard/DashboardHero.vue',
  'src/components/dashboard/KpiTrendCard.vue',
  'src/components/dashboard/MotivationCard.vue',
  'src/components/dashboard/PendingTasksTable.vue',
  'src/components/dashboard/WeeklyProgressCard.vue',
  'src/components/layout/SidebarProfileCard.vue',
  'src/features/dashboard/dashboard-presenter.ts',
  'tests/v900-r7-assets-source.test.mjs',
  'tests/v900-r7-dashboard-kpi-source.test.mjs',
  'tests/v900-r7-dashboard-queue-source.test.mjs',
  'tests/v900-r7-login-source.test.mjs',
  'tests/v900-r7-responsive-cleanup.test.mjs',
  'tests/v900-r7-sidebar-source.test.mjs',
  'tests/v900-r71-lucide-compat.test.mjs',
  'public/assets/images/student-group-dashboard-blend.png',
])

export async function cleanupR7Leftovers(rootDir = process.cwd()) {
  const removed = []
  for (const relative of R7_STALE_PATHS) {
    const target = resolve(rootDir, relative)
    try {
      await access(target)
    } catch {
      continue
    }
    await rm(target, { force: true, recursive: true })
    removed.push(relative)
  }
  return removed
}

const isCli = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isCli) {
  const removed = await cleanupR7Leftovers(process.cwd())
  if (removed.length) {
    console.log(`Removed ${removed.length} stale R7 file(s):`)
    for (const path of removed) console.log(`- ${path}`)
  } else {
    console.log('No stale R7 files found.')
  }
}
