<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { RotateCcw, Undo2 } from 'lucide-vue-next'
import AppButton from '../ui/AppButton.vue'
import BagItemIcon from './BagItemIcon.vue'
import { itemById, type BagItem } from '../../features/auth-bag/catalog'
import { MAX_ITEMS, shuffledCatalog } from '../../features/auth-bag/sequence'

/*
 * AUTH-BAG-001 input pad: the desk of school supplies and the closed bag they go into.
 * The sequence lives only in the parent's v-model (memory); nothing here writes it to storage,
 * the URL or logs. Tap/click, keyboard (buttons) and drag-and-drop each add exactly one item.
 */
const props = withDefaults(defineProps<{ modelValue: string[]; max?: number; label?: string }>(), {
  max: MAX_ITEMS,
  label: 'Bàn dụng cụ học tập',
})
const emit = defineEmits<{
  'update:modelValue': [value: string[]]
  /** Tried to add past the maximum. */
  full: []
  /** The bag was emptied because the tab was hidden. */
  cleared: []
}>()

const desk = ref<BagItem[]>(shuffledCatalog())
const hideCount = ref(false)
const live = ref('')
const bump = ref(0)
const bagEl = ref<HTMLElement | null>(null)
const count = computed(() => props.modelValue.length)

function say(text: string) {
  // Re-announce identical text by clearing first.
  live.value = ''
  requestAnimationFrame(() => { live.value = text })
}

/** New desk order for the next attempt (positions are never part of the secret). */
function reshuffle() {
  desk.value = shuffledCatalog()
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
  say('Đã lấy lại món cuối')
}

function reset() {
  emit('update:modelValue', [])
  say('Đã làm lại, cặp trống')
}

// ===== Drag and drop =====
// Mouse and pen start a drag after a small movement. On touch screens a plain swipe has to keep
// scrolling the page (the desk fills most of a phone screen), so a finger first holds an item for
// a moment to pick it up; from then on the page stops scrolling and the item follows the finger.
const TOUCH_HOLD_MS = 300
const MOVE_SLOP = 8

interface Press {
  id: string
  x: number
  y: number
  pointerId: number
  touch: boolean
  held: boolean
  moved: boolean
  timer?: ReturnType<typeof setTimeout>
}

let press: Press | null = null
const drag = ref<{ id: string; x: number; y: number } | null>(null)
const overBag = ref(false)
let suppressClick = false

function endPress() {
  if (press?.timer) clearTimeout(press.timer)
  press = null
  drag.value = null
  overBag.value = false
}

function onItemPointerDown(item: BagItem, event: PointerEvent) {
  if (event.button !== 0) return
  endPress()
  const touch = event.pointerType === 'touch'
  const current: Press = { id: item.id, x: event.clientX, y: event.clientY, pointerId: event.pointerId, touch, held: !touch, moved: false }
  if (touch) {
    current.timer = setTimeout(() => {
      if (press !== current) return
      current.held = true
      drag.value = { id: current.id, x: current.x, y: current.y }
    }, TOUCH_HOLD_MS)
  }
  press = current
}

function insideBag(x: number, y: number) {
  const rect = bagEl.value?.getBoundingClientRect()
  return !!rect && x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom
}

function onPointerMove(event: PointerEvent) {
  if (!press || event.pointerId !== press.pointerId) return
  const far = Math.hypot(event.clientX - press.x, event.clientY - press.y) >= MOVE_SLOP
  if (!press.held) {
    // A finger moving before the hold completes is scrolling the page, not dragging.
    if (far) endPress()
    return
  }
  if (!drag.value && !far) return
  if (far) press.moved = true
  drag.value = { id: press.id, x: event.clientX, y: event.clientY }
  overBag.value = insideBag(event.clientX, event.clientY)
}

// While a held item is being dragged, keep the page from scrolling under the finger (without
// this the browser takes the gesture over and cancels the drag).
function onTouchMove(event: TouchEvent) {
  if (press?.touch && press.held && event.cancelable) event.preventDefault()
}

function onPointerUp(event: PointerEvent) {
  if (!press || event.pointerId !== press.pointerId) return
  if (press.touch && press.held && !press.moved) {
    // Held but not moved: a slow tap. Add it here, since a long press may not produce a click.
    add(press.id)
    suppressClick = true
    setTimeout(() => { suppressClick = false })
  } else if (drag.value) {
    // One drop adds exactly one item; a drop outside the bag adds nothing.
    if (insideBag(event.clientX, event.clientY)) add(drag.value.id)
    // The browser dispatches its synthetic click straight after this pointerup, before any
    // timer runs; swallow only that one, so quick taps right after a drag still count.
    suppressClick = true
    setTimeout(() => { suppressClick = false })
  }
  endPress()
}

