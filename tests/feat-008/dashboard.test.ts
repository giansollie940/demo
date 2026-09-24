import { test, expect, vi, afterEach } from 'vitest';
import { h } from 'vue';
import { mount, settle, textOf, findAll, click } from '../bug-001/renderer';

const api = vi.hoisted(() => ({
  storageStatus: vi.fn(),
  refreshStorage: vi.fn(),
  cleanupPendingMedia: vi.fn(),
  setStorageCapacity: vi.fn(),
  measureProviders: vi.fn(),
}));
const live = vi.hoisted(() => ({ change: null as null | ((r2:boolean)=>void), status: null as null | ((s:string)=>void), stop: vi.fn() }));
vi.mock('../../src/features/storage/live', () => ({subscribeStorageChanges: vi.fn(async (change:any,status:any) => {live.change=change;live.status=status;return live.stop})}));
vi.mock('../../src/features/storage/api', async () => {
  const actual = await vi.importActual<typeof import('../../src/features/storage/api')>('../../src/features/storage/api');
  return { ...actual, ...api };
});
vi.mock('../../src/stores/context', () => ({ useContextStore: () => ({ schoolYears: [{ id: 'year-1', name: '2025–2026' }] }) }));
const session = vi.hoisted(() => ({ currentUser: { role: 'admin' } as { role: string } | null }));
vi.mock('../../src/stores/auth', () => ({ useAuthStore: () => ({ get currentUser() { return session.currentUser; } }) }));
// The shared dialog needs its host component mounted; these tests are about the
// dashboard's own wording, so confirmation is answered "yes" straight away.
vi.mock('../../src/features/shared/app-dialog', () => ({
  appDialog: { confirm: vi.fn(async () => true), prompt: vi.fn(async () => null) },
}));

const module = await import('../../src/components/admin/AdminStorageHealth.vue').catch(() => ({ default: null }));
let app: any;
afterEach(() => { app?.unmount(); app = null; vi.useRealTimers(); vi.unstubAllGlobals(); session.currentUser = { role: 'admin' }; vi.clearAllMocks(); });

const provider = (over: Record<string, unknown> = {}) => ({
  configured_bytes: 1000, note: null, total_bytes: 500, metadata_bytes: 500, active_bytes: 400,
  pending_bytes: 100, deleting_bytes: 0, media_count: 3, provider_bytes: null, provider_measured_at: null,
  measured_at: '2026-09-17T00:00:00Z', source: 'metadata', provider_stale: false, percent: 50, stale: false, level: 'normal', ...over,
});
const state = (over: Record<string, unknown> = {}) => ({
  providers: { database: provider(), r2: provider() },
  flags: { protection_mode: false, r2_upload_locked: false },
  measured_at: '2026-09-17T00:00:00Z', candidates: [], ...over,
});

async function render(value: ReturnType<typeof state>) {
  api.storageStatus.mockResolvedValue(value);
  api.refreshStorage.mockResolvedValue(value);
  api.measureProviders.mockResolvedValue({ state: value, r2: { ok: true } });
  const view = mount({ render: () => h(module.default!, {}) });
  app = view.app; await settle(); await settle();
  return view;
}

test('protection mode is explained as a capacity hold, and names what still works', async () => {
  expect(module.default).toBeTruthy();
  const view = await render(state({
    providers: { database: provider({ percent: 97, level: 'critical' }), r2: provider() },
    flags: { protection_mode: true, r2_upload_locked: false },
  }));
  const text = textOf(view.root);
  expect(text).toContain('chế độ bảo vệ dung lượng');
  // F8-RB-004: it must not read as a permission problem, and must say what is
  // still available so Admin does not think the app is down.
  expect(text).not.toMatch(/không có quyền|permission/i);
  expect(text).toContain('Bài dạng chữ');
  expect(text).toContain('Không thể tắt thủ công');
});

test('R2 at critical locks only images and says so', async () => {
  const view = await render(state({
    providers: { database: provider(), r2: provider({ percent: 96, level: 'critical' }) },
    flags: { protection_mode: false, r2_upload_locked: true },
  }));
  const text = textOf(view.root);
  expect(text).toContain('khoá ảnh mới');
  expect(text).toContain('ảnh cũ vẫn xem được');
  expect(text).not.toContain('chế độ bảo vệ dung lượng');
});

