<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { ChevronLeft, ChevronRight, RotateCcw, Undo2 } from 'lucide-vue-next'
import AppButton from '../ui/AppButton.vue'
import BagItemIcon from './BagItemIcon.vue'
import { ITEM_COLORS, ITEM_KINDS, itemById, type BagItem, type ItemColor, type ItemKind } from '../../features/auth-bag/catalog'
import { MAX_ITEMS, shuffledCatalog } from '../../features/auth-bag/sequence'
import { activePad } from '../../features/auth-bag/active-pad'

/*
 * AUTH-BAG-001 input pad: a spinning wheel of school supplies in one of four colour themes, and
 * the closed bag they go into. Only the item at the front of the wheel can be added: tap/click it
 * or drag it into the bag. The sequence lives only in the parent's v-model (memory); nothing here
 * writes it to storage, the URL or logs.
 */
const props = withDefaults(defineProps<{ modelValue: string[]; max?: number; label?: string }>(), {
  max: MAX_ITEMS,
  label: 'Ổ xoay dụng cụ học tập',
})
const emit = defineEmits<{
  'update:modelValue': [value: string[]]
  /** Tried to add past the maximum. */
  full: []
  /** The bag was emptied because the tab was hidden. */
  cleared: []
}>()

const COLOR_NAME: Record<ItemColor, string> = { red: 'Đỏ', blue: 'Xanh dương', yellow: 'Vàng', green: 'Xanh lá' }
const THEME: Record<ItemColor, { fill: string; soft: string; deep: string }> = {
  red: { fill: '#e5484d', soft: '#ffd9da', deep: '#a8262b' },
  blue: { fill: '#3b82f6', soft: '#d6e6ff', deep: '#1e4fae' },
  yellow: { fill: '#f5b400', soft: '#ffefbf', deep: '#a87600' },
  green: { fill: '#22a06b', soft: '#cdf3e0', deep: '#146b46' },
}
const SLOTS = ITEM_KINDS.length
const STEP_DEG = 360 / SLOTS

function randomBelow(n: number) {
  const buf = new Uint32Array(1)
  crypto.getRandomValues(buf)
  return (buf[0] ?? 0) % n
}

// ===== Wheel state (all of it re-randomised for every attempt) =====
const kindOrder = ref<ItemKind[]>([...ITEM_KINDS])
const colorIndex = ref(0)
const turn = ref(0) // unbounded, so the wheel always animates the short way round
const spinKey = ref(0)

const color = computed<ItemColor>(() => ITEM_COLORS[colorIndex.value]!)
const theme = computed(() => THEME[color.value])
const frontSlot = computed(() => ((turn.value % SLOTS) + SLOTS) % SLOTS)

function itemAt(slot: number): BagItem {
  return itemById(`${kindOrder.value[slot]}_${color.value}`)!
}
const frontItem = computed(() => itemAt(frontSlot.value))

/** Signed distance of a slot from the front, in -4..4. */
function offsetOf(slot: number) {
  let d = (((slot - turn.value) % SLOTS) + SLOTS) % SLOTS
  if (d > SLOTS / 2) d -= SLOTS
  return d
}

const wheelItems = computed(() => Array.from({ length: SLOTS }, (_, slot) => {
  const d = offsetOf(slot)
  const angle = (d * STEP_DEG * Math.PI) / 180
  const depth = (Math.cos(angle) + 1) / 2 // 1 at the front, 0 at the back
  return {
    slot,
    item: itemAt(slot),
    front: d === 0,
    style: {
      '--sin': Math.sin(angle).toFixed(4),
      '--lift': (1 - depth).toFixed(4),
      '--scale': (0.46 + 0.54 * depth).toFixed(4),
      opacity: (0.3 + 0.7 * depth).toFixed(3),
      zIndex: String(Math.round(depth * 20)),
    },
  }
}))

/** New random kind order, colour and position for the next attempt (never part of the secret). */
function reshuffle() {
  const seen = new Set<ItemKind>()
  kindOrder.value = shuffledCatalog().map(item => item.kind).filter(kind => !seen.has(kind) && seen.add(kind))
  colorIndex.value = randomBelow(ITEM_COLORS.length)
  turn.value = randomBelow(SLOTS)
}

