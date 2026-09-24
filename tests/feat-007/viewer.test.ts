import { test, expect, vi, afterEach } from 'vitest';
import { h } from 'vue';
import { mount, settle, textOf, findAll, click } from '../bug-001/renderer';
import { zipSync } from 'fflate';
import {
  ARCHIVE_FORMAT_VERSION, CHECKSUMS_FILE, ENTITY_FILES, MANIFEST_FILE,
  buildChecksumsFile, encodeText, sha256Hex,
} from '../../src/features/archive/format';

const api = vi.hoisted(() => ({
  listArchives: vi.fn(), preflightYear: vi.fn(), beginArchive: vi.fn(), exportEntity: vi.fn(),
  signMediaPage: vi.fn(), reportMedia: vi.fn(), completeArchive: vi.fn(), confirmDownload: vi.fn(),
  setYearReadOnly: vi.fn(), beginPurge: vi.fn(), purgeStep: vi.fn(), purgeStatus: vi.fn(),
}));
vi.mock('../../src/features/archive/api', async () => {
  const actual = await vi.importActual<typeof import('../../src/features/archive/api')>('../../src/features/archive/api');
  return { ...actual, ...api };
});
vi.mock('../../src/stores/context', () => ({
  useContextStore: () => ({ schoolYears: [{ id: 'year-1', name: '2026-2027' }] }),
}));
vi.mock('../../src/features/shared/app-dialog', () => ({
  appDialog: { confirm: vi.fn(async () => true), prompt: vi.fn(async () => 'kết thúc năm học') },
}));

const AdminArchive = (await import('../../src/components/admin/AdminArchive.vue')).default;
const ArchiveViewer = (await import('../../src/components/admin/ArchiveViewer.vue')).default;

let app: any;
afterEach(() => { app?.unmount(); vi.clearAllMocks(); });

const archiveRow = (over: Record<string, unknown> = {}) => ({
  id: 'arc-1', school_year_id: 'year-1', school_year_name: '2026-2027',
  archive_format_version: ARCHIVE_FORMAT_VERSION, status: 'verified', counts: { notices: 12 },
  media_count: 3, media_bytes: 900000, archive_size_bytes: 1200000, checksum: 'a'.repeat(64),
  failure_reason: null, created_at: '2026-09-18T00:00:00Z', created_by: 'admin',
  verified_at: '2026-09-18T00:05:00Z', download_confirmed_at: null, purge_reason: null,
  purge_started_at: null, purged_at: null, purged_by: null, ...over,
});

const preflight = (over: Record<string, unknown> = {}) => ({
  school_year_id: 'year-1', school_year_name: '2026-2027', is_active: false, archive_state: 'active',
  counts: { classes: 1, notices: 12, media: 3 }, media_bytes: 900000, blockers: [], archives: [], ...over,
});

async function renderAdmin(rows = [archiveRow()], pre = preflight()) {
  api.listArchives.mockResolvedValue({ archives: rows });
  api.preflightYear.mockResolvedValue(pre);
  const view = mount({ render: () => h(AdminArchive, {}) });
  app = view.app; await settle(); await settle(); await settle();
  return view;
}

test('AC-709 the two-copy recommendation is stated plainly and is not a hard gate', async () => {
  const view = await renderAdmin();
  const text = textOf(view.root);
  expect(text).toContain('hai bản ở hai nơi khác nhau');
  // RB-719: the archive is sensitive data and the screen says so.
  expect(text).toContain('nhạy cảm');
  expect(text).toContain('Đừng chia sẻ công khai');
  // But nothing asks the Admin to prove a second copy exists.
  expect(text).not.toMatch(/nhập đường dẫn bản sao|xác minh bản sao thứ hai/);
});

test('AC-707/AC-708 the purge button does not exist until the saved file has been re-opened', async () => {
  const view = await renderAdmin([archiveRow({ download_confirmed_at: null })]);
  const labels = findAll(view.root, node => node.type === 'button').map(node => textOf(node));
  expect(labels.some(label => label.includes('Xoá dữ liệu cloud'))).toBe(false);
  expect(textOf(view.root)).toContain('Hãy mở lại tệp ZIP đã lưu');

  app?.unmount(); app = null;
  const ready = await renderAdmin([archiveRow({ download_confirmed_at: '2026-09-18T01:00:00Z' })]);
  const readyLabels = findAll(ready.root, node => node.type === 'button').map(node => textOf(node));
  expect(readyLabels.some(label => label.includes('Xoá dữ liệu cloud'))).toBe(true);
});