test('an unconfigured provider shows as unconfigured, never as 0%', async () => {
  const view = await render(state({
    providers: {
      database: provider({ configured_bytes: null, percent: null, level: 'unconfigured' }),
      r2: provider(),
    },
  }));
  const text = textOf(view.root);
  expect(text).toContain('Chưa đặt dung lượng');
  // \b so this does not accidentally match the healthy provider's "50.0%".
  expect(text).not.toMatch(/\b0\.0%/);
  // The unknown provider shows a placeholder where its percentage would be.
  expect(text).toContain('Chưa đặt dung lượng—');
  expect(text).toContain('không hiện phần trăm');
});

test('70% and 85% warn without claiming anything is locked', async () => {
  for (const [percent, level, expected] of [[72, 'info', 'Đã vượt 70%'], [88, 'warning', 'Đã vượt 85%']] as const) {
    const view = await render(state({ providers: { database: provider({ percent, level }), r2: provider() } }));
    const text = textOf(view.root);
    expect(text).toContain(expected);
    // A warning must not claim anything is already withheld — that only happens
    // at 95%, and an Admin who reads "locked" at 85% may delete data in a panic.
    expect(text).not.toMatch(/đã khoá|tạm khoá/);
    app?.unmount(); app = null;
  }
});

test('every number declares where it came from, and a metadata R2 figure admits it can undercount', async () => {
  const view = await render(state({
    providers: { database: provider(), r2: provider({ source: 'metadata' }) },
  }));
  const text = textOf(view.root);
  expect(text).toContain('ứng dụng tự cộng');
  expect(text).toContain('có thể thiếu các tệp trong kho');
});

test('a failed R2 read keeps the dashboard on database numbers instead of blanking it', async () => {
  const view = await render(state());
  api.measureProviders.mockRejectedValue(new Error('R2_USAGE_UNAVAILABLE'));
  await click(view.root, 'Hỏi kho ảnh');
  await settle();
  const text = textOf(view.root);
  // Both provider cards are still there; a storage dashboard that blanks out
  // when the provider is unreachable is useless exactly when it is needed.
  expect(text).toContain('Cơ sở dữ liệu Supabase');
  expect(text).toContain('Kho ảnh Cloudflare R2');
  expect(findAll(view.root, n => n.type === 'button').length).toBeGreaterThan(0);
});

test('a stale provider reading is called out, not silently left driving the number', async () => {
  const view = await render(state({
    providers: {
      database: provider(),
      // The effective percentage came from metadata because the R2 answer aged out.
      r2: provider({ percent: 97, level: 'critical', source: 'metadata', provider_bytes: 800, provider_stale: true }),
    },
    flags: { protection_mode: false, r2_upload_locked: true },
  }));
  const text = textOf(view.root);
  expect(text).toContain('ứng dụng tự cộng');
  expect(text).toContain('Số của Cloudflare R2 đã quá cũ');
  // The label must not claim the provider drove a number it did not.
  expect(text).not.toContain('nhà cung cấp báo về');
});

// ── Sol RC2 P1 ───────────────────────────────────────────────────────────────

test('bytes queued for purge are shown as still in use, not as space already freed', async () => {
  const view = await render(state({
    providers: { database: provider(), r2: provider({ deleting_bytes: 200, percent: 96, level: 'critical' }) },
    flags: { protection_mode: false, r2_upload_locked: true },
  }));
  const text = textOf(view.root);
  expect(text).toContain('Đang chờ xoá');
  // The point of the line: queued is not deleted, so the percentage has not moved.
  expect(text).toContain('xếp hàng xoá chưa phải là đã xoá');
});

test('after a cleanup Admin is told the number will not move until R2 is asked again', async () => {
  const view = await render(state({
    providers: { database: provider(), r2: provider({ percent: 96, level: 'critical', source: 'provider', provider_bytes: 960 }) },
    flags: { protection_mode: false, r2_upload_locked: true },
  }));
  api.cleanupPendingMedia.mockResolvedValue({ queued: 1 });
  await click(view.root, 'Dọn ảnh chờ quá hạn');
  await settle(); await settle();
  const text = textOf(view.root);
  expect(text).toContain('Đã xếp 1 ảnh chờ vào hàng xoá');
  // "Hỏi kho ảnh" is also a button label, so assert the sentence, not the phrase.
  expect(text).toContain('Số dung lượng chưa giảm ngay');
  expect(text).toContain('tiến trình nền');
  // It must not imply space is already back.
  expect(text).not.toMatch(/đã giải phóng|đã xoá xong/);
  expect(api.storageStatus).toHaveBeenCalledTimes(2);
});

