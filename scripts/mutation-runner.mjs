// Fail closed: a broken baseline or incomplete reporter output proves nothing.
export function parseTap({ output, exitCode }) {
  const count = label => {
    const matches = [...output.matchAll(new RegExp(`^# ${label} (\\d+)$`, 'gm'))];
    return matches.length === 1 ? Number(matches[0][1]) : NaN;
  };
  const total = count('tests'), failed = count('fail'), passed = count('pass');
  const failing = [...output.matchAll(/^not ok \d+ - (.+)$/gm)].map(m => m[1]);
  const broken = /mutation (?:phải khớp|không tìm thấy|tên)/.test(output);
  const valid = Number.isInteger(total) && total > 0 && Number.isInteger(failed)
    && passed + failed === total && failing.length === failed
    && count('cancelled') === 0 && count('skipped') === 0 && count('todo') === 0
    && exitCode === (failed ? 1 : 0);
  return { total, failed, passed, failing, broken, valid, exitCode };
}

export async function runMutationGate({ names, run, concurrency = 1, onResult = () => {} }) {
  if (!names.length || !Number.isInteger(concurrency) || concurrency < 1 || concurrency > 8)
    throw new Error('Mutation selection/concurrency invalid');
  const baseline = parseTap(await run(null));
  if (!baseline.valid || baseline.failed !== 0 || baseline.broken)
    throw new Error('BASELINE_FAILED: mutation run refused; inspect mutation-baseline.log');
  const rows = new Array(names.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, names.length) }, async () => {
    while (cursor < names.length) {
      const index = cursor++, name = names[index];
      const result = parseTap(await run(name));
      const wipeout = result.failed === result.total;
      const caught = result.valid && !result.broken && !wipeout
        && result.total === baseline.total && result.failed > 0;
      rows[index] = { name, ...result, wipeout, caught };
      onResult(rows[index]);
    }
  }));
  return { baseline, rows };
}
