import { CATALOG } from './catalog'

/*
 * "Xếp cặp theo đề": a practice game on the bag login page, played while the login-code field
 * is empty. Each round shows a random packing list to copy into the bag. It runs entirely in
 * the browser: nothing is sent to the server, so it never counts as a failed attempt, and it
 * never touches the student's real sequence.
 */

export const GAME_START_LENGTH = 3
export const GAME_MAX_LENGTH = 8
/** From this level on the list is hidden once the first item goes in: a memory round. */
export const GAME_MEMORY_FROM_LEVEL = 4

type RandomSource = (buffer: Uint32Array) => Uint32Array

const cryptoRandom: RandomSource = buffer => crypto.getRandomValues(buffer)

function randomBelow(n: number, random: RandomSource): number {
  const limit = Math.floor(0x1_0000_0000 / n) * n
  const buffer = new Uint32Array(1)
  let value: number
  do value = random(buffer)[0] ?? 0
  while (value >= limit)
  return value % n
}

export function roundLength(level: number): number {
  return Math.min(GAME_START_LENGTH + Math.max(0, level - 1), GAME_MAX_LENGTH)
}

/** A random packing list for the given level (1-based); repeats allowed, like the real thing. */
export function gameRound(level: number, random: RandomSource = cryptoRandom): string[] {
  return Array.from({ length: roundLength(level) }, () => CATALOG[randomBelow(CATALOG.length, random)]!.id)
}

/** Index of the first wrong or missing item, or -1 when the bag matches the list exactly. */
export function firstMismatch(target: readonly string[], packed: readonly string[]): number {
  const length = Math.max(target.length, packed.length)
  for (let i = 0; i < length; i++) if (target[i] !== packed[i]) return i
  return -1
}
