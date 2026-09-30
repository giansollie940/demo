<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { Gamepad2 } from 'lucide-vue-next'
import AppButton from '../ui/AppButton.vue'
import BagPad from './BagPad.vue'
import BagItemIcon from './BagItemIcon.vue'
import { itemById } from '../../features/auth-bag/catalog'
import { firstMismatch, gameRound, GAME_LIVES, GAME_MEMORY_FROM_LEVEL, roundSeconds } from '../../features/auth-bag/game'
import { MAX_ITEMS } from '../../features/auth-bag/sequence'

/*
 * "Xếp cặp theo đề" game: packing list, wheel and bag, levels and lives. Where the score goes is
 * the parent's business: it listens to `start` / `over` and fills the #over slot (board, save).
 * Starts a game as soon as it is mounted.
 */
const props = defineProps<{ best?: number; replaySecondary?: boolean }>()
const emit = defineEmits<{
  start: []
  over: [result: { score: number; level: number }]
  /** Enter / submit while the game is over (e.g. to save a name). */
  overSubmit: []
  exit: []
}>()

type Tone = 'info' | 'error' | 'success'
const message = ref<{ tone: Tone; text: string } | null>(null)
function notify(tone: Tone, text: string) {
  message.value = { tone, text }
}

const pad = ref<InstanceType<typeof BagPad> | null>(null)
const draft = ref<string[]>([])
const level = ref(1)
const lives = ref(GAME_LIVES)
const over = ref(false)
const target = ref<string[]>([])
const score = computed(() => level.value - 1) // rounds packed correctly
const listHidden = computed(() => level.value >= GAME_MEMORY_FROM_LEVEL && draft.value.length > 0)

function nextAttempt() {
  draft.value = []
  pad.value?.reshuffle()
}

// ===== Round timer =====
// Each round (and each retry) gets roundSeconds(level). Running out costs a life and deals a
// fresh list at the same level. The clock pauses while the tab is hidden (the bag is emptied
// then anyway) and stops when the game is over.
const TICK_MS = 100
const limitMs = ref(0)
const leftMs = ref(0)
let lastTick = 0
let timer: ReturnType<typeof setInterval> | undefined
const secondsLeft = computed(() => Math.ceil(leftMs.value / 1000))
const timeRatio = computed(() => (limitMs.value ? leftMs.value / limitMs.value : 0))

function startClock() {
  limitMs.value = roundSeconds(level.value) * 1000
  leftMs.value = limitMs.value
  lastTick = performance.now()
  clearInterval(timer)
  timer = setInterval(tick, TICK_MS)
}

function stopClock() {
  clearInterval(timer)
  timer = undefined
}

function tick() {
  const now = performance.now()
  const elapsed = now - lastTick
  lastTick = now
  if (document.hidden || over.value) return
  leftMs.value = Math.max(0, leftMs.value - elapsed)
  if (leftMs.value === 0) timeUp()
}

function timeUp() {
  nextAttempt()
  loseLife('Hết giờ!', true)
}

function start() {
  over.value = false
  level.value = 1
  lives.value = GAME_LIVES
  target.value = gameRound(1)
  nextAttempt()
  startClock()
  notify('info', `Xếp đúng các món theo đề rồi bấm "Kiểm tra" trước khi hết giờ. Bạn có ${GAME_LIVES} mạng.`)
  pad.value?.focus()
  emit('start')
}

function check() {
  if (!draft.value.length) return notify('error', 'Cặp đang trống.')
  const wrongAt = firstMismatch(target.value, draft.value)
  const packed = draft.value.length
  nextAttempt()
  if (wrongAt === -1) {
    level.value++
    target.value = gameRound(level.value)
    startClock()
    const memo = level.value === GAME_MEMORY_FROM_LEVEL ? ' Từ giờ đề sẽ ẩn khi bạn bắt đầu xếp: thử trí nhớ nhé!' : ''
    return notify('success', `Chính xác! Lên cấp ${level.value}.${memo}`)
  }
  const why = wrongAt >= packed ? `Còn thiếu món thứ ${wrongAt + 1}.`
    : wrongAt >= target.value.length ? 'Cặp bị thừa món.'
    : `Món thứ ${wrongAt + 1} chưa đúng.`
  loseLife(why, false)
}

/** A miss or a timeout. A timeout moves on to a fresh list; a wrong bag retries the same one. */
function loseLife(why: string, newList: boolean) {
  lives.value--
  if (lives.value > 0) {
    if (newList) target.value = gameRound(level.value)
    startClock()
    return notify('error', newList ? `${why} Còn ${lives.value} mạng, sang đề mới nào!` : `${why} Còn ${lives.value} mạng, xếp lại nào!`)
  }
  over.value = true
  stopClock()
  notify('info', `${why} Hết mạng rồi! Điểm của bạn: ${score.value}.`)
  emit('over', { score: score.value, level: level.value })
}

function submit() {
  if (over.value) return emit('overSubmit')
  check()
  // Back to the wheel, so the next Space adds an item instead of pressing "Kiểm tra" again.
  if (!over.value) pad.value?.focus()
}

onMounted(start)
onBeforeUnmount(() => { stopClock(); draft.value = [] })
defineExpose({ start, notify })
</script>

