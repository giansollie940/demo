import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, disposePinia, setActivePinia, type Pinia } from 'pinia'
import { nextTick } from 'vue'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import AppShell from '../../src/components/layout/AppShell.vue'
import { useUiStore } from '../../src/stores/ui.store'

let pinia: Pinia | undefined
let router: Router
let wrapper: VueWrapper | undefined
let iframe: HTMLIFrameElement | undefined
let injectedStorage: Storage | undefined
let originalStorageDescriptor: PropertyDescriptor | undefined
let originalShowModalDescriptor: PropertyDescriptor | undefined
let originalCloseDescriptor: PropertyDescriptor | undefined
let originalMatchMediaDescriptor: PropertyDescriptor | undefined

interface ControllableMediaQuery {
  dispatch(matches: boolean): void
  listenerCount(): number
}

function installControllableMatchMedia(initialMatches: boolean): ControllableMediaQuery {
  let matches = initialMatches
  const listeners = new Set<(event: MediaQueryListEvent) => void>()
  const mediaQueryList = {
    get matches() {
      return matches
    },
    media: '(min-width: 60rem)',
    onchange: null,
    addEventListener(_type: string, listener: (event: MediaQueryListEvent) => void) {
      listeners.add(listener)
    },
    removeEventListener(_type: string, listener: (event: MediaQueryListEvent) => void) {
      listeners.delete(listener)
    },
    addListener(listener: (event: MediaQueryListEvent) => void) {
      listeners.add(listener)
    },
    removeListener(listener: (event: MediaQueryListEvent) => void) {
      listeners.delete(listener)
    },
    dispatchEvent() {
      return true
    },
  } as MediaQueryList

  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value(query: string) {
      if (query !== '(min-width: 60rem)') throw new Error(`Unexpected media query: ${query}`)
      return mediaQueryList
    },
  })

  return {
    dispatch(nextMatches: boolean) {
      matches = nextMatches
      const event = { matches, media: mediaQueryList.media } as MediaQueryListEvent
      for (const listener of listeners) listener(event)
    },
    listenerCount() {
      return listeners.size
    },
  }
}

function restorePrototypeProperty(
  prototype: object,
  property: string,
  descriptor: PropertyDescriptor | undefined,
): void {
  if (descriptor) {
    Object.defineProperty(prototype, property, descriptor)
  } else {
    Reflect.deleteProperty(prototype, property)
  }
}

function createTestRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: '/dashboard',
        component: {
          template: '<main><h1>Dashboard page heading</h1><p>Dashboard content</p></main>',
        },
        meta: { title: 'Dashboard' },
      },
      {
        path: '/weeks',
        component: { template: '<main>Weeks content</main>' },
        meta: { title: 'Weeks' },
      },
      {
        path: '/:pathMatch(.*)*',
        component: { template: '<main>Fallback content</main>' },
      },
    ],
  })
}

beforeEach(async () => {
  originalMatchMediaDescriptor = Object.getOwnPropertyDescriptor(window, 'matchMedia')
  originalStorageDescriptor = Object.getOwnPropertyDescriptor(window, 'localStorage')
  iframe = document.createElement('iframe')
  document.body.appendChild(iframe)
  injectedStorage = iframe.contentWindow!.localStorage
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: injectedStorage,
  })
  originalShowModalDescriptor = Object.getOwnPropertyDescriptor(
    window.HTMLDialogElement.prototype,
    'showModal',
  )
  originalCloseDescriptor = Object.getOwnPropertyDescriptor(
    window.HTMLDialogElement.prototype,
    'close',
  )
  Object.defineProperty(window.HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value(this: HTMLDialogElement) {
      this.setAttribute('open', '')
    },
  })
  Object.defineProperty(window.HTMLDialogElement.prototype, 'close', {
    configurable: true,
    value(this: HTMLDialogElement) {
      this.removeAttribute('open')
      this.dispatchEvent(new Event('close'))
    },
  })
  window.localStorage.clear()
  pinia = createPinia()
  setActivePinia(pinia)
  router = createTestRouter()
  await router.push('/dashboard')
  await router.isReady()
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  if (pinia) disposePinia(pinia)
  injectedStorage?.clear()
  if (originalStorageDescriptor) {
    Object.defineProperty(window, 'localStorage', originalStorageDescriptor)
  }
  iframe?.remove()
  restorePrototypeProperty(
    window.HTMLDialogElement.prototype,
    'showModal',
    originalShowModalDescriptor,
  )
  restorePrototypeProperty(
    window.HTMLDialogElement.prototype,
    'close',
    originalCloseDescriptor,
  )
  restorePrototypeProperty(window, 'matchMedia', originalMatchMediaDescriptor)
  pinia = undefined
  injectedStorage = undefined
  iframe = undefined
  originalStorageDescriptor = undefined
  originalShowModalDescriptor = undefined
  originalCloseDescriptor = undefined
  originalMatchMediaDescriptor = undefined
  setActivePinia(undefined)
})

