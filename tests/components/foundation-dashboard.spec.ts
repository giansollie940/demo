import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import FoundationDashboardPage from '../../src/pages/FoundationDashboardPage.vue'

describe('FoundationDashboardPage', () => {
  it('separates hero, KPI, attention, activity and daily quote surfaces', () => {
    const wrapper = mount(FoundationDashboardPage)

    for (const id of ['hero', 'kpis', 'attention', 'activity', 'daily-quote']) {
      expect(wrapper.find(`[data-section="${id}"]`).exists()).toBe(true)
    }

    expect(wrapper.find('img[src*="teacher-dashboard-illustration"]').exists()).toBe(true)
  })
})
