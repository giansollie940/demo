import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { createSSRApp } from 'vue'
import { renderToString } from '@vue/server-renderer'
import HomeworkInbox from '../../src/components/homework/HomeworkInbox.vue'

const { auth, rpc } = vi.hoisted(() => ({
  auth: { currentUser: null as null | { id: string; role: string; classId: string } },
  rpc: vi.fn().mockResolvedValue([]),
}))
vi.mock('../../src/stores/auth', () => ({ useAuthStore: () => auth }))
vi.mock('../../src/stores/context', () => ({ useContextStore: () => ({ selectedClassId: 'class-1', classes: [] }) }))
vi.mock('../../src/features/homework/view-context', () => ({ useHomeworkViewStore: () => ({ refreshVersion: 0 }) }))
vi.mock('../../src/features/homework/api', () => ({ homeworkRpc: rpc }))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('document', { visibilityState: 'visible' })
  rpc.mockClear()
})
afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

test.each(['admin', 'signed-out'])('%s has no homework bell and never polls the inbox', async role => {
  auth.currentUser = role === 'admin' ? { id: 'admin-1', role, classId: 'class-1' } : null
  const html = await renderToString(createSSRApp(HomeworkInbox))
  expect(html).not.toContain('Thông báo Báo bài')
  await vi.advanceTimersByTimeAsync(120000)
  expect(rpc).not.toHaveBeenCalled()
})

test.each(['student', 'monitor', 'teacher'])('%s retains the homework bell and inbox polling', async role => {
  auth.currentUser = { id: `${role}-1`, role, classId: 'class-1' }
  const html = await renderToString(createSSRApp(HomeworkInbox))
  expect(html).toContain('Thông báo Báo bài')
  expect(rpc).toHaveBeenCalledWith('inbox', 'class-1')
  await vi.advanceTimersByTimeAsync(60000)
  expect(rpc).toHaveBeenCalledTimes(2)
})
