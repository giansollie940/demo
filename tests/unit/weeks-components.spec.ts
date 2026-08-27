import { h } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { describe, expect, it } from 'vitest'
import WeekStatusBadge from '../../src/components/weeks/WeekStatusBadge.vue'
import WeekEditorCard from '../../src/components/weeks/WeekEditorCard.vue'
import WeekCalendarSetup from '../../src/components/weeks/WeekCalendarSetup.vue'
import WeeksPage from '../../src/pages/WeeksPage.vue'
import { routes } from '../../src/app/router/routes'

const draft = {
  id: 'week-12',
  number: 12,
  startDate: '2026-11-02',
  endDate: '2026-11-08',
  holiday: false,
  manualStatus: null,
  deadlineMode: 'specific' as const,
  deadline: '2026-11-01T20:00',
  note: '',
}

describe('WeekStatusBadge', () => {
  it('renders text status in addition to visual color', async () => {
    expect(await renderToString(h(WeekStatusBadge, { status: 'open' }))).toContain('Đang mở')
    expect(await renderToString(h(WeekStatusBadge, { status: 'holiday' }))).toContain('Tuần nghỉ')
  })
})

describe('WeekEditorCard', () => {
  it('renders week identity, holiday control, and specific deadline input', async () => {
    const html = await renderToString(h(WeekEditorCard, {
      modelValue: draft,
      operationalStatus: 'open',
      current: true,
      viewing: true,
      deadlineTime: '20:00',
    }))
    expect(html).toContain('Tuần 12')
    expect(html).toContain('Hiện hành')
    expect(html).toContain('Đang xem')
    expect(html).toContain('Tuần nghỉ')
    expect(html).toContain('Chế độ vận hành')
    expect(html).toContain('Tự động')
    expect(html).toContain('type="datetime-local"')
    expect(html).toContain('Mở TKB tuần này')
  })

  it('associates an invalid specific deadline with an actionable error', async () => {
    const html = await renderToString(h(WeekEditorCard, {
      modelValue: { ...draft, deadline: '' },
      operationalStatus: 'open',
      deadlineTime: '20:00',
    }))
    expect(html).toContain('aria-invalid="true"')
    expect(html).toContain('aria-describedby="week-week-12-deadline-help"')
    expect(html).toContain('Hãy chọn ngày và giờ hết hạn.')
  })
})

describe('WeekCalendarSetup', () => {
  it('shows rebase action only to admin', async () => {
    const admin = await renderToString(h(WeekCalendarSetup, {
      modelValue: '2026-08-24',
      deadlineTime: '20:00',
      admin: true,
    }))
    expect(admin).toContain('Xếp lại lịch tuần')
    const teacher = await renderToString(h(WeekCalendarSetup, {
      modelValue: '2026-08-24',
      deadlineTime: '20:00',
      admin: false,
    }))
    expect(teacher).not.toContain('Xếp lại lịch tuần</button>')
    expect(teacher).toContain('do quản trị viên thiết lập')
  })
})

describe('weeks route', () => {
  it('resolves to the real WeeksPage component', () => {
    const shell = routes.find(item => item.path === '/')
    const route = shell?.children?.find(item => item.path === 'weeks')
    expect(route?.component).toBe(WeeksPage)
  })
})
