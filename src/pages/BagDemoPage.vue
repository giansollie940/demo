<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { KeyRound, RotateCcw, Shuffle, Undo2, Eye, EyeOff } from 'lucide-vue-next'
import AuthLayout from '../layouts/AuthLayout.vue'
import AppButton from '../components/ui/AppButton.vue'
import BagItemIcon from '../components/auth-bag/BagItemIcon.vue'
import { itemById, type BagItem } from '../features/auth-bag/catalog'
import { checkPolicy, MAX_ITEMS, MIN_ITEMS, POLICY_MESSAGE, randomSequence, sameSequence, shuffledCatalog } from '../features/auth-bag/sequence'

/*
 * AUTH-BAG-001 prototype — "Mật mã chiếc cặp".
 * Interaction prototype only: nothing is sent to a server, no session is created, and the demo
 * secret lives in this component's memory until the page is left (never in storage or logs).
 */

type Phase = 'create' | 'confirm' | 'login'
type Tone = 'info' | 'error' | 'success'

const LOCK_AFTER_FAILS = 5
const DEMO_LOCK_MS = 60_000 // The spec proposes 15 minutes on the server; shortened for the demo.

const phase = ref<Phase>('create')
const desk = ref<BagItem[]>(shuffledCatalog())
const draft = ref<string[]>([])
const pending = ref<string[] | null>(null)
const enrolled = ref<string[] | null>(null)
const generated = ref<string[] | null>(null)
const showGenerated = ref(false)
const hideCount = ref(false)
const accountCode = ref('')
const message = ref<{ tone: Tone; text: string } | null>(null)
const live = ref('')
const bump = ref(0)
const fails = ref(0)
const lockedUntil = ref(0)
const now = ref(Date.now())

const bagEl = ref<HTMLElement | null>(null)
const locked = computed(() => lockedUntil.value > now.value)
const lockSeconds = computed(() => Math.max(0, Math.ceil((lockedUntil.value - now.value) / 1000)))

const heading = computed(() => ({
  create: 'Bước 1/2 — Tạo mật mã chiếc cặp',
  confirm: 'Bước 2/2 — Nhập lại để xác nhận',
  login: 'Đăng nhập bằng chiếc cặp',
}[phase.value]))

function say(text: string) {
  // Re-announce identical text by clearing first.
  live.value = ''
  requestAnimationFrame(() => { live.value = text })
}

function notify(tone: Tone, text: string) {
  message.value = { tone, text }
}

function newAttempt() {
  draft.value = []
  desk.value = shuffledCatalog()
}

// ===== Adding items: tap/click, keyboard (button click) and drag-and-drop =====
function add(id: string) {
  if (draft.value.length >= MAX_ITEMS) {
    notify('error', `Cặp chỉ chứa tối đa ${MAX_ITEMS} món.`)
    return
  }
  draft.value = [...draft.value, id]
  bump.value++
  say('Đã thêm một món')
}

function undo() {
  if (!draft.value.length) return
  draft.value = draft.value.slice(0, -1)
  say('Đã lấy lại món cuối')
}

function reset() {
  draft.value = []
  say('Đã làm lại, cặp trống')
}

let press: { id: string; x: number; y: number; pointerId: number } | null = null
const drag = ref<{ id: string; x: number; y: number } | null>(null)
const overBag = ref(false)
let suppressClick = false

function onItemPointerDown(item: BagItem, event: PointerEvent) {
  if (event.button !== 0) return
  press = { id: item.id, x: event.clientX, y: event.clientY, pointerId: event.pointerId }
}

function insideBag(x: number, y: number) {
  const rect = bagEl.value?.getBoundingClientRect()
  return !!rect && x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom
}

function onPointerMove(event: PointerEvent) {
  if (!press || event.pointerId !== press.pointerId) return
  if (!drag.value && Math.hypot(event.clientX - press.x, event.clientY - press.y) < 8) return
  drag.value = { id: press.id, x: event.clientX, y: event.clientY }
  overBag.value = insideBag(event.clientX, event.clientY)
}

function onPointerUp(event: PointerEvent) {
  if (!press || event.pointerId !== press.pointerId) return
  if (drag.value) {
    // One drop adds exactly one item; a drop outside the bag adds nothing (EC-002).
    if (insideBag(event.clientX, event.clientY)) add(drag.value.id)
    // The browser dispatches its synthetic click straight after this pointerup, before any
    // timer runs; swallow only that one, so quick taps right after a drag still count.
    suppressClick = true
    setTimeout(() => { suppressClick = false })
  }
  press = null
  drag.value = null
  overBag.value = false
}

function onPointerCancel() {
  press = null
  drag.value = null
  overBag.value = false
}

function onItemClick(item: BagItem) {
  // The browser may fire a click right after a drag ends; that must not count again (RB-004).
  if (suppressClick) return
  add(item.id)
}

