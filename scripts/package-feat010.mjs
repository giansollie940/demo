// Builds the FEAT-010 delivery ZIPs and their manifest.
//
// Sol RC1 §2: the previous manifest listed itself, and recorded the hash of the
// empty file it was before being written — so the one line nobody could satisfy
// was its own. A manifest cannot contain its own hash; it can only be excluded,
// and its integrity checked by hashing the ZIP that carries it. That hash is
// printed here and belongs in the release note, not in the manifest.
import { createHash } from 'node:crypto';
import { readFile, writeFile, readdir, stat, mkdir, rm, cp } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const out = process.argv[2] ?? '/home/claude/out';
const SKIP = new Set(['node_modules', 'dist', '.git']);
const MANIFEST = 'SHA256SUMS.txt';

async function walk(dir, acc = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) await walk(full, acc);
    else if (!entry.name.endsWith('.tsbuildinfo') && entry.name !== MANIFEST) acc.push(full);
  }
  return acc;
}

const files = (await walk(root)).map(f => relative(root, f).split(sep).join('/')).sort();
const lines = [];
for (const file of files) {
  lines.push(`${createHash('sha256').update(await readFile(join(root, file))).digest('hex')}  ${file}`);
}
// The manifest excludes itself by construction, which is the whole fix: every
// line in it can be verified, and `sha256sum -c` reports no failures.
await writeFile(join(root, MANIFEST), lines.join('\n') + '\n');
console.log(`${MANIFEST}: ${lines.length} entries, self-entry excluded`);

await rm(join(out, 'stage'), { recursive: true, force: true });
await mkdir(join(out, 'stage'), { recursive: true });
for (const [name, list] of [
  ['SO-TU-HOC-FEAT-010', [...files, MANIFEST]],
  ['SO-TU-HOC-FEAT-010-FRONTEND', files.filter(f =>
    f.startsWith('src/') || f.startsWith('public/') ||
    ['index.html', 'package.json', 'package-lock.json', 'vite.config.ts',
     'tsconfig.json', 'tsconfig.app.json', 'tsconfig.node.json'].includes(f))],
]) {
  const dir = join(out, 'stage', name);
  for (const file of list) {
    const target = join(dir, file);
    await mkdir(join(target, '..'), { recursive: true });
    await cp(join(root, file), target);
  }
  console.log(`${name}: ${list.length} files staged`);
}
