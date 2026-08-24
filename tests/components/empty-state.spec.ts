import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import EmptyState from '../../src/components/ui/EmptyState.vue'

describe('EmptyState', () => {
  it('prevents an optional supporting image from becoming required or always visible', () => {
    const withoutImage = mount(EmptyState, { props: { title: 'Không có dữ liệu' } })
    expect(withoutImage.find('img').exists()).toBe(false)

    const withImage = mount(EmptyState, {
      props: { title: 'Không có dữ liệu', image: './assets/images/empty-state.png' }
    })
    expect(withImage.find('img').attributes('src')).toContain('empty-state.png')
  })
})
