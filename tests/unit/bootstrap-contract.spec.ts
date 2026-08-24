// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest'
import packageJson from '../../package.json'

describe('CP1 bootstrap contract', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="app"></div>'
  })

  it('creates a relative-path application test harness', async () => {
    const { default: config } = await import('../../vite.config')

    expect(config.base).toBe('./')
    expect(config.test?.environment).toBe('jsdom')
    expect(config.test?.include).toEqual([
      'tests/unit/**/*.spec.ts',
      'tests/components/**/*.spec.ts'
    ])
  })

  it('mounts the Vue application with the CP1 query client defaults', async () => {
    const { queryClient } = await import('../../src/app/query-client')
    await import('../../src/main')

    expect(document.querySelector('#app')?.textContent).not.toBe('')
    expect(queryClient.getDefaultOptions().queries).toMatchObject({
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false
    })
  })

  it('declares the CP1 routing and state dependencies without Supabase', () => {
    expect(packageJson.dependencies).toMatchObject({
      'vue-router': 'latest',
      '@tanstack/vue-query': 'latest',
      pinia: 'latest'
    })
    expect(Object.keys(packageJson.dependencies)).not.toContain('supabase')
    expect(Object.keys(packageJson.dependencies)).not.toContain('@supabase/supabase-js')
  })
})