// ===== Enrollment =====
function continueCreate() {
  const issue = checkPolicy(draft.value)
  if (issue) {
    notify('error', POLICY_MESSAGE[issue])
    return
  }
  pending.value = [...draft.value]
  goConfirm()
}

function generate() {
  generated.value = randomSequence(12)
  showGenerated.value = false
  notify('info', 'Đã tạo một chuỗi ngẫu nhiên. Bấm "Xem chuỗi để học" khi không có ai nhìn, rồi nhập lại ở bước sau.')
}

function useGenerated() {
  if (!generated.value) return
  pending.value = [...generated.value]
  goConfirm()
}

function goConfirm() {
  generated.value = null
  showGenerated.value = false
  phase.value = 'confirm'
  newAttempt()
  notify('info', 'Nhập lại toàn bộ chuỗi vào chiếc cặp trống.')
}

function confirmEnrollment() {
  const ok = !!pending.value && sameSequence(pending.value, draft.value)
  if (!ok) {
    pending.value = null
    phase.value = 'create'
    newAttempt()
    notify('error', 'Hai lần nhập không khớp. Hãy tạo lại từ bước 1.')
    return
  }
  enrolled.value = pending.value
  pending.value = null
  phase.value = 'login'
  newAttempt()
  notify('success', 'Đã lưu mật mã thử trong bộ nhớ của trang này. Giờ hãy thử đăng nhập.')
}

function startOver() {
  enrolled.value = null
  pending.value = null
  fails.value = 0
  lockedUntil.value = 0
  phase.value = 'create'
  newAttempt()
  message.value = null
}

// ===== Login attempt (simulated) =====
function closeBag() {
  now.value = Date.now()
  if (locked.value) {
    notify('error', `Cách đăng nhập này đang tạm ngưng. Thử lại sau ${lockSeconds.value} giây hoặc dùng mật khẩu.`)
    return
  }
  if (!accountCode.value.trim() || !draft.value.length) {
    notify('error', !accountCode.value.trim() ? 'Hãy nhập mã đăng nhập.' : 'Cặp đang trống.')
    return
  }
  const ok = !!enrolled.value && sameSequence(enrolled.value, draft.value)
  // The sequence is cleared after every result (RB-003 step 7), and the desk reshuffled.
  newAttempt()
  if (ok) {
    fails.value = 0
    notify('success', 'Đúng mật mã. (Bản thử: không có phiên đăng nhập nào được tạo.)')
    return
  }
  fails.value++
  if (fails.value >= LOCK_AFTER_FAILS) {
    fails.value = 0
    lockedUntil.value = Date.now() + DEMO_LOCK_MS
  }
  // One generic message: never which item, colour, count or turn was wrong (RB-003 step 6).
  notify('error', 'Không thể đăng nhập bằng cách này. Kiểm tra thông tin hoặc dùng mật khẩu.')
}

// ===== Leaving the tab clears the bag (§6) =====
function onVisibility() {
  if (document.visibilityState !== 'hidden') return
  const hadItems = draft.value.length > 0 || showGenerated.value
  draft.value = []
  showGenerated.value = false
  if (hadItems) notify('info', 'Đã xoá các món trong cặp khi bạn rời tab.')
}

let clock: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  document.addEventListener('visibilitychange', onVisibility)
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)
  window.addEventListener('pointercancel', onPointerCancel)
  clock = setInterval(() => { now.value = Date.now() }, 1000)
})

onBeforeUnmount(() => {
  document.removeEventListener('visibilitychange', onVisibility)
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerUp)
  window.removeEventListener('pointercancel', onPointerCancel)
  clearInterval(clock)
  draft.value = []
  pending.value = null
  enrolled.value = null
  generated.value = null
})

const dragItem = computed(() => (drag.value ? itemById(drag.value.id) : undefined))
</script>

