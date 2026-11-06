// Runs tests/homework-due once per mutation. The bar: every mutation makes at
// least one test fail. Two false greens this project has already paid for are
// their own verdicts here: a mutation that did not apply, and one that broke
// the migration so badly that *every* test failed (nothing was proved).
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mutations } from '../tests/homework-due/mutations.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));

const only = process.argv.slice(2);
const rows = [];
for (const name of Object.keys(mutations).filter(n => !only.length || only.includes(n))) {
  let output = '';
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--test', 'tests/homework-due/database.test.mjs'],
      { cwd: root, env: { ...process.env, HOMEWORK_DUE_MUTATION: name, NO_COLOR: '1' } });
    child.stdout.on('data', x => output += x);
    child.stderr.on('data', x => output += x);
    child.on('error', reject);
    child.on('close', resolve);
  });
  const failed = Number(output.match(/^# fail (\d+)$/m)?.[1] ?? NaN);
  const total = Number(output.match(/^# tests (\d+)$/m)?.[1] ?? NaN);
  const failing = [...output.matchAll(/^not ok \d+ - (.+)$/gm)].map(m => m[1]);
  const broken = /mutation (?:phải khớp|không tìm thấy|tên)/.test(output);
  const wipeout = !broken && Number.isFinite(total) && total > 0 && failed === total;
  rows.push({ name, what: mutations[name].what, failed, total, failing, broken, wipeout });
  const verdict = broken ? '*** KHÔNG ÁP DỤNG ĐƯỢC ***'
    : wipeout ? '*** TOÀN BỘ SUITE FAIL — nghi hỏng migration ***'
    : failed > 0 ? 'CAUGHT' : '*** NOT CAUGHT ***';
  console.log(`${name.padEnd(4)} ${String(failed).padStart(2)}/${total} failing  ${verdict}  ${mutations[name].what}`);
}
const escaped = rows.filter(r => r.broken || r.wipeout || !(r.failed > 0));
console.log(`\n${rows.length - escaped.length}/${rows.length} mutations caught.`);
if (escaped.length) { console.log('Thoát: ' + escaped.map(r => r.name).join(', ')); process.exitCode = 1; }
