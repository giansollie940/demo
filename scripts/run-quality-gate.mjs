import { spawnSync } from 'node:child_process'

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const gates = [
  ['Static source tests', ['test']],
  ['Vitest unit tests', ['run', 'test:unit']],
  ['Vue/TypeScript typecheck', ['run', 'typecheck']],
]

const failures = []
for (const [label, args] of gates) {
  console.log(`\n=== ${label} ===`)
  const result = spawnSync(npm, args, { stdio: 'inherit' })
  if (result.error) {
    failures.push(`${label}: ${result.error.message}`)
    continue
  }
  if (result.status !== 0) failures.push(`${label}: exit ${result.status ?? 'unknown'}`)
}

console.log('\n=== Quality gate summary ===')
if (failures.length) {
  for (const failure of failures) console.error(`FAIL  ${failure}`)
  console.error(`Quality gate failed: ${failures.length}/${gates.length} gate(s).`)
  process.exit(1)
}
for (const [label] of gates) console.log(`PASS  ${label}`)
console.log(`Quality gate passed: ${gates.length}/${gates.length} gates.`)
