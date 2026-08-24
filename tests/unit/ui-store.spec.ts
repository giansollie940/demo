import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import { useUiStore } from '../../src/stores/ui.store'

describe('UI store', () => {
  let iframe: HTMLIFrameElement | undefined
  let injectedStorage: Storage | undefined
  let originalStorageDescriptor: PropertyDescriptor | undefined
  let store: ReturnType<typeof useUiStore> | undefined

  beforeEach(() => {
    originalStorageDescriptor = Object.getOwnPropertyDescriptor(window, 'localStorage')
    iframe = document.createElement('iframe')
    document.body.appendChild(iframe)
    injectedStorage = iframe.contentWindow!.localStorage
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: injectedStorage,
    })
    window.localStorage.clear()
    setActivePinia(createPinia())
  })

  afterEach(() => {
    store?.$dispose()
    injectedStorage?.clear()
    if (originalStorageDescriptor) {
      Object.defineProperty(window, 'localStorage', originalStorageDescriptor)
    }
    iframe?.remove()
    store = undefined
    injectedStorage = undefined
    iframe = undefined
    originalStorageDescriptor = undefined
    setActivePinia(createPinia())
  })

  it('toggles and persists sidebar collapse state', async () => {
    store = useUiStore()
    expect(store.sidebarCollapsed).toBe(false)
    store.toggleSidebar()
    expect(store.sidebarCollapsed).toBe(true)
    await nextTick()
    expect(window.localStorage.getItem('v850-sidebar-collapsed')).toBe('true')
  })
})
