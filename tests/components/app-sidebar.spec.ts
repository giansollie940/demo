import { mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { describe, expect, it } from 'vitest'
import AppSidebar from '../../src/components/layout/AppSidebar.vue'

function createTestRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/dashboard', component: { template: '<div />' } },
      { path: '/weeks', component: { template: '<div />' } },
      { path: '/tracking', component: { template: '<div />' } },
      { path: '/tracking/:sessionId', component: { template: '<div />' } },
      { path: '/admin/classes', component: { template: '<div />' } },
      { path: '/admin/teachers', component: { template: '<div />' } },
      { path: '/admin/permissions', component: { template: '<div />' } },
      { path: '/:pathMatch(.*)*', component: { template: '<div />' } },
    ],
  })
}

describe('AppSidebar', () => {
  it('keeps every navigation icon visible and marks the current route active', async () => {
    const router = createTestRouter()
    await router.push('/dashboard')
    await router.isReady()

    const wrapper = mount(AppSidebar, {
      props: { collapsed: false },
      global: { plugins: [createPinia(), router] },
    })

    const links = wrapper.findAll('[data-nav-item]')
    expect(links.length).toBeGreaterThan(1)
    for (const link of links) {
      expect(link.find('[data-nav-icon]').exists()).toBe(true)
    }
    expect(wrapper.find('[data-nav-item].is-active').exists()).toBe(true)

    wrapper.unmount()
  })

  it('uses readable inactive labels and an opaque component focus indicator', async () => {
    const router = createTestRouter()
    await router.push('/dashboard')
    await router.isReady()

    const wrapper = mount(AppSidebar, {
      props: { collapsed: false },
      global: { plugins: [createPinia(), router] },
      attachTo: document.body,
    })

    const inactiveLink = wrapper.get('[data-nav-item][href="/weeks"]')
    expect(getComputedStyle(inactiveLink.element).color).toBe('var(--text)')

    ;(inactiveLink.element as HTMLElement).focus()
    expect(document.activeElement).toBe(inactiveLink.element)
    inactiveLink.element.classList.add('is-focus-visible')
    expect(getComputedStyle(inactiveLink.element).outlineStyle).toBe('solid')
    expect(getComputedStyle(inactiveLink.element).outlineColor).toBe(
      'var(--color-primary-strong)',
    )

    wrapper.unmount()
  })

  it.each([
    ['/tracking/session-1', '/tracking'],
    ['/admin/teachers', '/admin/classes'],
    ['/admin/permissions', '/admin/classes'],
  ])('keeps the grouped navigation owner active at %s', async (path, activeHref) => {
    const router = createTestRouter()
    await router.push(path)
    await router.isReady()

    const wrapper = mount(AppSidebar, {
      props: { collapsed: false },
      global: { plugins: [createPinia(), router] },
    })

    const activeLinks = wrapper.findAll('[data-nav-item].is-active')
    expect(activeLinks).toHaveLength(1)
    expect(activeLinks[0].attributes('href')).toBe(activeHref)
    expect(activeLinks[0].attributes('aria-current')).toBe('page')

    wrapper.unmount()
  })

  it('does not prefix-match a non-group route with a similar name', async () => {
    const router = createTestRouter()
    await router.push('/administrator')
    await router.isReady()

    const wrapper = mount(AppSidebar, {
      props: { collapsed: false },
      global: { plugins: [createPinia(), router] },
    })

    expect(wrapper.findAll('[data-nav-item].is-active')).toHaveLength(0)
    expect(wrapper.findAll('[data-nav-item][aria-current="page"]')).toHaveLength(0)

    wrapper.unmount()
  })
})
