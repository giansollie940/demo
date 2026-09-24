import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTap, runMutationGate } from '../../scripts/mutation-runner.mjs';

function tap(failed = 0, total = 3) {
  return { exitCode: failed ? 1 : 0, output:
    Array.from({ length: total }, (_, i) => `${i < failed ? 'not ok' : 'ok'} ${i + 1} - scenario ${i + 1}`).join('\n')
    + `\n# tests ${total}\n# pass ${total - failed}\n# fail ${failed}\n# cancelled 0\n# skipped 0\n# todo 0\n` };
}

test('baseline failure aborts before any mutation can be credited', async () => {
  const calls = [];
  await assert.rejects(runMutationGate({ names: ['M1'], run: async name => {
    calls.push(name); return tap(1);
  } }), /BASELINE_FAILED/);
  assert.deepEqual(calls, [null]);
});

test('spec reporter, truncated output and signal termination fail closed', async () => {
  for (const result of [
    { output: 'ℹ tests 3\nℹ fail 0', exitCode: 0 },
    { ...tap(), output: tap().output.replace('# fail 0', '') },
    { ...tap(1), exitCode: null },
    { ...tap(), output: tap().output.replace('# skipped 0', '# skipped 1') },
  ]) assert.equal(parseTap(result).valid, false);
});

test('only a partial failure in a complete applied mutation is caught', async () => {
  const samples = { caught: tap(1), escaped: tap(), wipeout: tap(3),
    changedSuite: tap(1, 2), broken: { ...tap(1), output: tap(1).output + '\nmutation không tìm thấy snippet' },
    invalid: { ...tap(1), exitCode: 0 } };
  const { rows } = await runMutationGate({ names: Object.keys(samples), concurrency: 2,
    run: async name => name === null ? tap() : samples[name] });
  assert.deepEqual(rows.filter(r => r.caught).map(r => r.name), ['caught']);
});

test('empty selection and invalid worker count cannot report success', async () => {
  for (const options of [{ names: [] }, { names: ['M1'], concurrency: 0 }]) {
    await assert.rejects(runMutationGate({ ...options, run: async () => tap() }), /invalid/);
  }
});