describe('AppShell', () => {
  it('uses the desktop toggle to update the stored sidebar preference and shell state', async () => {
    const uiStore = useUiStore()
    wrapper = mount(AppShell, {
      global: { plugins: [pinia!, router] },
    })

    expect(uiStore.sidebarCollapsed).toBe(false)
    expect(wrapper.attributes('data-sidebar-collapsed')).toBe('false')

    await wrapper.get('[data-desktop-sidebar-toggle]').trigger('click')

    expect(uiStore.sidebarCollapsed).toBe(true)
    expect(wrapper.attributes('data-sidebar-collapsed')).toBe('true')
  })

  it('renders the current route title, demo context controls, and routed page content', () => {
    wrapper = mount(AppShell, {
      global: { plugins: [pinia!, router] },
    })

    expect(wrapper.get('[data-current-route-title]').text()).toBe('Dashboard')
    expect(wrapper.text()).toContain('Dashboard content')
    expect(wrapper.findAll('h1')).toHaveLength(1)
    expect(wrapper.get('h1').text()).toBe('Dashboard page heading')

    const selectors = wrapper.findAll('[data-context-selector]')
    expect(selectors).toHaveLength(2)
    expect(selectors.map((selector) => selector.text())).toEqual(['LớpDemo', 'TuầnDemo'])
    for (const selector of selectors) {
      expect(selector.get('select').attributes('disabled')).toBeDefined()
    }
  })

  it('opens and closes a local mobile drawer without changing the desktop preference', async () => {
    const uiStore = useUiStore()
    wrapper = mount(AppShell, {
      global: { plugins: [pinia!, router] },
    })

    await wrapper.get('button[aria-label="Mở điều hướng"]').trigger('click')

    expect(wrapper.attributes('data-mobile-drawer-open')).toBe('true')
    expect(uiStore.sidebarCollapsed).toBe(false)

    await wrapper.get('button[aria-label="Đóng điều hướng"]').trigger('click')

    expect(wrapper.attributes('data-mobile-drawer-open')).toBe('false')
    expect(uiStore.sidebarCollapsed).toBe(false)
  })

  it('closes the mobile drawer when entering desktop without changing its stored collapse preference', async () => {
    const desktopBreakpoint = installControllableMatchMedia(false)
    const uiStore = useUiStore()
    uiStore.toggleSidebar()
    wrapper = mount(AppShell, {
      global: { plugins: [pinia!, router] },
    })

    expect(desktopBreakpoint.listenerCount()).toBe(1)
    await wrapper.get('button[aria-label="Mở điều hướng"]').trigger('click')
    expect(wrapper.attributes('data-mobile-drawer-open')).toBe('true')
    expect(uiStore.sidebarCollapsed).toBe(true)

    desktopBreakpoint.dispatch(true)
    await nextTick()

    expect(wrapper.attributes('data-mobile-drawer-open')).toBe('false')
    expect(wrapper.get('#app-mobile-navigation').attributes('open')).toBeUndefined()
    expect(uiStore.sidebarCollapsed).toBe(true)

    wrapper.unmount()
    wrapper = undefined
    expect(desktopBreakpoint.listenerCount()).toBe(0)
  })

  it('exposes a modal navigation disclosure and restores its opener on close', async () => {
    wrapper = mount(AppShell, {
      global: { plugins: [pinia!, router] },
      attachTo: document.body,
    })

    const trigger = wrapper.get('button[aria-controls="app-mobile-navigation"]')
    expect(trigger.attributes('aria-expanded')).toBe('false')
    expect(trigger.attributes('aria-label')).toBe('Mở điều hướng')

    ;(trigger.element as HTMLElement).focus()
    await trigger.trigger('click')
    await nextTick()

    const dialog = wrapper.get('#app-mobile-navigation')
    expect(dialog.element.tagName).toBe('DIALOG')
    expect(dialog.attributes('open')).toBeDefined()
    expect(trigger.attributes('aria-expanded')).toBe('true')
    expect(trigger.attributes('aria-label')).toBe('Đóng điều hướng')
    expect(wrapper.get('.app-shell__body').attributes('inert')).toBeDefined()
    expect(dialog.findAll('button[aria-label="Đóng điều hướng"]')).toHaveLength(1)
    expect(wrapper.find('.app-shell__backdrop').exists()).toBe(false)
    expect(document.activeElement).toBe(
      dialog.get('button[aria-label="Đóng điều hướng"]').element,
    )

    await dialog.get('button[aria-label="Đóng điều hướng"]').trigger('click')
    await nextTick()

    expect(wrapper.attributes('data-mobile-drawer-open')).toBe('false')
    expect(trigger.attributes('aria-expanded')).toBe('false')
    expect(wrapper.get('.app-shell__body').attributes('inert')).toBeUndefined()
    expect(document.activeElement).toBe(trigger.element)
  })

  it('contains keyboard focus, closes on Escape, and restores the disclosure', async () => {
    wrapper = mount(AppShell, {
      global: { plugins: [pinia!, router] },
      attachTo: document.body,
    })

    const trigger = wrapper.get('button[aria-controls="app-mobile-navigation"]')
    ;(trigger.element as HTMLElement).focus()
    await trigger.trigger('click')
    await nextTick()

    const dialog = wrapper.get('#app-mobile-navigation')
    const closeButton = dialog.get('button[aria-label="Đóng điều hướng"]')
    const focusableItems = dialog.findAll('button, a[href]')
    const lastItem = focusableItems.at(-1)!
    ;(lastItem.element as HTMLElement).focus()
    await lastItem.trigger('keydown', { key: 'Tab' })
    expect(document.activeElement).toBe(closeButton.element)

    await dialog.trigger('keydown', { key: 'Escape' })
    await nextTick()

    expect(wrapper.attributes('data-mobile-drawer-open')).toBe('false')
    expect(document.activeElement).toBe(trigger.element)
  })

  it('dismisses from the pointer backdrop surface without a tabbable backdrop control', async () => {
    wrapper = mount(AppShell, {
      global: { plugins: [pinia!, router] },
      attachTo: document.body,
    })

    const trigger = wrapper.get('button[aria-controls="app-mobile-navigation"]')
    ;(trigger.element as HTMLElement).focus()
    await trigger.trigger('click')
    await nextTick()

    const dialog = wrapper.get('#app-mobile-navigation')
    expect(wrapper.find('.app-shell__backdrop').exists()).toBe(false)
    await dialog.trigger('click')
    await nextTick()

    expect(wrapper.attributes('data-mobile-drawer-open')).toBe('false')
    expect(document.activeElement).toBe(trigger.element)
  })

  it('closes the drawer after both different-route and current-route activation', async () => {
    wrapper = mount(AppShell, {
      global: { plugins: [pinia!, router] },
      attachTo: document.body,
    })

    const trigger = wrapper.get('button[aria-controls="app-mobile-navigation"]')
    await trigger.trigger('click')
    await nextTick()
    await wrapper
      .get('#app-mobile-navigation')
      .get('[data-nav-item][href="/weeks"]')
      .trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.path).toBe('/weeks')
    expect(wrapper.attributes('data-mobile-drawer-open')).toBe('false')

    await trigger.trigger('click')
    await nextTick()
    await wrapper
      .get('#app-mobile-navigation')
      .get('[data-nav-item][href="/weeks"]')
      .trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.path).toBe('/weeks')
    expect(wrapper.attributes('data-mobile-drawer-open')).toBe('false')
  })

  it('uses readable topbar context labels and opaque component focus rings', () => {
    wrapper = mount(AppShell, {
      global: { plugins: [pinia!, router] },
      attachTo: document.body,
    })

    const contextLabel = wrapper.get('[data-context-selector]')
    expect(getComputedStyle(contextLabel.element).color).toBe('var(--text)')

    const mobileTrigger = wrapper.get('button[aria-label="Mở điều hướng"]')
    ;(mobileTrigger.element as HTMLElement).focus()
    mobileTrigger.element.classList.add('is-focus-visible')
    expect(getComputedStyle(mobileTrigger.element).outlineStyle).toBe('solid')
    expect(getComputedStyle(mobileTrigger.element).outlineColor).toBe(
      'var(--color-primary-strong)',
    )
  })
})
