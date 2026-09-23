import type { OwlMessage } from './owl-model'

export const OWL_DIRECTIONS = ['top-left', 'top', 'top-right', 'left', 'center', 'right', 'bottom-left', 'bottom', 'bottom-right'] as const
export const OWL_REACTIONS = ['neutral', 'blink', 'happy', 'thinking', 'surprised', 'warning', 'sleepy', 'celebrate', 'wise'] as const
export type OwlDirection = typeof OWL_DIRECTIONS[number]
export type OwlReaction = typeof OWL_REACTIONS[number]
export interface OwlMascotState { direction: OwlDirection; reaction: OwlReaction; bubble: OwlMessage | null }
export type OwlMascotEvent = { type: 'message'; message: OwlMessage; reaction?: OwlReaction; priority?: number; key?: string } | { type: 'click' } | { type: 'close' }

export function directionFromPoint(dx: number, dy: number): OwlDirection {
  const horizontal = dx < -18 ? 'left' : dx > 18 ? 'right' : ''
  const vertical = dy < -18 ? 'top' : dy > 18 ? 'bottom' : ''
  return (vertical && horizontal ? `${vertical}-${horizontal}` : vertical || horizontal || 'center') as OwlDirection
}

/** Business events enter here; the renderer only reads state and dispatches events. */
export function createOwlMascotController(now: () => number = Date.now, cooldownMs = 1200) {
  const state: OwlMascotState = { direction: 'center', reaction: 'neutral', bubble: null }
  const queue: { message: OwlMessage; reaction: OwlReaction; priority: number }[] = []
  const recent = new Map<string, number>()
  let activePriority = -1
  function dispatch(event: OwlMascotEvent) {
    if (event.type === 'close') { state.bubble = null; activePriority = -1; next(); return true }
    if (event.type === 'click') { state.reaction = 'happy'; next(); return true }
    const key = event.key ?? event.message.text
    if (now() - (recent.get(key) ?? -Infinity) < cooldownMs) return false
    recent.set(key, now())
    queue.push({ message: event.message, reaction: event.reaction ?? (event.message.urgent ? 'warning' : 'wise'), priority: event.priority ?? (event.message.urgent ? 2 : 1) })
    queue.sort((a, b) => b.priority - a.priority)
    next()
    return true
  }
  function next() {
    if (state.bubble || !queue.length) return
    const item = queue.shift()!
    activePriority = item.priority
    state.bubble = item.message
    state.reaction = item.reaction
  }
  function lookAt(target: { getBoundingClientRect: () => DOMRect }, origin: { x: number; y: number }) {
    const rect = target.getBoundingClientRect()
    state.direction = directionFromPoint(rect.left + rect.width / 2 - origin.x, rect.top + rect.height / 2 - origin.y)
  }
  function pointAt(dx: number, dy: number) { state.direction = directionFromPoint(dx, dy) }
  function reset() { state.direction = 'center'; state.reaction = 'neutral'; state.bubble = null; queue.length = 0; recent.clear(); activePriority = -1 }
  return { state, queue, dispatch, lookAt, pointAt, reset, get activePriority() { return activePriority } }
}

/** Rollback is a build-time flag; user roles are checked independently. */
export function owlMascotV2Enabled(role: string | undefined, flag: string | undefined): boolean {
  return flag === 'true' && role === 'admin'
}
