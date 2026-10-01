import { describe, expect, test } from 'vitest'
import { awardMonthLabel, awardMonthOptions, currentAwardMonth } from '../../src/features/homework/award-months'

describe('homework awards by month', () => {
  test('current month follows Vietnam time, not UTC', () => {
    // 30/09 18:00 UTC is already 01/10 01:00 in Vietnam.
    expect(currentAwardMonth(new Date('2026-09-30T18:00:00Z'))).toBe('2026-10')
    expect(currentAwardMonth(new Date('2026-09-30T16:59:00Z'))).toBe('2026-09')
  })

  test('labels', () => {
    expect(awardMonthLabel('2026-09')).toBe('Tháng 9/2026')
    expect(awardMonthLabel('2027-01')).toBe('Tháng 1/2027')
    expect(awardMonthLabel('')).toBe('Toàn năm học')
  })

  test('options are newest first, include the selection, drop junk', () => {
    expect(awardMonthOptions(['2026-08', '2026-09', 'x', '2026-13'], '2026-10')).toEqual(['2026-10', '2026-09', '2026-08'])
    expect(awardMonthOptions(undefined, '')).toEqual([])
  })
})

describe('award period (month / week / year)', async () => {
  const { awardPayload, awardPeriodLabel, awardWeekLabel, defaultAwardPeriod } = await import('../../src/features/homework/award-months')
  test('payload sends exactly one window, or none for the school year', () => {
    expect(awardPayload({ mode: 'month', month: '2026-10', week: 'w1' })).toEqual({ month: '2026-10' })
    expect(awardPayload({ mode: 'week', month: '2026-10', week: 'w1' })).toEqual({ week_id: 'w1' })
    expect(awardPayload({ mode: 'year', month: '2026-10', week: 'w1' })).toEqual({})
    expect(awardPayload({ mode: 'week', month: '', week: '' })).toEqual({})
  })
  test('week labels with and without dates', () => {
    expect(awardWeekLabel(9, '2026-09-28', '2026-10-04')).toBe('Tuần 9 (28/9–4/10)')
    expect(awardWeekLabel(9)).toBe('Tuần 9')
  })
  test('default is the current month; labels read naturally', () => {
    expect(defaultAwardPeriod(new Date('2026-09-30T18:00:00Z'))).toEqual({ mode: 'month', month: '2026-10', week: '' })
    expect(awardPeriodLabel({ mode: 'month', month: '2026-10', week: '' })).toBe('tháng 10/2026')
    expect(awardPeriodLabel({ mode: 'week', month: '', week: 'w' }, [{ id: 'w', label: 'Tuần 9 (28/9–4/10)' }])).toBe('tuần 9 (28/9–4/10)')
    expect(awardPeriodLabel({ mode: 'year', month: '', week: '' })).toBe('trong năm học')
  })
})