<template>
  <AuthLayout>
    <section class="bag-demo">
      <header class="bag-head">
        <RouterLink to="/login" class="back">← Dùng mật khẩu</RouterLink>
        <span class="badge">Bản thử — không đăng nhập thật</span>
      </header>

      <div class="bag-title">
        <span class="eyebrow">MẬT MÃ CHIẾC CẶP</span>
        <h1>{{ heading }}</h1>
        <p v-if="phase === 'create'">
          Chọn {{ MIN_ITEMS }}–{{ MAX_ITEMS }} món theo thứ tự bạn muốn; một món có thể chọn nhiều lần.
          Đúng loại, đúng màu, đúng số lượng và đúng thứ tự mới là đúng mật mã. Đừng tạo khi có người đang nhìn.
        </p>
        <p v-else-if="phase === 'confirm'">Nhập lại đúng chuỗi vừa tạo. Hai lần phải khớp hoàn toàn.</p>
        <p v-else>Nhập mã đăng nhập, bỏ đồ vào cặp theo mật mã rồi đóng cặp.</p>
      </div>

      <label v-if="phase === 'login'" class="code-field">
        <span>Mã đăng nhập</span>
        <input v-model.trim="accountCode" autocomplete="off" placeholder="Ví dụ: hs-01" />
      </label>

      <div class="bag-stage">
        <div class="desk" role="group" aria-label="Bàn dụng cụ học tập">
          <button
            v-for="item in desk"
            :key="item.id"
            type="button"
            class="desk-item"
            :aria-label="item.label"
            @pointerdown="onItemPointerDown(item, $event)"
            @click="onItemClick(item)"
          >
            <span class="icon"><BagItemIcon :kind="item.kind" :color="item.color" /></span>
            <span class="label">{{ item.label }}</span>
          </button>
        </div>

        <div class="bag-side">
          <div
            ref="bagEl"
            class="bag"
            :class="{ over: overBag }"
            role="img"
            :aria-label="hideCount ? (draft.length ? 'Cặp đã có đồ' : 'Cặp trống') : `Cặp có ${draft.length} món`"
          >
            <svg :key="bump" viewBox="0 0 120 120" class="bag-art" :class="{ bumped: bump > 0 }" aria-hidden="true">
              <path d="M42 30 C42 14 78 14 78 30" fill="none" stroke="#5b3b8c" stroke-width="7" stroke-linecap="round" />
              <rect x="18" y="28" width="84" height="80" rx="20" fill="#7c5cd6" stroke="#4d318f" stroke-width="3" />
              <path d="M18 56 H102" stroke="#4d318f" stroke-width="3" />
              <rect x="34" y="66" width="52" height="30" rx="10" fill="#9b82ea" stroke="#4d318f" stroke-width="3" />
              <rect x="54" y="50" width="12" height="12" rx="3" fill="#ffd166" stroke="#a87600" stroke-width="2" />
            </svg>
            <span class="bag-count" aria-hidden="true">
              <template v-if="hideCount">{{ draft.length ? 'Cặp đã có đồ' : 'Cặp trống' }}</template>
              <template v-else>{{ draft.length }} món</template>
            </span>
          </div>

          <div class="bag-tools">
            <AppButton variant="secondary" :disabled="!draft.length" @click="undo"><Undo2 />Lấy lại món cuối</AppButton>
            <AppButton variant="secondary" :disabled="!draft.length" @click="reset"><RotateCcw />Làm lại</AppButton>
          </div>

          <label class="toggle">
            <input v-model="hideCount" type="checkbox" />
            <span>Chế độ kín đáo (ẩn số món)</span>
          </label>

          <p v-if="message" class="message" :class="message.tone" role="status">{{ message.text }}</p>

          <div class="primary">
            <template v-if="phase === 'create'">
              <AppButton @click="continueCreate">Tiếp tục</AppButton>
              <AppButton variant="secondary" @click="generate"><Shuffle />Tạo ngẫu nhiên</AppButton>
              <div v-if="generated" class="generated">
                <AppButton variant="secondary" @click="showGenerated = !showGenerated">
                  <EyeOff v-if="showGenerated" /><Eye v-else />{{ showGenerated ? 'Ẩn chuỗi' : 'Xem chuỗi để học' }}
                </AppButton>
                <ol v-if="showGenerated" class="sequence-list">
                  <li v-for="(id, index) in generated" :key="index">
                    <span class="mini"><BagItemIcon :kind="itemById(id)!.kind" :color="itemById(id)!.color" /></span>
                    {{ itemById(id)!.label }}
                  </li>
                </ol>
                <AppButton @click="useGenerated">Dùng chuỗi này</AppButton>
              </div>
            </template>
            <template v-else-if="phase === 'confirm'">
              <AppButton @click="confirmEnrollment">Xác nhận mật mã</AppButton>
              <AppButton variant="secondary" @click="startOver">Tạo lại từ đầu</AppButton>
            </template>
            <template v-else>
              <AppButton :disabled="locked" @click="closeBag"><KeyRound />{{ locked ? `Tạm ngưng ${lockSeconds}s` : 'Đóng cặp — Đăng nhập' }}</AppButton>
              <RouterLink to="/login" class="alt">Dùng mật khẩu</RouterLink>
              <button type="button" class="link" @click="startOver">Tạo lại mật mã thử</button>
            </template>
          </div>
        </div>
      </div>

      <p class="privacy">
        Bản thử chỉ để thử thao tác: không gửi dữ liệu đi đâu, không tạo phiên đăng nhập, mật mã thử mất khi rời trang.
        Chiếc cặp không chống được người quay lại toàn bộ thao tác của bạn.
      </p>
      <p class="sr-only" aria-live="polite">{{ live }}</p>
    </section>

    <div v-if="drag && dragItem" class="drag-ghost" :style="{ left: `${drag.x}px`, top: `${drag.y}px` }" aria-hidden="true">
      <BagItemIcon :kind="dragItem.kind" :color="dragItem.color" />
    </div>
  </AuthLayout>
