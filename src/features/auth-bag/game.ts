import { CATALOG } from './catalog'

/*
 * "Xếp cặp theo đề": a practice game on the bag login page, played while the login-code field
 * is empty. Each round shows a random packing list to copy into the bag. It runs entirely in
 * the browser: nothing is sent to the server, so it never counts as a failed attempt, and it
 * never touches the student's real sequence.
 * High scores are kept only in this browser, under a nickname the player types.
 */

/**
 * Rules season. Bump it together with bag_game.config.season whenever the rules change enough
 * that old and new scores cannot be compared: the all-time board then starts a new season and
 * older clients are asked to reload.
 */
export const GAME_RULES_VERSION = 1

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

/** Time allowed for one round: a fixed start plus a few seconds per item to pack. */
export const ROUND_BASE_SECONDS = 8
export const ROUND_SECONDS_PER_ITEM = 3
export function roundSeconds(level: number): number {
  return ROUND_BASE_SECONDS + ROUND_SECONDS_PER_ITEM * roundLength(level)
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

// ===== Lives and the high-score board =====
export const GAME_LIVES = 3
export const BOARD_SIZE = 10
export const NAME_MAX = 16
const BOARD_KEY = 'auth-bag-game-scores-v1'

/** One board entry. Score = rounds packed correctly before the last life was lost. */
export interface ScoreEntry {
  name: string
  score: number
  level: number
  at: number
}

/** Trims, collapses spaces, drops control characters and caps the length of a typed name. */
export function cleanName(raw: string): string {
  return raw.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX)
}

function byRank(a: ScoreEntry, b: ScoreEntry) {
  return b.score - a.score || a.at - b.at // ties: whoever got there first stays ahead
}

/** True when a score would make it onto the board. Zero never does. */
export function qualifies(board: readonly ScoreEntry[], score: number): boolean {
  if (score <= 0) return false
  return board.length < BOARD_SIZE || score > board[board.length - 1]!.score
}

export function addScore(board: readonly ScoreEntry[], entry: ScoreEntry): ScoreEntry[] {
  return [...board, entry].sort(byRank).slice(0, BOARD_SIZE)
}

function isEntry(value: unknown): value is ScoreEntry {
  const e = value as ScoreEntry
  return !!e && typeof e.name === 'string' && Number.isInteger(e.score) && e.score > 0
    && Number.isInteger(e.level) && typeof e.at === 'number'
}

/** The board lives only in this browser (localStorage); anything unreadable counts as empty. */
// Even reading globalThis.localStorage can throw (blocked site data), so it is looked up inside try.
export function loadBoard(storage?: Pick<Storage, 'getItem'>): ScoreEntry[] {
  try {
    const parsed: unknown = JSON.parse((storage ?? globalThis.localStorage).getItem(BOARD_KEY) ?? '[]')
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isEntry).map(e => ({ ...e, name: cleanName(e.name) || 'Bạn nhỏ' })).sort(byRank).slice(0, BOARD_SIZE)
  } catch {
    return []
  }
}

export function saveBoard(board: readonly ScoreEntry[], storage?: Pick<Storage, 'setItem'>): boolean {
  try {
    ;(storage ?? globalThis.localStorage).setItem(BOARD_KEY, JSON.stringify(board))
    return true
  } catch {
    return false
  }
}