test('a failed or still-building archive offers neither locking nor purging', async () => {
  for (const status of ['building', 'failed'] as const) {
    const view = await renderAdmin([archiveRow({ status, download_confirmed_at: '2026-09-18T01:00:00Z' })]);
    const labels = findAll(view.root, node => node.type === 'button').map(node => textOf(node));
    expect(labels.some(label => label.includes('Xoá dữ liệu cloud'))).toBe(false);
    expect(labels.some(label => label.includes('Khoá năm học'))).toBe(false);
    app?.unmount(); app = null;
  }
});

test('RB-702 a blocked year explains what to fix and cannot start a run', async () => {
  const view = await renderAdmin([], preflight({ blockers: [{ code: 'pending_media', detail: 4 }] }));
  const text = textOf(view.root);
  expect(text).toContain('Chưa đóng gói được');
  expect(text).toContain('4');
  expect(text).toContain('chưa gắn vào bài nào');
  const button = findAll(view.root, node => node.type === 'button').find(node => textOf(node).includes('Đóng gói'));
  expect(button?.props?.disabled ?? button?.el?.disabled).toBeTruthy();
});

test('an in-progress purge offers to resume rather than to start again', async () => {
  const view = await renderAdmin([archiveRow({ status: 'purging', download_confirmed_at: '2026-09-18T01:00:00Z' })]);
  const labels = findAll(view.root, node => node.type === 'button').map(node => textOf(node));
  expect(labels.some(label => label.includes('Tiếp tục xoá'))).toBe(true);
  expect(labels.some(label => label.includes('Xoá dữ liệu cloud'))).toBe(false);
});

test('AC-712/AC-713 a purged archive still shows its summary and no purged content', async () => {
  const view = await renderAdmin([archiveRow({
    status: 'purged', download_confirmed_at: '2026-09-18T01:00:00Z',
    purged_at: '2026-09-18T02:00:00Z', purge_reason: 'kết thúc năm học',
  })]);
  const text = textOf(view.root);
  expect(text).toContain('Đã xoá cloud');
  expect(text).toContain('kết thúc năm học');
  expect(text).toContain('3 ảnh');
  const labels = findAll(view.root, node => node.type === 'button').map(node => textOf(node));
  expect(labels.some(label => label.includes('Xoá dữ liệu cloud'))).toBe(false);
});

// ── Viewer ───────────────────────────────────────────────────────────────────

const IMAGE_PATH = 'media/aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa.webp';
const imageBytes = Uint8Array.from({ length: 48 }, (_, i) => (i * 5 + 3) % 251);

async function makeZip(over: Record<string, Uint8Array> = {}) {
  const notices = encodeText(JSON.stringify([{ id: 'n1', title: 'Bài tập Toán', content: 'Trang 10', status: 'published' }]));
  const members: Record<string, Uint8Array> = {
    [ENTITY_FILES.homework_notices]: notices,
    [ENTITY_FILES.media_index]: encodeText(JSON.stringify([{ attachment_id: 'a1', archive_path: IMAGE_PATH, size_bytes: 48 }])),
    [IMAGE_PATH]: imageBytes,
    ...over,
  };
  const manifest = encodeText(JSON.stringify({
    archive_format_version: ARCHIVE_FORMAT_VERSION, app_version: '8.8.0', archive_id: 'arc-1',
    school_year_id: 'year-1', school_year_name: '2026-2027', created_at: '2026-09-18T00:00:00Z',
    created_by: 'admin', created_by_name: 'Admin', checksum_algorithm: 'sha-256',
    record_counts: { homework_notices: 1 }, media_count: 0, media_bytes: 0, files: [],
    schema: { migration: '12', entities: ENTITY_FILES },
  }));
  members[MANIFEST_FILE] = manifest;
  const checks = [] as Array<{ path: string; checksum: string }>;
  for (const [path, bytes] of Object.entries(members)) checks.push({ path, checksum: await sha256Hex(bytes) });
  members[CHECKSUMS_FILE] = encodeText(buildChecksumsFile(checks));
  return zipSync(members);
}