function onPointerCancel() {
  endPress()
}

function onItemClick(item: BagItem) {
  if (suppressClick) return
  add(item.id)
}

// Leaving the tab empties the bag.
function onVisibility() {
  if (document.visibilityState !== 'hidden' || !count.value) return
  emit('update:modelValue', [])
  emit('cleared')
}

onMounted(() => {
  document.addEventListener('visibilitychange', onVisibility)
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)
  window.addEventListener('pointercancel', onPointerCancel)
  window.addEventListener('touchmove', onTouchMove, { passive: false })
})

onBeforeUnmount(() => {
  document.removeEventListener('visibilitychange', onVisibility)
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerUp)
  window.removeEventListener('pointercancel', onPointerCancel)
  window.removeEventListener('touchmove', onTouchMove)
  endPress()
})

const dragItem = computed(() => (drag.value ? itemById(drag.value.id) : undefined))

defineExpose({ reshuffle })
</script>

<template>
  <div class="bag-pad">
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
          <AppButton type="button" variant="secondary" :disabled="!count" @click="undo"><Undo2 />Lấy lại món cuối</AppButton>
          <AppButton type="button" variant="secondary" :disabled="!count" @click="reset"><RotateCcw />Làm lại</AppButton>
        </div>

        <label class="toggle">
          <input v-model="hideCount" type="checkbox" />
          <span>Chế độ kín đáo (ẩn số món)</span>
        </label>
      </div>

      <div class="desk" role="group" :aria-label="label">
        <button
          v-for="item in desk"
          :key="item.id"
          type="button"
          class="desk-item"
          :aria-label="item.label"
          @pointerdown="onItemPointerDown(item, $event)"
          @contextmenu.prevent
          @click="onItemClick(item)"
        >
          <span class="icon"><BagItemIcon :kind="item.kind" :color="item.color" /></span>
          <span class="label">{{ item.label }}</span>
        </button>
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
  grid-template-areas: 'desk box' 'desk actions';
  gap: 12px 22px;
}
.bag-box { grid-area: box; display: grid; align-content: start; gap: 12px; }
.bag-actions { grid-area: actions; display: grid; align-content: start; gap: 12px; }

.desk {
  grid-area: desk;
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  align-content: start;
  gap: 10px;
  padding: 14px;
  border-radius: 20px;
  background:
    repeating-linear-gradient(90deg, transparent 0 58px, color-mix(in srgb, #8b5a2b 10%, transparent) 58px 60px),
    color-mix(in srgb, #c68b4f 22%, var(--surface));
}

.desk-item {
  display: grid;
  justify-items: center;
  gap: 4px;
  padding: 8px 4px;
  border: 1px solid color-mix(in srgb, var(--border) 70%, transparent);
  border-radius: 14px;
  background: color-mix(in srgb, var(--surface-raised) 88%, transparent);
  color: var(--text);
  cursor: grab;
  touch-action: manipulation;
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
  transition: transform 80ms ease, background 80ms ease;
}
/* Only a brief press state: no lasting highlight that tells an onlooker what was picked. */
.desk-item:active { transform: scale(.94); }
.desk-item:focus-visible { outline: 3px solid var(--color-primary); outline-offset: 2px; }
.desk-item .icon { width: 46px; height: 46px; pointer-events: none; }
.desk-item .label { font-size: .7rem; line-height: 1.2; text-align: center; pointer-events: none; }

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
  width: 52px;
  height: 52px;
  pointer-events: none;
  transform: translate(-50%, -50%);
  filter: drop-shadow(0 6px 10px rgb(0 0 0 / .25));
}

@keyframes bag-bump { 40% { transform: scale(1.06) rotate(-2deg); } }

/* Narrow: the bag sits above the desk and stays pinned while the desk scrolls, so the bag and
   its undo/reset are always in view; the submit actions follow the desk. */
@container (max-width: 780px) {
  .bag-stage { grid-template-columns: 1fr; grid-template-rows: none; grid-template-areas: 'box' 'desk' 'actions'; }
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

@container (max-width: 500px) {
  .desk { grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; padding: 10px; }
  .desk-item .icon { width: 40px; height: 40px; }
}

@media (prefers-reduced-motion: reduce) {
  .bag-art.bumped { animation: none; }
  .desk-item { transition: none; }
}
</style>
