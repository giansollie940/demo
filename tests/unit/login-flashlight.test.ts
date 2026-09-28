import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { beamGeometry, createOwlCameo, flashRadius, OWL_CAMEO_TIMING, pointNearRect, supportsBeamComposite, supportsFlashlightMask } from '../../src/features/login/flashlight'

describe('supportsFlashlightMask', () => {
  test('accepts standard or -webkit- mask support', () => {
    expect(supportsFlashlightMask({ supports: property => property === 'mask-image' })).toBe(true)
    expect(supportsFlashlightMask({ supports: property => property === '-webkit-mask-image' })).toBe(true)
  })
  test('falls back when masks are missing, CSS is absent or supports() throws', () => {
    expect(supportsFlashlightMask({ supports: () => false })).toBe(false)
    expect(supportsFlashlightMask(undefined)).toBe(false)
    expect(supportsFlashlightMask({ supports: () => { throw new Error('boom') } })).toBe(false)
  })
})

describe('beam', () => {
  test('points the torch at the target and starts the beam at the lens', () => {
    const right = beamGeometry({ x: 0, y: 0 }, { x: 200, y: 0 }, 90, 100)
    expect(right.rotation).toBe(0)
    expect(right.conicCenter).toBe(90)
    expect(right.head).toEqual({ x: 90, y: 0 })
    expect(right.reach).toBe(210)
    const up = beamGeometry({ x: 100, y: 500 }, { x: 100, y: 100 }, 80, 100)
    expect(up.rotation).toBe(-90)
    expect(up.conicCenter).toBe(0)
    expect(up.head.x).toBeCloseTo(100)
    expect(up.head.y).toBeCloseTo(420)
  })
  test('mask-composite detection and responsive spot radius', () => {
    expect(supportsBeamComposite({ supports: (p, v) => p === 'mask-composite' && v === 'intersect' })).toBe(true)
    expect(supportsBeamComposite({ supports: (p, v) => p === '-webkit-mask-composite' && v === 'source-in' })).toBe(true)
    expect(supportsBeamComposite({ supports: () => false })).toBe(false)
    expect(flashRadius(360)).toBeCloseTo(100.8)
    expect(flashRadius(1440)).toBeCloseTo(150)
    expect(flashRadius(800)).toBe(96)
  })
})

describe('pointNearRect', () => {
  const rect = { left: 100, top: 100, right: 300, bottom: 150 }
  test('triggers inside the field and within the padding', () => {
    expect(pointNearRect(200, 125, rect)).toBe(true)
    expect(pointNearRect(80, 90, rect, 24)).toBe(true)
  })
  test('ignores points beyond the padding', () => {
    expect(pointNearRect(70, 125, rect, 24)).toBe(false)
    expect(pointNearRect(200, 180, rect, 24)).toBe(false)
  })
})

describe('createOwlCameo', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  test('appears, blinks three times, flies away, then hides', () => {
    const owl = createOwlCameo()
    const blinks: number[] = []
    let closed = false
    expect(owl.play()).toBe(true)
    expect(owl.phase.value).toBe('appear')
    const seen = new Set<string>()
    for (let t = 0; t < 4000; t += 10) {
      vi.advanceTimersByTime(10)
      seen.add(owl.phase.value)
      if (owl.eyesClosed.value && !closed) blinks.push(t)
      closed = owl.eyesClosed.value
    }
    expect(blinks).toHaveLength(OWL_CAMEO_TIMING.blinks)
    expect([...seen]).toEqual(['appear', 'perch', 'fly', 'hidden'])
    expect(owl.phase.value).toBe('hidden')
    expect(owl.eyesClosed.value).toBe(false)
  })

  test('shows only once per flashlight session', () => {
    const owl = createOwlCameo()
    owl.play()
    vi.advanceTimersByTime(5000)
    expect(owl.play()).toBe(false)
    expect(owl.phase.value).toBe('hidden')
  })

  test('reset mid-flight hides the owl, cancels pending steps and allows a new cameo', () => {
    const owl = createOwlCameo()
    owl.play()
    vi.advanceTimersByTime(OWL_CAMEO_TIMING.appear + OWL_CAMEO_TIMING.firstBlink + 10)
    expect(owl.eyesClosed.value).toBe(true)
    owl.reset()
    expect(owl.phase.value).toBe('hidden')
    expect(owl.eyesClosed.value).toBe(false)
    vi.advanceTimersByTime(5000)
    expect(owl.phase.value).toBe('hidden')
    expect(owl.play()).toBe(true)
  })
})