<template>
  <form class="bag-game" novalidate @submit.prevent="submit">
    <section class="game-card" aria-label="Trò chơi Xếp cặp theo đề">
      <div class="game-head">
        <strong>Xếp cặp theo đề</strong>
        <span class="game-stats">
          Cấp {{ level }} · Điểm {{ score }}<template v-if="props.best"> · Kỷ lục {{ props.best }}</template> ·
          <span class="lives" :aria-label="`Còn ${lives} mạng`"><span v-for="n in GAME_LIVES" :key="n" :class="{ lost: n > lives }" aria-hidden="true">♥</span></span>
        </span>
      </div>

      <div v-if="!over" class="timer" :class="{ low: secondsLeft <= 5 }" role="timer" :aria-label="`Còn ${secondsLeft} giây`">
        <span class="timer-bar"><span :style="{ transform: `scaleX(${timeRatio})` }"></span></span>
        <span class="timer-text" aria-hidden="true">⏱ {{ secondsLeft }}s</span>
      </div>

      <template v-if="over">
        <p class="game-over">Hết mạng! Điểm: <strong>{{ score }}</strong></p>
        <slot name="over" :score="score" :level="level" />
      </template>
      <p v-else-if="listHidden" class="game-hidden">Đề đã ẩn. Nhớ lại và xếp tiếp nhé! (Bấm "Làm lại" để xem đề.)</p>
      <ol v-else class="game-list">
        <li v-for="(id, index) in target" :key="index">
          <span class="n">{{ index + 1 }}.</span>
          <span class="mini"><BagItemIcon :kind="itemById(id)!.kind" :color="itemById(id)!.color" /></span>
          {{ itemById(id)!.label }}
        </li>
      </ol>
    </section>

    <BagPad
      ref="pad"
      v-model="draft"
      class="stage"
      label="Ổ xoay trò chơi"
      @full="notify('error', `Cặp chỉ chứa tối đa ${MAX_ITEMS} món.`)"
      @cleared="notify('info', 'Đã xoá các món trong cặp khi bạn rời tab.')"
    >
      <p v-if="message" class="message" :class="message.tone" role="status">
        <span v-if="message.tone === 'success'" class="sparkles" aria-hidden="true">✨</span>{{ message.text }}
      </p>
      <AppButton v-if="!over" type="submit"><Gamepad2 />Kiểm tra</AppButton>
      <AppButton v-else type="button" :variant="replaySecondary ? 'secondary' : undefined" @click="start"><Gamepad2 />Chơi lại</AppButton>
      <button type="button" class="link" @click="emit('exit')">Thoát trò chơi</button>
    </BagPad>
  </form>
</template>

<style scoped>
.game-card {
  margin-top: 16px; padding: 12px 14px;
  border: 1px dashed color-mix(in srgb, var(--color-primary) 35%, var(--border));
  border-radius: 16px;
  background: color-mix(in srgb, #f5b400 7%, var(--surface));
}
.game-head { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; flex-wrap: wrap; }
.game-stats { color: var(--text-muted); font-size: .82rem; font-weight: 800; }
.game-list { display: flex; flex-wrap: wrap; gap: 6px 14px; margin: 8px 0 0; padding: 0; list-style: none; font-size: .88rem; }
.game-list li { display: flex; align-items: center; gap: 6px; }
.game-list .n { font-weight: 800; color: var(--text-muted); }
.game-hidden { margin: 8px 0 0; color: var(--text-muted); font-size: .88rem; }
.mini { display: inline-block; width: 22px; height: 22px; }
.lives { color: #e5484d; letter-spacing: 1px; }
.lives .lost { color: var(--border); }
.game-over { margin: 8px 0 0; font-size: 1rem; }
.timer { display: flex; align-items: center; gap: 8px; margin-top: 8px; }
.timer-bar { flex: 1; height: 8px; overflow: hidden; border-radius: 999px; background: color-mix(in srgb, var(--color-primary) 12%, var(--surface)); }
.timer-bar span { display: block; height: 100%; background: linear-gradient(90deg, #22a06b, #f5b400); transform-origin: left; transition: transform 100ms linear; }
.timer.low .timer-bar span { background: #e5484d; }
.timer-text { min-width: 3.2em; font-size: .82rem; font-weight: 800; font-variant-numeric: tabular-nums; color: var(--text-muted); }
.timer.low .timer-text { color: #e5484d; }
.stage { margin-top: 18px; }
.link { justify-self: start; padding: 0; border: 0; background: none; color: var(--color-primary); font: inherit; font-weight: 700; cursor: pointer; }
.link:hover { text-decoration: underline; }

.message { margin: 0; padding: 10px 12px; border-radius: 12px; font-size: .9rem; line-height: 1.45; }
.message.info { background: color-mix(in srgb, var(--color-sky, #3b82f6) 12%, var(--surface)); }
.message.error { background: color-mix(in srgb, var(--color-danger) 12%, var(--surface)); color: var(--color-danger); }
.message.success {
  background: linear-gradient(120deg, color-mix(in srgb, var(--color-mint, #22a06b) 20%, var(--surface)), color-mix(in srgb, #f5b400 18%, var(--surface)));
  color: var(--text);
  font-weight: 800;
  animation: game-pop 420ms cubic-bezier(.3, 1.5, .5, 1);
}
.sparkles { display: inline-block; margin-right: 6px; }
@keyframes game-pop { 0% { transform: scale(.9); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .message.success { animation: none; } }
</style>
