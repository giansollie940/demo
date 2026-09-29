import { describe, expect, test } from 'vitest'
import { CATALOG, CATALOG_VERSION, itemById } from '../../src/features/auth-bag/catalog'
import { checkPolicy, randomSequence, SAMPLE_SEQUENCE, sameSequence, shuffledCatalog, toPayload, toVerifierInput } from '../../src/features/auth-bag/sequence'

const base = ['crayon_red', 'notebook_blue', 'crayon_red', 'ruler_yellow', 'eraser_green', 'crayon_blue', 'sharpener_red', 'notebook_green', 'pencil_yellow', 'ruler_blue']

describe('catalog', () => {
  test('36 variants with unique ids, codes in order and readable labels', () => {
    expect(CATALOG).toHaveLength(36)
    expect(new Set(CATALOG.map(item => item.id)).size).toBe(36)
    CATALOG.forEach((item, index) => expect(item.code).toBe(index))
    expect(itemById('ruler_yellow')?.label).toBe('Thước tam giác vàng')
    expect(itemById('scissors_green')?.label).toBe('Kéo xanh lá')
  })
  test('new kinds were appended: the original 24 codes are unchanged', () => {
    expect(itemById('pencil_red')?.code).toBe(0)
    expect(itemById('sharpener_green')?.code).toBe(23)
    expect(itemById('pen_red')?.code).toBe(24)
    expect(itemById('scissors_green')?.code).toBe(35)
  })
})

describe('sequence identity (BR-002/003, EC-001, AC-002)', () => {
  test('order, variant, count and length all matter; repeats are kept', () => {
    expect(sameSequence(base, [...base])).toBe(true)
    const swapped = [...base]; [swapped[1], swapped[3]] = [swapped[3]!, swapped[1]!]
    expect(sameSequence(base, swapped)).toBe(false) // same multiset, different order
    expect(sameSequence(base, base.map((id, i) => (i === 0 ? 'crayon_blue' : id)))).toBe(false)
    expect(sameSequence(base, base.slice(0, -1))).toBe(false)
    expect(sameSequence(base, [...base, 'crayon_red'])).toBe(false)
  })

  test('verifier input is versioned, one byte per item, far below the 72-byte bcrypt limit', () => {
    const bytes = toVerifierInput(base)
    expect(bytes[0]).toBe(CATALOG_VERSION)
    expect([...bytes.slice(1)]).toEqual(base.map(id => itemById(id)!.code))
    expect(toVerifierInput(Array(20).fill('scissors_green')).length).toBe(21)
    expect(() => toVerifierInput(['pencil_purple'])).toThrow()
  })

  test('payload keeps exact order and repeats (no sorting or merging)', () => {
    expect(toPayload(base)).toEqual({ version: CATALOG_VERSION, items: base })
  })
})

describe('secret policy (§8)', () => {
  test('accepts a varied 10–20 item sequence', () => {
    expect(checkPolicy(base)).toBeNull()
  })
  test('rejects too short, too long, unknown, single item, short repeats and the guide sample', () => {
    expect(checkPolicy(base.slice(0, 9))).toBe('too-short')
    expect(checkPolicy([...base, ...base])).toBeNull() // 20 items is the maximum
    expect(checkPolicy([...base, ...base, 'pen_blue'])).toBe('too-long')
    expect(checkPolicy([...base.slice(0, 9), 'pencil_purple'])).toBe('unknown-item')
    expect(checkPolicy(Array(12).fill('pencil_red'))).toBe('single-item')
    expect(checkPolicy(Array.from({ length: 12 }, (_, i) => (i % 2 ? 'ruler_blue' : 'pencil_red')))).toBe('repeating-pattern')
    const abc = ['pencil_red', 'eraser_red', 'crayon_red']
    expect(checkPolicy(Array.from({ length: 12 }, (_, i) => abc[i % 3]!))).toBe('repeating-pattern')
    expect(checkPolicy([...SAMPLE_SEQUENCE, ...base.slice(4)])).toBe('sample')
  })
})

describe('randomness', () => {
  test('shuffled desk keeps the full catalogue, only positions change (EC-008, AC-014)', () => {
    const desk = shuffledCatalog()
    expect(desk.map(item => item.id).sort()).toEqual(CATALOG.map(item => item.id).sort())
  })
  test('generated sequences always pass the policy', () => {
    for (let i = 0; i < 50; i++) expect(checkPolicy(randomSequence(12))).toBeNull()
  })
})
