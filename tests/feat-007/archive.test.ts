import { test, expect } from 'vitest';
import { buildArchive, ArchiveIncomplete, type BuilderPorts } from '../../src/features/archive/builder';
import { createZipWriter, createMemorySink } from '../../src/features/archive/zip-sink';
import { openArchive, ArchiveRejected } from '../../src/features/archive/reader';
import {
  ARCHIVE_FORMAT_VERSION, CHECKSUMS_FILE, ENTITY_FILES, MANIFEST_FILE,
  buildChecksumsFile, decodeText, encodeText, parseChecksumsFile, safeArchivePath, sha256Hex, versionSupport,
} from '../../src/features/archive/format';
import { zipSync, unzipSync } from 'fflate';

const ARCHIVE_ID = '11111111-1111-4111-8111-111111111111';
const YEAR_ID = '22222222-2222-4222-8222-222222222222';
const IMAGE_A = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
const IMAGE_B = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb';

const image = (seed: number) => Uint8Array.from({ length: 64 }, (_, i) => (i * 7 + seed) % 251);

/** A server that behaves: it checks reported hashes the way migration 12 does. */
function makePorts(over: Partial<BuilderPorts> = {}, objects = new Map([[IMAGE_A, image(1)], [IMAGE_B, image(2)]])) {
  const reported = new Map<string, { checksum: string; bytes: number }>();
  const ports: BuilderPorts & { reported: typeof reported; completed: unknown[] } = {
    reported,
    completed: [],
    appVersion: '8.8.0',
    actorName: 'Admin',
    now: () => '2026-09-18T00:00:00.000Z',
    async beginArchive() {
      return {
        id: ARCHIVE_ID, school_year_id: YEAR_ID, school_year_name: '2026-2027',
        archive_format_version: ARCHIVE_FORMAT_VERSION, status: 'building', counts: {},
        media_count: objects.size, media_bytes: 128, archive_size_bytes: null, checksum: null,
        failure_reason: null, created_at: '2026-09-18T00:00:00.000Z', created_by: 'admin-id',
        verified_at: null, download_confirmed_at: null, purge_reason: null, purge_started_at: null,
        purged_at: null, purged_by: null,
      } as never;
    },
    async exportEntity(_id, entity) {
      if (entity === 'homework_notices') return { rows: [{ id: 'n1', title: 'Bài tập', content: 'Trang 10' }] };
      if (entity === 'media_index') return { rows: [...objects.keys()].map(id => ({ attachment_id: id, archive_path: `media/${id}.webp` })) };
      return { rows: [] };
    },
    async signMediaPage() {
      return { items: [...objects.keys()].map(id => ({ attachment_id: id, archive_path: `media/${id}.webp`, size_bytes: 64, url: `r2://${id}` })), next: null };
    },
    async fetchBytes(url) {
      const found = objects.get(url.replace('r2://', ''));
      if (!found) throw new Error('404');
      return found;
    },
    async reportMedia(_id, items) { for (const item of items) reported.set(item.attachment_id, { checksum: item.checksum, bytes: item.bytes }); return {}; },
    async completeArchive(_id, checksum, size) {
      ports.completed.push({ checksum, size });
      // The real server fails the run unless every object was reported and every
      // reported hash matches what it recorded. Mirrored here so the test proves
      // the builder reports the truth rather than that the mock is forgiving.
      const allReported = [...objects.keys()].every(id => reported.has(id));
      const allMatch = await Promise.all([...objects.entries()].map(async ([id, bytes]) =>
        reported.get(id)?.checksum === await sha256Hex(bytes)));
      const ok = allReported && allMatch.every(Boolean);
      return {
        id: ARCHIVE_ID, status: ok ? 'verified' : 'failed', checksum, archive_size_bytes: size,
        failure_reason: ok ? null : 'media_missing', school_year_name: '2026-2027',
      } as never;
    },
    ...over,
  };
  return ports;
}

async function build(ports = makePorts()) {
  const memory = createMemorySink();
  const result = await buildArchive(ports, createZipWriter(memory.sink), YEAR_ID);
  return { ...result, bytes: memory.concat(), ports };
}

test('RB-703/RB-704 a finished archive carries the manifest, every data file, the media and checksums.txt', async () => {
  const { bytes, archive } = await build();
  expect(archive.status).toBe('verified');
  const members = Object.keys(unzipSync(bytes));
  for (const file of Object.values(ENTITY_FILES)) expect(members).toContain(file);
  expect(members).toContain(MANIFEST_FILE);
  expect(members).toContain(CHECKSUMS_FILE);
  expect(members).toContain(`media/${IMAGE_A}.webp`);
  expect(members).toContain(`media/${IMAGE_B}.webp`);
});

