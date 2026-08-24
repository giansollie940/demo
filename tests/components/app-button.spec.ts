import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import AppButton from '../../src/components/ui/AppButton.vue'

describe('AppButton', () => {
  it('emits clicks from an interactive button', async () => {
    const wrapper = mount(AppButton, {
      props: { loading: false },
      slots: { default: 'Lưu' }
    })

    await wrapper.trigger('click')
    expect(wrapper.emitted('click')).toHaveLength(1)
  })

  it('prevents synthetic click emissions while disabled or loading', () => {
    const unavailableStates: Array<{ disabled?: boolean; loading?: boolean }> = [
      { disabled: true },
      { loading: true },
    ]

    for (const props of unavailableStates) {
      const wrapper = mount(AppButton, {
        props,
        slots: { default: 'Lưu' }
      })

      wrapper.element.dispatchEvent(new MouseEvent('click', { bubbles: true }))

      expect(wrapper.emitted('click')).toBeUndefined()
    }
  })

  it('exposes loading through native and ARIA semantics', async () => {
    const wrapper = mount(AppButton, {
      props: { loading: false },
      slots: { default: 'Lưu' }
    })

    await wrapper.setProps({ loading: true })
    expect(wrapper.attributes('aria-busy')).toBe('true')
    expect(wrapper.attributes('disabled')).toBeDefined()
  })
})
