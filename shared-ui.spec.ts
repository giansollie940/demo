import { h } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { describe, expect, it } from 'vitest'
import AppTabs from '../../src/components/ui/AppTabs.vue'
import ConfirmDialog from '../../src/components/ui/ConfirmDialog.vue'
import InlineStatus from '../../src/components/ui/InlineStatus.vue'

describe('AppTabs', () => {
  it('renders real tab semantics and marks the active tab', async () => {
    const html = await renderToString(h(AppTabs, {
      modelValue: 'default',
      label: 'Chế độ thời khóa biểu',
      items: [
        { id: 'default', label: 'TKB mặc định' },
        { id: 'week', label: 'TKB riêng · Tuần 12' },
      ],
    }))
    expect(html).toContain('role="tablist"')
    expect(html).toContain('aria-label="Chế độ thời khóa biểu"')
    expect(html).toContain('aria-selected="true"')
    expect(html).toContain('TKB mặc định')
    expect(html).toContain('TKB riêng · Tuần 12')
  })
})

describe('ConfirmDialog', () => {
  it('renders nothing while closed and specific actions while open', async () => {
    expect(await renderToString(h(ConfirmDialog, { open: false }))).not.toContain('role="alertdialog"')
    const html = await renderToString(h(ConfirmDialog, {
      open: true,
      title: 'Xóa TKB riêng?',
      body: 'Tuần này sẽ quay về TKB mặc định.',
      confirmLabel: 'Dùng lại TKB mặc định',
      cancelLabel: 'Giữ TKB riêng',
      danger: true,
    }))
    expect(html).toContain('role="alertdialog"')
    expect(html).toContain('aria-modal="true"')
    expect(html).toContain('Dùng lại TKB mặc định')
    expect(html).toContain('Giữ TKB riêng')
  })
})

describe('InlineStatus', () => {
  it('uses status semantics for saving and alert semantics for errors', async () => {
    const saving = await renderToString(h(InlineStatus, { state: 'saving', message: 'Đang lưu…' }))
    expect(saving).toContain('role="status"')
    expect(saving).toContain('Đang lưu…')

    const error = await renderToString(h(InlineStatus, { state: 'error', message: 'Chưa lưu được.' }))
    expect(error).toContain('role="alert"')
    expect(error).toContain('Chưa lưu được.')
  })
})