test('AC-729/AC-704 no signed URL or credential reaches the archive', async () => {
  const { bytes } = await build();
  const all = Object.entries(unzipSync(bytes))
    .filter(([name]) => name.endsWith('.json') || name.endsWith('.txt'))
    .map(([, member]) => decodeText(member)).join('\n');
  expect(all).not.toMatch(/X-Amz-|Signature=|r2:\/\/|https?:\/\//);
  expect(all).not.toMatch(/service_role|SUPABASE_|R2_|api[_-]?key/i);
  // The index references images by their place in the ZIP, which is what makes
  // the archive readable after the bucket is emptied (BR-704/AC-716).
  const index = JSON.parse(decodeText(unzipSync(bytes)[ENTITY_FILES.media_index]));
  expect(index[0].archive_path).toMatch(/^media\/[0-9a-f-]{36}\.webp$/);
});

test('the fingerprint is the hash of checksums.txt, and checksums.txt covers everything else', async () => {
  const { bytes, fingerprint } = await build();
  const members = unzipSync(bytes);
  expect(await sha256Hex(members[CHECKSUMS_FILE])).toBe(fingerprint);
  const listed = parseChecksumsFile(decodeText(members[CHECKSUMS_FILE])).map(entry => entry.path).sort();
  const present = Object.keys(members).filter(name => name !== CHECKSUMS_FILE).sort();
  expect(listed).toEqual(present);
});

test('AC-714/AC-715 the viewer opens the file it was handed, verifies it, and reads it without a server', async () => {
  const { bytes, fingerprint } = await build();
  const urls: string[] = [], revoked: string[] = [];
  const opened = await openArchive(bytes, {
    makeObjectUrl: () => { const url = `blob:${urls.length}`; urls.push(url); return url },
    revokeObjectUrl: url => { revoked.push(url) },
  });
  expect(opened.verified).toBe(true);
  expect(opened.fingerprint).toBe(fingerprint);
  expect(opened.manifest.school_year_name).toBe('2026-2027');
  expect(opened.data.homework_notices).toHaveLength(1);
  expect((opened.data.homework_notices[0] as { title: string }).title).toBe('Bài tập');

  // AC-716/RB-717: the image comes out of the ZIP, not out of R2.
  const handle = await opened.openMedia(`media/${IMAGE_A}.webp`);
  expect(handle.url).toBe('blob:0');
  handle.revoke();
  expect(revoked).toEqual(['blob:0']);
  // AC-727: opening one image did not materialise the other.
  expect(urls).toHaveLength(1);
});

test('AC-720 a single edited byte anywhere fails verification', async () => {
  const { bytes } = await build();
  const members = unzipSync(bytes);
  const tampered = { ...members };
  tampered[ENTITY_FILES.homework_notices] = encodeText(JSON.stringify([{ id: 'n1', title: 'Đã sửa', content: 'x' }]));
  const opened = await openArchive(zipSync(tampered));
  expect(opened.verified).toBe(false);
  expect(opened.checks.find(check => check.path === ENTITY_FILES.homework_notices)).toMatchObject({ ok: false, reason: 'mismatch' });
});

test('AC-720 a swapped image fails the archive, not just the moment it is displayed', async () => {
  const { bytes } = await build();
  const members = unzipSync(bytes);
  members[`media/${IMAGE_A}.webp`] = image(99);
  const opened = await openArchive(zipSync(members), { makeObjectUrl: () => 'blob:x' });
  // The text members are intact, so an archive judged on those alone would look
  // fine. The verdict covers images, because it is what unlocks an irreversible
  // purge — waiting until someone clicks the picture is too late.
  expect(opened.verified).toBe(false);
  expect(opened.checks.find(check => check.path === `media/${IMAGE_A}.webp`)).toMatchObject({ ok: false, reason: 'mismatch' });
  // And it is still refused at display time too.
  await expect(opened.openMedia(`media/${IMAGE_A}.webp`)).rejects.toThrow(ArchiveRejected);
});

test('EC-709 an archive containing a traversal path is rejected outright', async () => {
  const { bytes } = await build();
  const members = unzipSync(bytes);
  const evil = parseChecksumsFile(decodeText(members[CHECKSUMS_FILE]));
  evil.push({ path: '../../etc/passwd', checksum: 'c'.repeat(64) });
  members[CHECKSUMS_FILE] = encodeText(buildChecksumsFile(evil));
  await expect(openArchive(zipSync(members))).rejects.toMatchObject({ code: 'unsafe_path' });
  // And the rule itself, directly.
  // `..` and `.` are ordinary-looking names to a character-class test, so they
  // are checked on their own as well as inside a path.
  for (const bad of ['../x', 'a/../b', '/etc/passwd', 'C:\\x', 'media/../x', 'a\\b', 'deep/media/x', '', 'x\0y',
    '..', '.', 'media/..', 'media/.', './x'])
    expect(safeArchivePath(bad)).toBe(false);
  for (const good of ['manifest.json', 'checksums.txt', 'media/abc-1.webp']) expect(safeArchivePath(good)).toBe(true);
});

test('AC-719/EC-708 an incompatible format version is refused with a reason', async () => {
  const { bytes } = await build();
  const members = unzipSync(bytes);
  const manifest = JSON.parse(decodeText(members[MANIFEST_FILE]));
  members[MANIFEST_FILE] = encodeText(JSON.stringify({ ...manifest, archive_format_version: '2.0' }));
  await expect(openArchive(zipSync(members))).rejects.toMatchObject({ code: 'unsupported_version' });

  expect(versionSupport('2.0').ok).toBe(false);
  expect(versionSupport('1.9').ok).toBe(false);
  expect(versionSupport('nonsense').ok).toBe(false);
  expect(versionSupport(ARCHIVE_FORMAT_VERSION).ok).toBe(true);
});

test('a file that is not an archive at all is refused before anything is parsed', async () => {
  await expect(openArchive(encodeText('this is not a zip'))).rejects.toMatchObject({ code: 'unreadable' });
  const noManifest = zipSync({ 'checksums.txt': encodeText('') });
  await expect(openArchive(noManifest)).rejects.toMatchObject({ code: 'no_manifest' });
});

test('RB-706/EC-702 an image R2 will not return makes the whole run fail', async () => {
  const objects = new Map([[IMAGE_A, image(1)], [IMAGE_B, image(2)]]);
  const ports = makePorts({
    async fetchBytes(url: string) {
      if (url.endsWith(IMAGE_B)) throw new Error('404');
      return objects.get(url.replace('r2://', ''))!;
    },
  }, objects);
  const memory = createMemorySink();
  await expect(buildArchive(ports, createZipWriter(memory.sink), YEAR_ID)).rejects.toThrow(ArchiveIncomplete);
  // The run is still reported, so the server records a failed archive rather
  // than one that stays 'building' for ever and blocks nothing.
  expect(ports.completed).toHaveLength(1);
  expect(ports.reported.has(IMAGE_B)).toBe(false);
});

test('the builder reports hashes of the bytes it received, so corrupted delivery fails the run', async () => {
  const objects = new Map([[IMAGE_A, image(1)]]);
  const ports = makePorts({ async fetchBytes() { return image(200) } }, objects);
  const memory = createMemorySink();
  const result = await buildArchive(ports, createZipWriter(memory.sink), YEAR_ID);
  expect(result.archive.status).toBe('failed');
  expect(ports.reported.get(IMAGE_A)!.checksum).toBe(await sha256Hex(image(200)));
});

test('progress is reported for every phase so a long run is not a frozen screen', async () => {
  const phases: string[] = [];
  const memory = createMemorySink();
  await buildArchive(makePorts(), createZipWriter(memory.sink), YEAR_ID, p => phases.push(p.phase));
  expect(new Set(phases)).toEqual(new Set(['data', 'media', 'sealing', 'done']));
});

// ── Sol RC1 P2 ───────────────────────────────────────────────────────────────
// RC1 verified only the text members when the archive was opened, so a saved ZIP
// with a missing or damaged image reported itself verified — and that verdict is
// what unlocks purge. Images are now part of the verdict, checked one at a time.

test('RC1 P2 — an image missing from the saved file fails verification', async () => {
  const { bytes } = await build();
  const members = unzipSync(bytes);
  delete members[`media/${IMAGE_A}.webp`];
  const opened = await openArchive(zipSync(members));
  expect(opened.verified).toBe(false);
  expect(opened.checks.find(check => check.path === `media/${IMAGE_A}.webp`)).toMatchObject({ ok: false, reason: 'missing' });
  // The other image is unaffected: the report says which one is wrong.
  expect(opened.checks.find(check => check.path === `media/${IMAGE_B}.webp`)?.ok).toBe(true);
});

test('RC1 P2 — every member listed in checksums.txt gets a verdict', async () => {
  const { bytes } = await build();
  const opened = await openArchive(bytes);
  const listed = parseChecksumsFile(decodeText(unzipSync(bytes)[CHECKSUMS_FILE])).map(entry => entry.path).sort();
  expect(opened.checks.map(check => check.path).sort()).toEqual(listed);
  expect(opened.checks.filter(check => check.path.startsWith('media/'))).toHaveLength(2);
  expect(opened.verified).toBe(true);
});

test('RC1 P2 — images are inflated one at a time, never all at once', async () => {
  const { bytes } = await build();
  let live = 0, peak = 0, calls = 0;
  const { unzip } = await import('fflate');
  await openArchive(bytes, {
    inflateMember: (source, path) => {
      calls += 1; live += 1; peak = Math.max(peak, live);
      return new Promise((resolve, reject) => {
        unzip(source, { filter: file => file.name === path }, (error, files) => {
          live -= 1;
          error || !files[path] ? reject(new Error('x')) : resolve(files[path]);
        });
      });
    },
    onProgress: () => {},
  });
  expect(calls).toBe(2);
  // Switching this loop to Promise.all would make peak 2 and this assertion fail,
  // which is the point: AC-727 is about what is held at once, not about totals.
  expect(peak).toBe(1);
});

test('RC1 P2 — verification reports progress so a long archive is not a frozen screen', async () => {
  const { bytes } = await build();
  const seen: Array<{ done: number; total: number }> = [];
  await openArchive(bytes, { onProgress: progress => seen.push({ done: progress.done, total: progress.total }) });
  expect(seen).toEqual([{ done: 1, total: 2 }, { done: 2, total: 2 }]);
});
