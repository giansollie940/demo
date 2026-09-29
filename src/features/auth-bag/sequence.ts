import { CATALOG, CATALOG_VERSION, itemById } from './catalog'

export const MIN_ITEMS = 10
export const MAX_ITEMS = 20

/** The sample sequence shown in guidance; it must never be accepted as a real secret. */
export const SAMPLE_SEQUENCE: readonly string[] = ['pencil_red', 'notebook_blue', 'pencil_red', 'ruler_yellow']

/**
 * Transport shape (BR-003): a versioned, unambiguous array of item ids. Order and repeats are
 * kept exactly; nothing is sorted or merged. The server must re-validate all of it.
 */
export interface BagPayload {
  version: number
  items: string[]
}

export function toPayload(sequence: readonly string[]): BagPayload {
  return { version: CATALOG_VERSION, items: [...sequence] }
}

/**
 * Canonical verifier input: [catalog version, code, code, ...], one byte per item. At most
 * 21 bytes, so it stays well inside bcrypt's 72-byte input limit (long id strings would not:
 * later items would be silently ignored by the hash).
 */
export function toVerifierInput(sequence: readonly string[]): Uint8Array {
  const bytes = new Uint8Array(sequence.length + 1)
  bytes[0] = CATALOG_VERSION
  sequence.forEach((id, index) => {
    const item = itemById(id)
    if (!item) throw new Error(`Unknown item: ${id}`)
    bytes[index + 1] = item.code
  })
  return bytes
}

export type PolicyIssue = 'too-short' | 'too-long' | 'unknown-item' | 'single-item' | 'repeating-pattern' | 'sample'

/** BR/§8 secret policy. The server must apply the same rules; the client check is only UX. */
export function checkPolicy(sequence: readonly string[]): PolicyIssue | null {
  if (sequence.some(id => !itemById(id))) return 'unknown-item'
  if (sequence.length < MIN_ITEMS) return 'too-short'
  if (sequence.length > MAX_ITEMS) return 'too-long'
  if (new Set(sequence).size === 1) return 'single-item'
  if (repeatsShortPattern(sequence, 3)) return 'repeating-pattern'
  if (startsWith(sequence, SAMPLE_SEQUENCE)) return 'sample'
  return null
}

/** True when the whole sequence is one block of at most `maxPeriod` items repeated (ABAB…, ABCABC…). */
function repeatsShortPattern(sequence: readonly string[], maxPeriod: number): boolean {
  for (let period = 1; period <= maxPeriod; period++) {
    if (sequence.every((id, index) => id === sequence[index % period])) return true
  }
  return false
}

function startsWith(sequence: readonly string[], prefix: readonly string[]): boolean {
  return prefix.every((id, index) => sequence[index] === id)
}

export const POLICY_MESSAGE: Record<PolicyIssue, string> = {
  'too-short': `Cần ít nhất ${MIN_ITEMS} món.`,
  'too-long': `Tối đa ${MAX_ITEMS} món.`,
  'unknown-item': 'Có món không thuộc danh mục.',
  'single-item': 'Không dùng một món lặp lại cho cả chuỗi.',
  'repeating-pattern': 'Chuỗi lặp một mẫu quá ngắn, dễ đoán. Hãy chọn khác đi.',
  sample: 'Không dùng chuỗi ví dụ trong hướng dẫn.',
}

/** Compares two sequences through their verifier inputs, without an early exit on the first mismatch. */
export function sameSequence(a: readonly string[], b: readonly string[]): boolean {
  const x = toVerifierInput(a)
  const y = toVerifierInput(b)
  let diff = x.length ^ y.length
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0)
  return diff === 0
}

type RandomSource = (buffer: Uint32Array) => Uint32Array

const cryptoRandom: RandomSource = buffer => crypto.getRandomValues(buffer)

function randomBelow(n: number, random: RandomSource): number {
  // Rejection sampling keeps every index equally likely.
  const limit = Math.floor(0x1_0000_0000 / n) * n
  const buffer = new Uint32Array(1)
  let value: number
  do value = random(buffer)[0] ?? 0
  while (value >= limit)
  return value % n
}

/** Desk order for one attempt (§6): shuffled before input, fixed during it. Positions are never part of the secret. */
export function shuffledCatalog(random: RandomSource = cryptoRandom) {
  const items = [...CATALOG]
  for (let i = items.length - 1; i > 0; i--) {
    const j = randomBelow(i + 1, random)
    ;[items[i], items[j]] = [items[j]!, items[i]!]
  }
  return items
}

/**
 * A uniformly random sequence that passes the policy. In the real feature this is generated
 * on the server (RB-002 step 3); here it lets the prototype demonstrate the option.
 */
export function randomSequence(length = 12, random: RandomSource = cryptoRandom): string[] {
  for (;;) {
    const sequence = Array.from({ length }, () => CATALOG[randomBelow(CATALOG.length, random)]!.id)
    if (!checkPolicy(sequence)) return sequence
  }
}
