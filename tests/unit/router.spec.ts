import { beforeEach, describe, expect, it } from 'vitest'
import { appNavigation } from '../../src/navigation/app-navigation'
import { router } from '../../src/app/router'

const expectedPaths = [
  '/dashboard',
  '/register',
  '/review',
  '/tracking',
  '/tracking/:sessionId',
  '/weeks',
  '/schedule',
  '/students',
  '/statistics',
  '/history',
  '/comments',
  '/admin/classes',
  '/admin/teachers',
  '/admin/permissions',
  '/settings',
]

describe('foundation router', () => {
  beforeEach(async () => {
    await router.replace('/dashboard')
  })

  it('exposes the complete CP1 migration route table', () => {
    const paths = router.getRoutes().map(route => route.path)

    expect(paths).toEqual(expect.arrayContaining(expectedPaths))
  })

  it('provides the main navigation entries with visible icon components', () => {
    expect(appNavigation.map(item => item.key)).toEqual([
      'dashboard',
      'register',
      'review',
      'tracking',
      'weeks',
      'schedule',
      'students',
      'statistics',
      'admin',
      'settings',
    ])
    expect(appNavigation.every(item => Boolean(item.icon))).toBe(true)
  })

  it('redirects root and unmatched locations to the dashboard', async () => {
    await router.push('/')
    expect(router.currentRoute.value.path).toBe('/dashboard')

    await router.push('/not-a-route')
    expect(router.currentRoute.value.path).toBe('/dashboard')
  })
})
