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
