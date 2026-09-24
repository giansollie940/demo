// Local SQL mutations. A green unmutated baseline is mandatory on every run.
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { mutations } from '../tests/feat-010/mutations.mjs';
import { runMutationGate } from './mutation-runner.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const evidence = new URL('../docs/feat-010/evidence/', import.meta.url);
const selected = process.argv.slice(2);
const unknown = selected.filter(n => !Object.hasOwn(mutations, n));
if (unknown.length) throw new Error('Unknown mutation: ' + unknown.join(', '));
const names = Object.keys(mutations).filter(n => !selected.length || selected.includes(n));
const concurrency = Number(process.env.FEAT010_MUTATION_WORKERS || 2);
await mkdir(evidence, { recursive: true });
// Clear inherited success before starting. Interrupted runs remain NOT_COMPLETE.
await writeFile(new URL('mutations.json', evidence), '[]\n');
await writeFile(new URL('mutation-run.json', evidence), JSON.stringify({ status: 'NOT_COMPLETE', names }));
const started = new Date().toISOString();
async function run(name) {
  const env = { ...process.env, NO_COLOR: '1' };
  delete env.FEAT010_MUTATION;
  if (name) env.FEAT010_MUTATION = name;
  let output = '';
  const args = ['--test', '--test-reporter=tap', 'tests/feat-010/database.test.mjs'];
  const exitCode = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { cwd: root, env, windowsHide: true });
    child.stdout.on('data', x => output += x);
    child.stderr.on('data', x => output += x);
    child.on('error', reject);
    child.on('close', resolve);
  });
  await writeFile(new URL(`mutation-${name || 'baseline'}.log`, evidence), output + `\nExit code: ${exitCode}\n`);
  return { output, exitCode };
}
try {
  const { baseline, rows } = await runMutationGate({ names, run, concurrency,
    onResult: row => console.log(`${row.name}: ${row.caught ? 'CAUGHT' : 'NOT CAUGHT / HARNESS ERROR'} (${row.failed}/${row.total} fail)`),
  });
  for (const row of rows) row.what = mutations[row.name].what;
  await writeFile(new URL('mutations.json', evidence), JSON.stringify(rows, null, 2));
  const passed = rows.every(r => r.caught);
  await writeFile(new URL('mutation-run.json', evidence), JSON.stringify({
    status: passed ? 'PASS' : 'FAIL', started, ended: new Date().toISOString(), baseline, concurrency, names,
  }, null, 2));
  console.log(`${rows.filter(r => r.caught).length}/${rows.length} mutations caught.`);
  if (!passed) process.exitCode = 1;
} catch (error) {
  await writeFile(new URL('mutation-run.json', evidence), JSON.stringify({
    status: 'FAIL', started, ended: new Date().toISOString(), error: error.message, names,
  }, null, 2));
  throw error;
}
