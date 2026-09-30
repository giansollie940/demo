/**
 * AUTH-BAG-001 catalogue. Each variant has a fixed item_id (BR-001); names, artwork, desk
 * position and language are presentation only and never part of the secret.
 *
 * Order matters: an item's index is its compact code in the verifier input, so new variants
 * may only be appended, and a reorder needs a new CATALOG_VERSION.
 */
export const CATALOG_VERSION = 1

// Appended kinds get the next codes, so earlier item codes never change.
export const ITEM_KINDS = ['pencil', 'notebook', 'ruler', 'eraser', 'crayon', 'sharpener', 'pen', 'pencilcase', 'scissors'] as const
export const ITEM_COLORS = ['red', 'blue', 'yellow', 'green'] as const

export type ItemKind = typeof ITEM_KINDS[number]
export type ItemColor = typeof ITEM_COLORS[number]

export interface BagItem {
  id: string
  code: number
  kind: ItemKind
  color: ItemColor
  label: string
}

const KIND_LABEL: Record<ItemKind, string> = {
  pencil: 'Bút chì',
  notebook: 'Vở',
  ruler: 'Thước tam giác',
  eraser: 'Tẩy',
  crayon: 'Bút sáp',
  sharpener: 'Gọt bút chì',
  pen: 'Bút mực',
  pencilcase: 'Hộp bút',
  scissors: 'Kéo',
}

const COLOR_LABEL: Record<ItemColor, string> = {
  red: 'đỏ',
  blue: 'xanh dương',
  yellow: 'vàng',
  green: 'xanh lá',
}

export const CATALOG: readonly BagItem[] = ITEM_KINDS.flatMap(kind => ITEM_COLORS.map(color => ({ kind, color })))
  .map(({ kind, color }, code) => ({ id: `${kind}_${color}`, code, kind, color, label: `${KIND_LABEL[kind]} ${COLOR_LABEL[color]}` }))

const BY_ID = new Map(CATALOG.map(item => [item.id, item]))

export function itemById(id: string): BagItem | undefined {
  return BY_ID.get(id)
}