const hideCount = ref(false)
const live = ref('')
const bump = ref(0)
const bagEl = ref<HTMLElement | null>(null)
const wheelEl = ref<HTMLElement | null>(null)
const count = computed(() => props.modelValue.length)

function say(text: string) {
  live.value = ''
  requestAnimationFrame(() => { live.value = text })
}

function add(id: string) {
  if (count.value >= props.max) {
    emit('full')
    return
  }
  emit('update:modelValue', [...props.modelValue, id])
  bump.value++
  say('Đã thêm một món')
}

function undo() {
  if (!count.value) return
  emit('update:modelValue', props.modelValue.slice(0, -1))
  say('Đã trả lại món cuối')
}

function reset() {
  emit('update:modelValue', [])
  say('Đã làm lại, cặp trống')
}

function rotate(steps: number) {
  turn.value += steps
  // Keyboard focus follows the front slot, whatever turned the wheel (mouse wheel, arrows, drag),
  // so Space / Enter always act on the item in the middle.
  if (wheelEl.value?.contains(document.activeElement)) focusFront()
}

function setColor(index: number) {
  const next = ((index % ITEM_COLORS.length) + ITEM_COLORS.length) % ITEM_COLORS.length
  if (next === colorIndex.value) return
  colorIndex.value = next
  spinKey.value++
}

function focusFront() {
  nextTick(() => wheelEl.value?.querySelector<HTMLButtonElement>('.wheel-item.front')?.focus({ preventScroll: true }))
}

// ===== Keyboard focus =====
// The shortcuts only reach the wheel while focus is in it, so focus is brought back to the front
// item whenever a pad control is used with the mouse (colour chips, arrows, Trả lại, Làm lại,
// the discreet toggle, the mouse wheel). The page's own actions (the slot) and text fields keep
// their focus, and a control reached with Tab keeps its native Enter / Space behaviour.
const rootEl = ref<HTMLElement | null>(null)
const me = Symbol('bag-pad')

function isTextField(el: Element | null) {
  return !!el && (el instanceof HTMLInputElement && !['checkbox', 'radio', 'button'].includes(el.type)
    || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement || (el as HTMLElement).isContentEditable)
}

function inSlot(el: Element | null) {
  return !!el?.closest('.bag-actions')
}

function onRootClick(event: MouseEvent) {
  activePad.current = me
  const target = event.target as Element | null
  // detail === 0 is a keyboard-triggered click: leave focus where the user put it.
  if (!event.detail || inSlot(target) || isTextField(target)) return
  focusFront()
}

/** Page-level shortcuts for when focus is on the page body (nothing focused), e.g. right after a game starts. */
function onDocumentKey(event: KeyboardEvent) {
  if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return
  const target = event.target as Element | null
  const onBody = !target || target === document.body || target === document.documentElement
  if (!onBody || activePad.current !== me || !rootEl.value?.isConnected) return
  onWheelKey(event)
}


function onWheelKey(event: KeyboardEvent) {
  const actions: Record<string, () => void> = {
    ArrowLeft: () => rotate(-1),
    ArrowRight: () => rotate(1),
    ArrowUp: () => setColor(colorIndex.value - 1),
    ArrowDown: () => setColor(colorIndex.value + 1),
    Backspace: undo,
    Delete: undo,
    // Handled here rather than by the focused button's own click, so they add the front item
    // even if focus is on another slot for a moment.
    ' ': () => add(frontItem.value.id),
    Enter: () => add(frontItem.value.id),
  }
  const action = actions[event.key]
  if (!action) return
  event.preventDefault()
  if (event.repeat && (event.key === ' ' || event.key === 'Enter')) return // holding the key adds once
  action()
  focusFront()
}