async function openViewerWith(bytes: Uint8Array) {
  const view = mount({ render: () => h(ArchiveViewer, {}) });
  app = view.app;
  await settle();
  const input = findAll(view.root, node => node.type === 'input' && node.props?.type === 'file')[0];
  const file = { arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
  await input.props.onChange({ target: { files: [file], value: '' } });
  await settle(); await settle();
  return view;
}

test('AC-717 the viewer flies the read-only banner as soon as an archive is open', async () => {
  const view = await openViewerWith(await makeZip());
  const text = textOf(view.root);
  expect(text).toContain('DỮ LIỆU LƯU TRỮ — CHỈ XEM');
  expect(text).toContain('2026-2027');
  expect(text).toContain('không gửi gì lên máy chủ');
});

test('AC-718 the viewer offers no action that changes anything', async () => {
  const view = await openViewerWith(await makeZip());
  const labels = findAll(view.root, node => node.type === 'button').map(node => textOf(node));
  for (const forbidden of ['Sửa', 'Xoá', 'Thả tim', 'Báo lỗi', 'Nhắc', 'Gửi', 'Tải lên', 'Khôi phục', 'Duyệt'])
    expect(labels.some(label => label.includes(forbidden))).toBe(false);
  // What it does offer is reading, filtering and taking a copy away.
  expect(labels.some(label => label.includes('Xuất CSV'))).toBe(true);
});

test('AC-714 the viewer reads the file without calling the server', async () => {
  const view = await openViewerWith(await makeZip());
  expect(textOf(view.root)).toContain('Bài tập Toán');
  for (const call of Object.values(api)) expect(call).not.toHaveBeenCalled();
});

test('AC-720 a tampered archive is shown as failing verification, not quietly displayed', async () => {
  const bytes = await makeZip();
  const { unzipSync } = await import('fflate');
  const members = unzipSync(bytes);
  members[ENTITY_FILES.homework_notices] = encodeText(JSON.stringify([{ id: 'n1', title: 'Đã bị sửa' }]));
  const view = await openViewerWith(zipSync(members));
  const text = textOf(view.root);
  expect(text).toContain('KHÔNG khớp checksum');
  expect(text).toContain('không khớp checksum');
});

test('AC-719 an archive from a newer format is refused with a reason a person can act on', async () => {
  const bytes = await makeZip();
  const { unzipSync } = await import('fflate');
  const members = unzipSync(bytes);
  const manifest = JSON.parse(new TextDecoder().decode(members[MANIFEST_FILE]));
  members[MANIFEST_FILE] = encodeText(JSON.stringify({ ...manifest, archive_format_version: '9.0' }));
  const checks: Array<{ path: string; checksum: string }> = [];
  for (const [path, member] of Object.entries(members)) if (path !== CHECKSUMS_FILE) checks.push({ path, checksum: await sha256Hex(member) });
  members[CHECKSUMS_FILE] = encodeText(buildChecksumsFile(checks));
  const view = await openViewerWith(zipSync(members));
  const text = textOf(view.root);
  expect(text).toContain('9.0');
  expect(text).toContain('1.x');
  // And it shows nothing from inside the file it refused to interpret.
  expect(text).not.toContain('Bài tập Toán');
});

// ── Sol RC1 P2 ───────────────────────────────────────────────────────────────
// The confirmation that unlocks purge must be based on a verdict that covered
// the images, not only the text members.

async function renderPair(zipBytes: Uint8Array, row = archiveRow()) {
  api.listArchives.mockResolvedValue({ archives: [row] });
  api.preflightYear.mockResolvedValue(preflight());
  const view = mount({ render: () => h(AdminArchive, {}) });
  app = view.app; await settle(); await settle(); await settle();
  const input = findAll(view.root, node => node.type === 'input' && node.props?.type === 'file')[0];
  const file = { arrayBuffer: async () => zipBytes.buffer.slice(zipBytes.byteOffset, zipBytes.byteOffset + zipBytes.byteLength) };
  await input.props.onChange({ target: { files: [file], value: '' } });
  await settle(); await settle(); await settle();
  return view;
}

test('RC1 P2 — a saved file missing an image never reaches confirm_download', async () => {
  const bytes = await makeZip();
  const { unzipSync } = await import('fflate');
  const members = unzipSync(bytes);
  delete members[IMAGE_PATH];
  const view = await renderPair(zipSync(members));
  expect(api.confirmDownload).not.toHaveBeenCalled();
  expect(textOf(view.root)).toContain('KHÔNG khớp checksum');
  // And the purge button is still absent.
  const labels = findAll(view.root, node => node.type === 'button').map(node => textOf(node));
  expect(labels.some(label => label.includes('Xoá dữ liệu cloud'))).toBe(false);
});

test('RC1 P2 — a saved file with a swapped image never reaches confirm_download', async () => {
  const bytes = await makeZip();
  const { unzipSync } = await import('fflate');
  const members = unzipSync(bytes);
  members[IMAGE_PATH] = Uint8Array.from({ length: 48 }, () => 9);
  await renderPair(zipSync(members));
  expect(api.confirmDownload).not.toHaveBeenCalled();
});

test('RC1 P2 — an intact saved file does confirm, and only then', async () => {
  api.confirmDownload.mockResolvedValue({});
  await renderPair(await makeZip());
  expect(api.confirmDownload).toHaveBeenCalledTimes(1);
  expect(api.confirmDownload.mock.calls[0][0]).toBe('arc-1');
  expect(api.confirmDownload.mock.calls[0][1]).toMatch(/^[a-f0-9]{64}$/);
});

test('RC1 P2 — the viewer says how many images it checked, not just how many files', async () => {
  const view = await openViewerWith(await makeZip());
  expect(textOf(view.root)).toMatch(/1 ảnh/);
});