</template>

<style scoped>
.bag-demo {
  width: min(1120px, calc(100vw - 48px));
  margin: auto;
  padding: 26px clamp(18px, 3vw, 34px) 22px;
  border: 1px solid color-mix(in srgb, var(--color-primary) 14%, var(--border));
  border-radius: 28px;
  background: var(--surface);
  box-shadow: var(--shadow-md);
}

.bag-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; }
.back, .alt { color: var(--color-primary); font-weight: 700; text-decoration: none; }
.back:hover, .alt:hover { text-decoration: underline; }
.badge {
  padding: 5px 11px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--color-warning, #f5b400) 18%, var(--surface));
  color: var(--text);
  font-size: .8rem;
  font-weight: 800;
}

.bag-title { margin-top: 14px; }
.eyebrow { font-size: var(--font-size-ui-min, .72rem); font-weight: 900; letter-spacing: .16em; color: var(--color-primary); }
.bag-title h1 { margin: 6px 0; font-size: clamp(1.5rem, 2.6vw, 2rem); }
.bag-title p { max-width: 72ch; margin: 0; color: var(--text-muted); line-height: 1.55; }

.code-field { display: grid; gap: 6px; max-width: 320px; margin-top: 16px; font-weight: 800; font-size: .85rem; }
.code-field input {
  height: 46px;
  padding: 0 13px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--input);
  color: var(--text);
  font-size: .95rem;
}

.bag-stage { display: grid; grid-template-columns: minmax(0, 1.55fr) minmax(260px, 1fr); gap: 22px; margin-top: 18px; }

.desk {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
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
  transition: transform 80ms ease, background 80ms ease;
}
/* Only a brief press state: no lasting highlight that tells an onlooker what was picked (§6). */
.desk-item:active { transform: scale(.94); }
.desk-item:focus-visible { outline: 3px solid var(--color-primary); outline-offset: 2px; }
.desk-item .icon { width: 46px; height: 46px; pointer-events: none; }
.desk-item .label { font-size: .7rem; line-height: 1.2; text-align: center; pointer-events: none; }

.bag-side { display: grid; align-content: start; gap: 12px; }

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
/* The same small bounce for every item, right or wrong (RB-001). */
.bag-art.bumped { animation: bag-bump 260ms ease; }
.bag-count { margin-top: 4px; font-weight: 900; color: var(--text); }

.bag-tools { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 8px; }
.toggle { display: flex; align-items: center; gap: 8px; font-size: .85rem; color: var(--text-muted); }

.message { margin: 0; padding: 10px 12px; border-radius: 12px; font-size: .9rem; line-height: 1.45; }
.message.info { background: color-mix(in srgb, var(--color-sky, #3b82f6) 12%, var(--surface)); }
.message.error { background: color-mix(in srgb, var(--color-danger) 12%, var(--surface)); color: var(--color-danger); }
.message.success { background: color-mix(in srgb, var(--color-mint, #22a06b) 16%, var(--surface)); }

.primary { display: grid; gap: 8px; }
.link { justify-self: start; padding: 0; border: 0; background: none; color: var(--text-muted); text-decoration: underline; cursor: pointer; }
.generated { display: grid; gap: 8px; padding: 10px; border: 1px dashed var(--border); border-radius: 14px; }
.sequence-list { display: grid; gap: 4px; margin: 0; padding-left: 22px; font-size: .88rem; }
.sequence-list li { display: flex; align-items: center; gap: 6px; }
.mini { display: inline-block; width: 22px; height: 22px; }

.privacy { margin: 16px 0 0; color: var(--text-muted); font-size: .8rem; line-height: 1.5; }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }

.drag-ghost {
  position: fixed;
  z-index: 60;
  width: 52px;
  height: 52px;
  pointer-events: none;
  transform: translate(-50%, -50%);
  filter: drop-shadow(0 6px 10px rgb(0 0 0 / .25));
}

@keyframes bag-bump { 40% { transform: scale(1.06) rotate(-2deg); } }

@media (max-width: 860px) {
  .bag-stage { grid-template-columns: 1fr; }
  .desk { grid-template-columns: repeat(4, minmax(0, 1fr)); }
}

@media (max-width: 560px) {
  .bag-demo { width: calc(100vw - 24px); border-radius: 20px; }
  .desk { gap: 8px; padding: 10px; }
  .desk-item .icon { width: 40px; height: 40px; }
}

@media (prefers-reduced-motion: reduce) {
  .bag-art.bumped { animation: none; }
  .desk-item { transition: none; }
}
</style>