// ===== Mouse wheel / trackpad over the wheel =====
// One wheel notch turns one slot; Shift + wheel changes the colour. Trackpads send many small
// deltas, so they are summed and each step is followed by a short pause, keeping the spin
// controllable. The page does not scroll while the pointer is over the wheel.
const WHEEL_STEP_PX = 60
const WHEEL_PAUSE_MS = 110
const WHEEL_IDLE_MS = 220
let wheelSum = 0
let wheelPausedUntil = 0
let wheelLastAt = 0

function onWheelScroll(event: WheelEvent) {
  const scale = event.deltaMode === 1 ? 40 : event.deltaMode === 2 ? 400 : 1 // lines / pages → px
  const dx = event.deltaX * scale
  const dy = event.deltaY * scale
  const delta = Math.abs(dx) > Math.abs(dy) ? dx : dy
  if (!delta) return
  event.preventDefault()
  const now = performance.now()
  if (now - wheelLastAt > WHEEL_IDLE_MS) wheelSum = 0
  wheelLastAt = now
  if (now < wheelPausedUntil) return
  wheelSum += delta
  if (Math.abs(wheelSum) < WHEEL_STEP_PX) return
  const step = Math.sign(wheelSum)
  wheelSum = 0
  wheelPausedUntil = now + WHEEL_PAUSE_MS
  if (!isTextField(document.activeElement)) focusFront()
  if (event.shiftKey) setColor(colorIndex.value + step)
  else rotate(step)
}

// ===== Pointer gestures on the wheel =====
// Front item: mouse/pen drag after a small move; on touch, hold briefly to pick it up (so a swipe
// can still spin the wheel). Anywhere else, or a quick horizontal swipe: spin the wheel.
const TOUCH_HOLD_MS = 300
const MOVE_SLOP = 8
const SWIPE_STEP_PX = 56

interface Gesture {
  pointerId: number
  x: number
  y: number
  onFront: boolean
  touch: boolean
  mode: 'pending' | 'drag' | 'swipe'
  held: boolean
  moved: boolean
  steps: number
  timer?: ReturnType<typeof setTimeout>
}

let gesture: Gesture | null = null
const drag = ref<{ id: string; x: number; y: number } | null>(null)
const overBag = ref(false)
let suppressClick = false

function swallowNextClick() {
  // The browser dispatches its synthetic click straight after pointerup, before any timer runs.
  suppressClick = true
  setTimeout(() => { suppressClick = false })
}

function endGesture() {
  if (gesture?.timer) clearTimeout(gesture.timer)
  gesture = null
  drag.value = null
  overBag.value = false
}

function onWheelPointerDown(event: PointerEvent) {
  if (event.button !== 0) return
  endGesture()
  const target = (event.target as HTMLElement).closest<HTMLElement>('.wheel-item')
  const onFront = !!target?.classList.contains('front')
  const touch = event.pointerType === 'touch'
  const current: Gesture = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, onFront, touch, mode: 'pending', held: false, moved: false, steps: 0 }
  if (onFront && touch) {
    current.timer = setTimeout(() => {
      if (gesture !== current || current.mode !== 'pending') return
      current.mode = 'drag'
      current.held = true
      drag.value = { id: frontItem.value.id, x: current.x, y: current.y }
    }, TOUCH_HOLD_MS)
  }
  gesture = current
}

function insideBag(x: number, y: number) {
  const rect = bagEl.value?.getBoundingClientRect()
  return !!rect && x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom
}

function onPointerMove(event: PointerEvent) {
  const g = gesture
  if (!g || event.pointerId !== g.pointerId) return
  const dx = event.clientX - g.x
  const dy = event.clientY - g.y
  const far = Math.hypot(dx, dy) >= MOVE_SLOP

  if (g.mode === 'pending') {
    if (g.onFront && !g.touch && far) {
      g.mode = 'drag'
    } else if (Math.abs(dx) >= 10 && Math.abs(dx) > Math.abs(dy)) {
      if (g.timer) clearTimeout(g.timer)
      g.mode = 'swipe'
    } else if (g.touch && Math.abs(dy) >= 10) {
      endGesture() // a vertical finger move scrolls the page
      return
    } else {
      return
    }
  }

  if (g.mode === 'swipe') {
    const steps = Math.round(-dx / SWIPE_STEP_PX)
    if (steps !== g.steps) {
      rotate(steps - g.steps)
      g.steps = steps
    }
    return
  }

  if (far) g.moved = true
  drag.value = { id: frontItem.value.id, x: event.clientX, y: event.clientY }
  overBag.value = insideBag(event.clientX, event.clientY)
}

