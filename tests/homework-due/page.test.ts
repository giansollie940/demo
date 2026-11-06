// Trang Báo bài: form chặn hạn đã qua và cảnh báo hạn sát giờ, cùng luật với máy chủ.
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { reactive } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { findAll, mount, settle, textOf, type Node } from '../bug-001/renderer';

const env = vi.hoisted(() => ({ auth: null as any, ctx: null as any, rpc: vi.fn(), submit: vi.fn() }));
vi.mock('../../src/stores/auth', () => ({ useAuthStore: () => env.auth }));
vi.mock('../../src/stores/context', () => ({ useContextStore: () => env.ctx }));
vi.mock('../../src/services/legacy-supabase', () => ({ legacyApi: { teacherListUsers: async () => ({ users: [] }) } }));
vi.mock('../../src/features/homework/api', async original => ({
  ...(await original<any>()), homeworkRpc: env.rpc, submitHomework: env.submit,
}));
import Page from '../../src/pages/HomeworkPage.vue';

const vn = (ms: number) => new Date(ms + 7 * 3600_000).toISOString().slice(0, 16); // datetime-local, giờ Việt Nam
const pastNotice = {
  id: 'old', class_id: 'a', author_id: 's', author_role: 'student', author_name: 'Học sinh', title: 'Bài cũ', content: 'Làm bài 1',
  subject_id: 'm', subject: 'Toán', status: 'published', due_at: new Date(Date.now() - 2 * 86400_000).toISOString().replace(/\d\d\.\d+Z$/, '00.000Z'),
  created_at: '2026-09-01T00:00:00Z', revision: 1,
};
const data = () => ({
  settings: { seed_threshold: 3 }, subjects: [{ id: 'm', name: 'Toán', short_name: 'Toán', icon: '📐', is_active: true, is_english: false }],
  groups: [], notices: [pastNotice], history: [pastNotice], queue: [], audit: [], trash: [], members: [], learners: [], leaderboard: [],
  notifications: [], corrections: [], reports: [], ai_settings: { semantic_duplicate_enabled: true, duplicate_review_threshold: 70, duplicate_auto_threshold: 90 },
});

let app: any;
beforeEach(() => {
  setActivePinia(createPinia());
  env.auth = reactive({ role: 'student', currentUser: { id: 's', classId: 'a' } });
  env.ctx = reactive({ selectedClassId: 'a', selectedWeekId: null, weeks: [] });
  env.rpc.mockReset().mockImplementation(async (action: string) =>
    action === 'context' ? { classes: [{ id: 'a', code: '7A', grade: 7, active: true, school_year_id: 'y' }] } : data());
  env.submit.mockReset().mockResolvedValue({ ok: true, notice: { status: 'published' } });
  vi.stubGlobal('Document', class {}); vi.stubGlobal('ShadowRoot', class {}); vi.stubGlobal('document', { activeElement: null });
});
afterEach(() => { app?.unmount(); vi.unstubAllGlobals(); });

const deadlineInput = (root: Node) => findAll(root, n => n.type === 'input' && n.props.type === 'datetime-local')[0];
const submitButton = (root: Node) => findAll(root, n => n.type === 'button' && textOf(n).trim() === 'Đăng Báo bài')[0];
const form = (root: Node) => findAll(root, n => n.type === 'form' && typeof n.props.onSubmit === 'function')[0];
async function setDeadline(root: Node, value: string) { deadlineInput(root).props['onUpdate:modelValue'](value); await settle(); }

async function openComposer() {
  const m = mount(Page); app = m.app; await settle(); await settle();
  const launch = findAll(m.root, n => n.type === 'button' && textOf(n).includes('＋ Đăng Báo bài'))[0];
  await launch.props.onClick(); await settle();
  return m.root;
}

it('hạn đã qua: báo lỗi ngay dưới ô hạn, khoá nút Đăng và không gửi lên máy chủ', async () => {
  const root = await openComposer();
  await setDeadline(root, vn(Date.now() - 3600_000));
  expect(textOf(root)).toContain('đã qua. Hạn của Báo bài phải sau thời điểm đăng');
  expect(submitButton(root).props.disabled).toBe(true);
  expect(deadlineInput(root).props['aria-invalid']).toBe(true);
  await form(root).props.onSubmit({ preventDefault() {} }); await settle();
  expect(env.submit).not.toHaveBeenCalled();
});

it('hạn còn dưới 1 giờ: cảnh báo nhưng vẫn cho đăng', async () => {
  const root = await openComposer();
  await setDeadline(root, vn(Date.now() + 20 * 60_000));
  expect(textOf(root)).toMatch(/Hạn chỉ còn \d+ phút nữa/);
  expect(submitButton(root).props.disabled).toBe(false);
});

it('hạn ở tương lai: không có cảnh báo nào', async () => {
  const root = await openComposer();
  await setDeadline(root, vn(Date.now() + 2 * 86400_000));
  expect(textOf(root)).not.toContain('đã qua');
  expect(textOf(root)).not.toContain('Hạn chỉ còn');
  expect(submitButton(root).props.disabled).toBe(false);
});

it('máy chủ từ chối hạn đã qua (đồng hồ máy lệch): hiện đúng câu của máy chủ, không thêm lời nhắc Lịch sử đăng', async () => {
  env.submit.mockRejectedValue(Object.assign(new Error('Hạn 08:30 06/11/2026 đã qua. Hạn của Báo bài phải sau thời điểm đăng (14:05 06/11/2026).'), { code: 'HOMEWORK_DUE_IN_PAST' }));
  const root = await openComposer();
  findAll(root, n => n.type === 'select')[0].props['onUpdate:modelValue']('m');
  findAll(root, n => n.type === 'input' && n.props.maxlength === '200')[0].props['onUpdate:modelValue']('Bài 5');
  findAll(root, n => n.type === 'textarea')[0].props['onUpdate:modelValue']('Làm bài 1–4');
  await setDeadline(root, vn(Date.now() + 2 * 86400_000));
  await form(root).props.onSubmit({ preventDefault() {} }); await settle(); await settle();
  expect(env.submit).toHaveBeenCalled();
  const text = textOf(root);
  expect(text).toContain('Hạn của Báo bài phải sau thời điểm đăng (14:05 06/11/2026).');
  expect(text).not.toContain('Kiểm tra Lịch sử đăng');
});
