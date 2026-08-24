import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import IconButton from '../../src/components/ui/IconButton.vue'

describe('IconButton', () => {
  it('exposes the required accessible label on its native button', () => {
    const wrapper = mount(IconButton, {
      props: { label: 'Mở menu' },
      slots: { default: '☰' }
    })

    expect(wrapper.element.tagName).toBe('BUTTON')
    expect(wrapper.attributes('aria-label')).toBe('Mở menu')
  })

  it('prevents synthetic click emissions from a disabled icon button', () => {
    const wrapper = mount(IconButton, {
      props: { label: 'Mở menu', disabled: true },
      slots: { default: '☰' }
    })

    wrapper.element.dispatchEvent(new MouseEvent('click', { bubbles: true }))

    expect(wrapper.emitted('click')).toBeUndefined()
  })
})
