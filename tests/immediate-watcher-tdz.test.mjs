import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';

/**
 * A watcher created with `immediate: true` — and every `watchEffect` — runs its
 * callback synchronously during `setup()`. If that callback touches a `const` or
 * `let` declared further down the same script, the binding is still in its
 * temporal dead zone and the component throws
 * "Cannot access 'x' before initialization" the moment it mounts.
 *
 * This happened for real in AdminUserDialog.vue: `watch(..., {immediate:true})`
 * whose first statement was `touched.value=false`, with `const touched=ref(false)`
 * thirteen lines below. The whole dialog died on open.
 *
 * Neither `vue-tsc` nor the production build catches it — TypeScript does not
 * track TDZ across a callback boundary, and the bundle is happy to emit it — so
 * the only thing that can keep it out is a check like this one.
 */
async function sources(dir, out = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) await sources(path, out);
    else if (/\.(vue|ts)$/.test(entry.name)) out.push(path);
  }
  return out;
}

/** The span of a call starting at `open`, by paren depth. */
function callSpan(text, open) {
  let depth = 0;
  for (let i = open; i < text.length; i += 1) {
    if (text[i] === '(') depth += 1;
    else if (text[i] === ')') { depth -= 1; if (depth === 0) return text.slice(open, i + 1); }
  }
  return text.slice(open);
}

function offenders(source) {
  // Comments carry example code and Vietnamese prose; strip them first so a
  // sentence about the bug is not reported as the bug.
  const text = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
  const found = [];
  for (const match of text.matchAll(/\bwatch(Effect)?\s*\(/g)) {
    const start = match.index;
    const call = callSpan(text, text.indexOf('(', start));
    const runsNow = match[1] === 'Effect' || /\bimmediate\s*:\s*true\b/.test(call);
    if (!runsNow) continue;
    for (const use of new Set([...call.matchAll(/\b([A-Za-z_$][\w$]*)\.value\b/g)].map(m => m[1]))) {
      const declaration = text.search(new RegExp(`\\b(?:const|let)\\s+${use}\\b`));
      if (declaration !== -1 && declaration > start) found.push({ name: use, at: start });
    }
  }
  return found;
}

test('no immediate watcher reads a binding declared below it', async () => {
  const files = await sources(new URL('../src', import.meta.url).pathname);
  assert.ok(files.length > 50, `expected to scan the app, found ${files.length} files`);
  const broken = [];
  for (const file of files) {
    const hits = offenders(await readFile(file, 'utf8'));
    for (const hit of hits) broken.push(`${file.replace(/.*\/src\//, 'src/')}: '${hit.name}'`);
  }
  assert.deepEqual(broken, [],
    'these run during setup() and would throw "Cannot access X before initialization"');
});

test('the check itself catches the shape it is meant to catch', async () => {
  // Guarding the guard: a scanner that never fires is indistinguishable from one
  // that is broken, and this one is pure text matching.
  const bad = `const a=computed(()=>1)
watch(()=>props.open,()=>{touched.value=false},{immediate:true})
const touched=ref(false)`;
  assert.deepEqual(offenders(bad).map(x => x.name), ['touched']);

  const good = `const touched=ref(false)
watch(()=>props.open,()=>{touched.value=false},{immediate:true})`;
  assert.deepEqual(offenders(good), []);

  // A deferred watcher is fine: by the time it fires, setup() has finished.
  const deferred = `watch(()=>props.open,()=>{touched.value=false})
const touched=ref(false)`;
  assert.deepEqual(offenders(deferred), []);

  // watchEffect always runs immediately, so it has the same hazard.
  assert.deepEqual(offenders(`watchEffect(()=>{later.value=1})
const later=ref(0)`).map(x => x.name), ['later']);
});