// Keep the page still under a finger that is dragging an item or spinning the wheel.
function onTouchMove(event: TouchEvent) {
  if (gesture?.touch && gesture.mode !== 'pending' && event.cancelable) event.preventDefault()
}

function onPointerUp(event: PointerEvent) {
  const g = gesture
  if (!g || event.pointerId !== g.pointerId) return
  if (g.mode === 'drag') {
    if (g.moved && drag.value) {
      // One drop adds exactly one item; a drop outside the bag adds nothing.
      if (insideBag(event.clientX, event.clientY)) add(drag.value.id)
    } else if (g.held) {
      // Held but not moved: a slow tap on the front item.
      add(frontItem.value.id)
    }
    swallowNextClick()
  } else if (g.mode === 'swipe') {
    swallowNextClick()
  }
  endGesture()
}

function onItemClick(slot: number) {
  if (suppressClick) return
  const d = offsetOf(slot)
  if (d === 0) add(itemAt(slot).id)
  else rotate(d) // a side item comes round to the front first
}

// Leaving the tab empties the bag.
function onVisibility() {
  if (document.visibilityState !== 'hidden' || !count.value) return
  emit('update:modelValue', [])
  emit('cleared')
}

onMounted(() => {
  activePad.current = me
  document.addEventListener('keydown', onDocumentKey)
  reshuffle()
  // Non-passive, so the page stays put while the wheel is being spun.
  wheelEl.value?.addEventListener('wheel', onWheelScroll, { passive: false })
  document.addEventListener('visibilitychange', onVisibility)
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)
  window.addEventListener('pointercancel', endGesture)
  window.addEventListener('touchmove', onTouchMove, { passive: false })
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onDocumentKey)
  if (activePad.current === me) activePad.current = null
  document.removeEventListener('visibilitychange', onVisibility)
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerUp)
  window.removeEventListener('pointercancel', endGesture)
  window.removeEventListener('touchmove', onTouchMove)
  wheelEl.value?.removeEventListener('wheel', onWheelScroll)
  endGesture()
})

const dragItem = computed(() => (drag.value ? itemById(drag.value.id) : undefined))

defineExpose({ reshuffle, focus: focusFront })
</script>

