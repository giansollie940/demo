import { describe, expect, it } from 'vitest'
import { visibleNavigation } from '../../src/features/navigation/navigation'
import { routes } from '../../src/app/router/routes'

// Quản lý tuần và Thời khóa biểu của GV là một mục "Tuần & TKB" ở thanh bên; bên trong là các thẻ.
describe('Tuần & TKB navigation', () => {
  const labels = (role: Parameters<typeof visibleNavigation>[0]) => visibleNavigation(role).map(item => item.label)

  it('shows one sidebar item for teachers instead of two', () => {
    const teacher = visibleNavigation('teacher')
    expect(teacher.filter(item => item.label === 'Tuần & TKB').map(item => item.to)).toEqual(['/schedule'])
    expect(labels('teacher')).not.toContain('Quản lý tuần')
    expect(labels('teacher')).not.toContain('Thời khóa biểu')
    expect(labels('teacher').indexOf('Tuần & TKB')).toBe(labels('teacher').indexOf('Theo dõi cả lớp') + 1)
    for (const role of ['student', 'monitor', 'admin'] as const) expect(labels(role)).not.toContain('Tuần & TKB')
  })

  it('sends the old /weeks address to the Quản lý tuần tab, keeping other query values', () => {
    const children = routes.flatMap(route => route.children ?? [])
    const weeks = children.find(child => child.path === 'weeks')
    expect(weeks?.meta?.roles).toEqual(['teacher'])
    const redirect = weeks?.redirect as (to: { query: Record<string, string> }) => unknown
    expect(redirect({ query: { from: 'owl' } })).toEqual({ path: '/schedule', query: { from: 'owl', tab: 'weeks' } })
    expect(children.find(child => child.path === 'schedule')?.meta?.roles).toEqual(['monitor', 'teacher'])
  })
})