// FEAT-012: exercise the mounted component and its browser lifecycle rather
// than merely asserting that it contains a timer in the source.
function browser() {
  const windowListeners = new Map<string, () => void>();
  const documentListeners = new Map<string, () => void>();
  const page = { visibilityState: 'visible', addEventListener: (event: string, fn: () => void) => documentListeners.set(event, fn), removeEventListener: (event: string) => documentListeners.delete(event) };
  vi.stubGlobal('document', page);
  vi.stubGlobal('window', { addEventListener: (event: string, fn: () => void) => windowListeners.set(event, fn), removeEventListener: (event: string) => windowListeners.delete(event) });
  return { page, windowListeners, documentListeners };
}


test('no periodic reads; bursts of server changes cause one fresh read', async () => {
 vi.useFakeTimers();browser();await render(state());
 await vi.advanceTimersByTimeAsync(600_000);
 expect(api.storageStatus).toHaveBeenCalledTimes(1);
 live.change?.(false);live.change?.(false);live.change?.(false);
 await vi.advanceTimersByTimeAsync(1300);await settle();
 expect(api.storageStatus).toHaveBeenCalledTimes(2);
 expect(api.refreshStorage).toHaveBeenCalledTimes(2);
 expect(api.measureProviders).toHaveBeenCalledTimes(1);
 live.change?.(true);
 await vi.advanceTimersByTimeAsync(1300);await settle();
 expect(api.measureProviders).toHaveBeenCalledTimes(2);
});
test('hidden page defers changes; visibility restores fresh data', async () => {
 vi.useFakeTimers();const env=browser();await render(state());
 env.page.visibilityState='hidden';live.change?.(true);
 await vi.advanceTimersByTimeAsync(10_000);
 expect(api.storageStatus).toHaveBeenCalledTimes(1);
 env.page.visibilityState='visible';env.documentListeners.get('visibilitychange')?.();
 await vi.advanceTimersByTimeAsync(1300);await settle();
 expect(api.storageStatus).toHaveBeenCalledTimes(2);
 app.unmount();app=null;expect(live.stop).toHaveBeenCalled();
});
test('events during in-flight reads are coalesced and retried once after completion', async () => {
 vi.useFakeTimers();browser();await render(state());
 let finish!:(v:unknown)=>void;
 api.refreshStorage.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve}));
 live.change?.(false);await vi.advanceTimersByTimeAsync(1300);
 live.change?.(true);await vi.advanceTimersByTimeAsync(1300);
 expect(api.refreshStorage).toHaveBeenCalledTimes(2);
 finish(state());await settle();
 await vi.advanceTimersByTimeAsync(1300);await settle();
 expect(api.refreshStorage).toHaveBeenCalledTimes(3);
 expect(api.measureProviders).toHaveBeenCalledTimes(2);
});
test('errors retain data and do not start a retry loop; reconnect catches up', async () => {
 vi.useFakeTimers();browser();const view=await render(state());
 api.refreshStorage.mockRejectedValueOnce(new Error('Offline'));
 live.change?.(false);await vi.advanceTimersByTimeAsync(1300);await settle();
 expect(textOf(view.root)).toContain('Offline');
 await vi.advanceTimersByTimeAsync(600_000);
 expect(api.refreshStorage).toHaveBeenCalledTimes(2);
 live.status?.('SUBSCRIBED');await vi.advanceTimersByTimeAsync(1300);await settle();
 expect(api.refreshStorage).toHaveBeenCalledTimes(3);
});
test('unmount while measuring prevents subsequent network calls', async () => {
 vi.useFakeTimers();browser();await render(state());
 let finish!:(v:unknown)=>void;
 api.refreshStorage.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve}));
 live.change?.(true);await vi.advanceTimersByTimeAsync(1300);
 app.unmount();app=null;finish(state());await settle();
 expect(api.storageStatus).toHaveBeenCalledTimes(1);
});
test('non Admin cannot initiate measurement or provider calls', async () => {
 vi.useFakeTimers();browser();session.currentUser={role:'teacher'};await render(state());
 await vi.advanceTimersByTimeAsync(600_000);
 expect(api.refreshStorage).not.toHaveBeenCalled();expect(api.measureProviders).not.toHaveBeenCalled();
});
