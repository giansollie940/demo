import { ref } from 'vue'

/** Flashlight clipping needs CSS masks; without them the page falls back to a plain password reveal. */
export function supportsFlashlightMask(css: { supports?: (property: string, value: string) => boolean } | undefined = globalThis.CSS): boolean {
  const gradient = 'radial-gradient(circle 10px at 0 0, #000, transparent)'
  try {
    return Boolean(css?.supports?.('mask-image', gradient) || css?.supports?.('-webkit-mask-image', gradient))
  } catch {
    return false
  }
}

/** The cone beam intersects several mask layers; without mask-composite only the round spot is drawn. */
export function supportsBeamComposite(css: { supports?: (property: string, value: string) => boolean } | undefined = globalThis.CSS): boolean {
  try {
    return Boolean(css?.supports?.('mask-composite', 'intersect') || css?.supports?.('-webkit-mask-composite', 'source-in'))
  } catch {
    return false
  }
}

/** Radius of the round spot at the end of the beam; mirrors the old clamp() so mobile gets a smaller light. */
export function flashRadius(viewportWidth: number): number {
  return viewportWidth < 768
    ? Math.min(120, Math.max(90, viewportWidth * 0.28))
    : Math.min(150, Math.max(96, viewportWidth * 0.11))
}

export interface Point { x: number; y: number }

/**
 * Where the flashlight points and how far its beam reaches.
 * `rotation` is the screen angle (0° = right, clockwise) used to rotate the torch artwork;
 * `conicCenter` is the same direction in conic-gradient terms (0° = up).
 */
export function beamGeometry(pivot: Point, target: Point, lensOffset: number, spotRadius: number) {
  const rotation = Math.atan2(target.y - pivot.y, target.x - pivot.x) * 180 / Math.PI
  const rad = rotation * Math.PI / 180
  const head = { x: pivot.x + Math.cos(rad) * lensOffset, y: pivot.y + Math.sin(rad) * lensOffset }
  const reach = Math.hypot(target.x - head.x, target.y - head.y) + spotRadius
  return { rotation, head, reach, conicCenter: rotation + 90 }
}

interface RectLike { left: number; top: number; right: number; bottom: number }

/** True when the point sits inside the rect grown by `pad` px on every side. */
export function pointNearRect(x: number, y: number, rect: RectLike, pad = 24): boolean {
  return x >= rect.left - pad && x <= rect.right + pad && y >= rect.top - pad && y <= rect.bottom + pad
}

export type OwlCameoPhase = 'hidden' | 'appear' | 'perch' | 'fly'

export const OWL_CAMEO_TIMING = {
  appear: 300,
  firstBlink: 200,
  closed: 120,
  gap: 200,
  blinks: 3,
  pause: 400,
  fly: 850,
}

type Timer = ReturnType<typeof setTimeout>

/**
 * One owl cameo per flashlight session: appear → blink ×3 → pause → fly away → hidden.
 * reset() cancels every pending step so the owl can never be left mid-flight.
 */
export function createOwlCameo(timing = OWL_CAMEO_TIMING) {
  const phase = ref<OwlCameoPhase>('hidden')
  const eyesClosed = ref(false)
  const shown = ref(false)
  let timers: Timer[] = []
  const at = (ms: number, step: () => void) => { timers.push(setTimeout(step, ms)) }

  function play(): boolean {
    if (shown.value) return false
    shown.value = true
    phase.value = 'appear'
    at(timing.appear, () => { phase.value = 'perch' })
    let t = timing.appear + timing.firstBlink
    for (let i = 0; i < timing.blinks; i++) {
      at(t, () => { eyesClosed.value = true })
      at(t + timing.closed, () => { eyesClosed.value = false })
      t += timing.closed + timing.gap
    }
    const flyAt = t - timing.gap + timing.pause
    at(flyAt, () => { phase.value = 'fly' })
    at(flyAt + timing.fly, () => { phase.value = 'hidden' })
    return true
  }

  function reset() {
    timers.forEach(clearTimeout)
    timers = []
    phase.value = 'hidden'
    eyesClosed.value = false
    shown.value = false
  }

  return { phase, eyesClosed, shown, play, reset }
}
