import { afterEach, describe, expect, it, vi } from 'vitest'
import { assetUrl, useAssetUrl } from '../../src/composables/useAssetUrl'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('assetUrl', () => {
  it('normalizes relative public asset paths', () => {
    vi.stubEnv('BASE_URL', './')
    const expected = './assets/images/favicon.png'

    expect(assetUrl('assets/images/favicon.png')).toBe(expected)
    expect(assetUrl('/assets/images/favicon.png')).toBe(expected)
    expect(useAssetUrl('/assets/images/favicon.png')).toBe(assetUrl('/assets/images/favicon.png'))
  })
})
