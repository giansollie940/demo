import { h } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { describe, expect, it } from 'vitest'
import ScheduleGrid from '../../src/components/schedule/ScheduleGrid.vue'
import ScheduleModeTabs from '../../src/components/schedule/ScheduleModeTabs.vue'
import SchedulePage from '../../src/pages/SchedulePage.vue'
import { routes } from '../../src/app/router/routes'

const periods = [
  { n: 1, start: '07:00', end: '07:40' },
  { n: 2, start: '07:45', end: '08:25' },
]

describe('ScheduleGrid', () => {
  it('renders five weekdays, periods, and pressed state with accessible labels', async () => {
    const html = await renderToString(h(ScheduleGrid, {
      periods,
      modelValue: [{ dow: 0, period: 1 }, { dow: 4, period: 2 }],
    }))
    for (const day of ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6']) {
      expect(html).toContain(day)
    }
    expect(html).toContain('aria-label="Thứ 2, Tiết 1, 07:00–07:40"')
    expect(html).toContain('aria-pressed="true"')
    expect(html).toContain('aria-pressed="false"')
    expect(html).toContain('role="grid"')
    expect(html).toContain('mobile-day-tabs')
  })
})

describe('ScheduleModeTabs', () => {
  it('labels default and selected-week modes without a destructive checkbox', async () => {
    const html = await renderToString(h(ScheduleModeTabs, {
      modelValue: 'week',
      weekNumber: 12,
    }))
    expect(html).toContain('TKB mặc định')
    expect(html).toContain('TKB riêng · Tuần 12')
    expect(html).toContain('aria-selected="true"')
  })
})

describe('schedule route', () => {
  it('resolves to the real SchedulePage component', () => {
    const shell = routes.find(item => item.path === '/')
    const route = shell?.children?.find(item => item.path === 'schedule')
    expect(route?.component).toBe(SchedulePage)
  })
})