<template>
  <div ref="rootEl" class="bag-pad" @click="onRootClick" @pointerdown="activePad.current = me">
    <div class="bag-stage">
      <div class="bag-box">
        <div
          ref="bagEl"
          class="bag"
          :class="{ over: overBag }"
          role="img"
          :aria-label="hideCount ? (count ? 'Cặp đã có đồ' : 'Cặp trống') : `Cặp có ${count} món`"
        >
          <svg :key="bump" viewBox="0 0 120 120" class="bag-art" :class="{ bumped: bump > 0 }" aria-hidden="true">
            <path d="M42 30 C42 14 78 14 78 30" fill="none" stroke="#5b3b8c" stroke-width="7" stroke-linecap="round" />
            <rect x="18" y="28" width="84" height="80" rx="20" fill="#7c5cd6" stroke="#4d318f" stroke-width="3" />
            <path d="M18 56 H102" stroke="#4d318f" stroke-width="3" />
            <rect x="34" y="66" width="52" height="30" rx="10" fill="#9b82ea" stroke="#4d318f" stroke-width="3" />
            <rect x="54" y="50" width="12" height="12" rx="3" fill="#ffd166" stroke="#a87600" stroke-width="2" />
          </svg>
          <span class="bag-count" aria-hidden="true">
            <template v-if="hideCount">{{ count ? 'Cặp đã có đồ' : 'Cặp trống' }}</template>
            <template v-else>{{ count }} món</template>
          </span>
        </div>

        <div class="bag-tools">
          <AppButton type="button" variant="secondary" :disabled="!count" @click="undo" title="Lấy món vừa bỏ vào ra khỏi cặp (phím Backspace)"><Undo2 />Trả lại</AppButton>
          <AppButton type="button" variant="secondary" :disabled="!count" @click="reset"><RotateCcw />Làm lại</AppButton>
        </div>

        <label class="toggle">
          <input v-model="hideCount" type="checkbox" />
          <span>Chế độ kín đáo (ẩn số món)</span>
        </label>
      </div>

      <div
        class="wheel-area"
        :style="{ '--theme': theme.fill, '--theme-soft': theme.soft, '--theme-deep': theme.deep }"
      >
        <div class="color-chips" role="radiogroup" aria-label="Chọn màu">
          <button
            v-for="(c, index) in ITEM_COLORS"
            :key="c"
            type="button"
            role="radio"
            class="chip"
            :class="c"
            :aria-checked="index === colorIndex"
            @click="setColor(index)"
          >
            <span class="dot" aria-hidden="true"></span>{{ COLOR_NAME[c] }}
          </button>
        </div>

        <div
          ref="wheelEl"
          class="wheel"
          role="group"
          :aria-label="`${label}. Mũi tên trái phải để xoay, lên xuống để đổi màu, phím cách để bỏ vào cặp, Backspace để trả lại.`"
          @pointerdown="onWheelPointerDown"
          @keydown="onWheelKey"
          @keyup.space.prevent
        >
          <div :key="spinKey" class="wheel-ring" :class="{ spun: spinKey > 0 }" aria-hidden="true"></div>
          <button
            v-for="entry in wheelItems"
            :key="entry.slot"
            type="button"
            class="wheel-item"
            :class="{ front: entry.front }"
            :style="entry.style"
            :tabindex="entry.front ? 0 : -1"
            :aria-hidden="entry.front ? undefined : 'true'"
            :aria-label="entry.front ? `${entry.item.label} — bấm hoặc kéo vào cặp` : entry.item.label"
            @click="onItemClick(entry.slot)"
            @contextmenu.prevent
          >
            <span class="icon"><BagItemIcon :kind="entry.item.kind" :color="entry.item.color" /></span>
          </button>
          <div class="front-label" aria-hidden="true">{{ frontItem.label }}</div>
        </div>

        <div class="wheel-nav">
          <AppButton type="button" variant="secondary" aria-label="Xoay sang trái" @click="rotate(-1)"><ChevronLeft /></AppButton>
          <span class="hint">Lăn chuột hoặc vuốt để xoay (Shift + lăn để đổi màu), rồi bấm hoặc kéo món ở giữa vào cặp</span>
          <AppButton type="button" variant="secondary" aria-label="Xoay sang phải" @click="rotate(1)"><ChevronRight /></AppButton>
        </div>
        <p class="key-hint"><kbd>←</kbd><kbd>→</kbd> xoay · <kbd>↑</kbd><kbd>↓</kbd> đổi màu · <kbd>Space</kbd> bỏ vào cặp · <kbd>⌫</kbd> trả lại</p>
      </div>

      <div class="bag-actions">
        <slot />
      </div>
    </div>

    <p class="sr-only" aria-live="polite">{{ live }}</p>

    <Teleport to="body">
      <div v-if="drag && dragItem" class="bag-drag-ghost" :style="{ left: `${drag.x}px`, top: `${drag.y}px` }" aria-hidden="true">
        <BagItemIcon :kind="dragItem.kind" :color="dragItem.color" />
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
/* Sized by its container, so it fits a full page, a settings card or a phone alike. */
.bag-pad { container-type: inline-size; }

.bag-stage {
  display: grid;
  grid-template-columns: minmax(0, 1.55fr) minmax(250px, 1fr);
  grid-template-rows: auto 1fr;
  grid-template-areas: 'wheel box' 'wheel actions';
  gap: 12px 22px;
}
.bag-box { grid-area: box; display: grid; align-content: start; gap: 12px; }
.bag-actions { grid-area: actions; display: grid; align-content: start; gap: 12px; }

