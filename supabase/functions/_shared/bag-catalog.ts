// AUTH-BAG-001 — server copy of the school-bag catalogue and secret policy.
// Must match src/features/auth-bag/{catalog,sequence}.ts exactly (tests/unit/auth-bag-server.test.ts
// checks it): the browser check is only UX, this one is authoritative.

export const CATALOG_VERSION = 1
const KINDS = ["pencil", "notebook", "ruler", "eraser", "crayon", "sharpener", "pen", "pencilcase", "scissors"]
const COLORS = ["red", "blue", "yellow", "green"]
const IDS = KINDS.flatMap(kind => COLORS.map(color => `${kind}_${color}`))
export const CATALOG_SIZE = IDS.length
const CODE = new Map(IDS.map((id, code) => [id, code]))

export const MIN_ITEMS = 8
export const MAX_ITEMS = 20
const SAMPLE = ["pencil_red", "notebook_blue", "pencil_red", "ruler_yellow"]

export type BagPayload = { version?: unknown; items?: unknown }

/** Canonical verifier input as hex ([version, code...]), or null when the payload is malformed. */
export function toInputHex(payload: BagPayload): string | null {
  const { version, items } = payload ?? {}
  if (version !== CATALOG_VERSION || !Array.isArray(items)) return null
  if (items.length < MIN_ITEMS || items.length > MAX_ITEMS) return null
  const codes: number[] = []
  for (const id of items) {
    if (typeof id !== "string" || id.length > 32) return null
    const code = CODE.get(id)
    if (code === undefined) return null
    codes.push(code)
  }
  return [CATALOG_VERSION, ...codes].map(b => b.toString(16).padStart(2, "0")).join("")
}

/** Enrolment policy (mirrors checkPolicy() in the browser); null when acceptable. */
export function policyIssue(items: string[]): string | null {
  if (new Set(items).size === 1) return "single-item"
  for (let period = 1; period <= 3; period++) {
    if (items.every((id, i) => id === items[i % period])) return "repeating-pattern"
  }
  if (SAMPLE.every((id, i) => items[i] === id)) return "sample"
  return null
}