/* ===== Wheel ===== */
.wheel-area {
  grid-area: wheel;
  container-type: inline-size;
  display: grid;
  gap: 10px;
  padding: 14px;
  border-radius: 22px;
  background:
    radial-gradient(circle at 50% 62%, color-mix(in srgb, var(--theme-soft) 85%, transparent) 0 34%, transparent 70%),
    linear-gradient(160deg, color-mix(in srgb, var(--theme-soft) 55%, var(--surface)), color-mix(in srgb, var(--theme) 14%, var(--surface)));
  border: 1px solid color-mix(in srgb, var(--theme) 28%, var(--border));
  transition: background 320ms ease, border-color 320ms ease;
}

.color-chips { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px; }
.chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 36px;
  padding: 4px 6px;
  border: 2px solid transparent;
  border-radius: 999px;
  background: color-mix(in srgb, var(--surface) 88%, transparent);
  color: var(--text);
  font: inherit;
  font-size: .78rem;
  font-weight: 800;
  cursor: pointer;
  transition: transform 120ms ease, border-color 120ms ease, box-shadow 120ms ease;
}
.chip .dot { width: 14px; height: 14px; border-radius: 50%; flex: none; box-shadow: inset 0 -2px 0 rgb(0 0 0 / .18); }
.chip.red .dot { background: #e5484d; }
.chip.blue .dot { background: #3b82f6; }
.chip.yellow .dot { background: #f5b400; }
.chip.green .dot { background: #22a06b; }
.chip:hover { transform: translateY(-1px); }
.chip[aria-checked='true'] { border-color: var(--theme); box-shadow: 0 4px 14px color-mix(in srgb, var(--theme) 35%, transparent); }
.chip:focus-visible { outline: 3px solid var(--color-primary); outline-offset: 2px; }

.wheel {
  --ring: min(40cqw, 230px);
  position: relative;
  height: clamp(190px, 46cqw, 260px);
  touch-action: pan-y;
  user-select: none;
  -webkit-user-select: none;
  cursor: grab;
}
.wheel-ring {
  position: absolute;
  left: 50%;
  top: 58%;
  width: calc(var(--ring) * 2.1);
  height: calc(var(--ring) * .62);
  border-radius: 50%;
  transform: translate(-50%, -50%);
  border: 3px dashed color-mix(in srgb, var(--theme) 45%, transparent);
  background: radial-gradient(ellipse at center, color-mix(in srgb, var(--theme) 16%, transparent), transparent 70%);
  pointer-events: none;
}
.wheel-ring.spun { animation: ring-spin 520ms cubic-bezier(.3, 1.4, .5, 1); }

.wheel-item {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 78px;
  height: 78px;
  display: grid;
  place-items: center;
  padding: 0;
  border: 2px solid color-mix(in srgb, var(--theme) 30%, var(--border));
  border-radius: 22px;
  background: var(--surface-raised, var(--surface));
  box-shadow: 0 6px 16px rgb(0 0 0 / .12);
  cursor: pointer;
  touch-action: pan-y;
  -webkit-touch-callout: none;
  transform:
    translate(-50%, -50%)
    translate(calc(var(--ring) * var(--sin)), calc(var(--lift) * -30px + 8px))
    scale(var(--scale));
  transition: transform 360ms cubic-bezier(.3, 1.25, .5, 1), opacity 360ms ease, box-shadow 200ms ease, border-color 200ms ease;
}
.wheel-item .icon { width: 58px; height: 58px; pointer-events: none; }
.wheel-item.front {
  border-color: var(--theme);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--theme) 22%, transparent), 0 12px 26px color-mix(in srgb, var(--theme-deep) 30%, transparent);
  cursor: grab;
}
.wheel-item.front:active { cursor: grabbing; }
.wheel-item:focus-visible { outline: 3px solid var(--color-primary); outline-offset: 3px; }
.front-label {
  position: absolute;
  left: 50%;
  bottom: 2px;
  transform: translateX(-50%);
  padding: 3px 12px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--surface) 90%, transparent);
  color: var(--theme-deep);
  font-size: .82rem;
  font-weight: 900;
  white-space: nowrap;
  pointer-events: none;
}

.wheel-nav { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 8px; }
.wheel-nav :deep(.app-button) { min-width: 44px; padding-inline: 10px; }
.hint { text-align: center; color: var(--text-muted); font-size: .78rem; line-height: 1.3; }
/* Keyboard shortcuts: only where there is a real keyboard and mouse. */
.key-hint { display: none; margin: 0; text-align: center; color: var(--text-muted); font-size: .74rem; }
.key-hint kbd { display: inline-block; min-width: 1.6em; margin: 0 1px; padding: 1px 5px; border: 1px solid var(--border); border-bottom-width: 2px; border-radius: 6px; background: var(--surface); font: inherit; font-weight: 800; }
@media (hover: hover) and (pointer: fine) { .key-hint { display: block; } }

/* ===== Bag ===== */
.bag {
  position: relative;
  display: grid;
  justify-items: center;
  padding: 14px;
  border: 2px dashed color-mix(in srgb, var(--color-primary) 30%, var(--border));
  border-radius: 22px;
  background: color-mix(in srgb, var(--color-primary) 6%, var(--surface));
  transition: border-color 120ms ease, background 120ms ease;
}
.bag.over { border-color: var(--color-primary); background: color-mix(in srgb, var(--color-primary) 14%, var(--surface)); }
.bag-art { width: 132px; height: 132px; }
/* The same small bounce for every item, right or wrong. */
.bag-art.bumped { animation: bag-bump 260ms ease; }
.bag-count { margin-top: 4px; font-weight: 900; color: var(--text); }

.bag-tools { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 8px; }
.toggle { display: flex; align-items: center; gap: 8px; font-size: .85rem; color: var(--text-muted); }

.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }

.bag-drag-ghost {
  position: fixed;
  z-index: 60;
  width: 56px;
  height: 56px;
  pointer-events: none;
  transform: translate(-50%, -50%);
  filter: drop-shadow(0 6px 10px rgb(0 0 0 / .25));
}

@keyframes bag-bump { 40% { transform: scale(1.06) rotate(-2deg); } }
@keyframes ring-spin { 0% { transform: translate(-50%, -50%) rotate(0) scale(.92); } 100% { transform: translate(-50%, -50%) rotate(360deg) scale(1); } }

/* Narrow: the bag sits above the wheel and stays pinned while the page scrolls. */
@container (max-width: 780px) {
  .bag-stage { grid-template-columns: 1fr; grid-template-rows: none; grid-template-areas: 'box' 'wheel' 'actions'; }
  .bag-box {
    position: sticky;
    top: 8px;
    z-index: 5;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    gap: 8px 12px;
    padding: 10px;
    border-radius: 18px;
    background: color-mix(in srgb, var(--surface) 94%, transparent);
    box-shadow: var(--shadow-md);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
  }
  .bag { grid-row: span 2; grid-template-columns: auto; padding: 6px 10px; }
  .bag-art { width: 64px; height: 64px; }
  .bag-count { font-size: .85rem; }
  .bag-tools { grid-template-columns: 1fr 1fr; }
  .bag-tools :deep(.app-button) { min-height: 38px; padding-inline: 8px; font-size: .8rem; white-space: normal; line-height: 1.15; }
  .toggle { font-size: .78rem; }
}

@container (max-width: 420px) {
  .wheel { --ring: 41cqw; height: 200px; }
  .wheel-item { width: 60px; height: 60px; border-radius: 18px; }
  .wheel-item.front { width: 68px; height: 68px; }
  .wheel-item .icon { width: 44px; height: 44px; }
  .wheel-item.front .icon { width: 52px; height: 52px; }
  .chip { font-size: .7rem; gap: 4px; }
}

@media (prefers-reduced-motion: reduce) {
  .bag-art.bumped, .wheel-ring.spun { animation: none; }
  .wheel-item, .wheel-area { transition: none; }
}
</style>
