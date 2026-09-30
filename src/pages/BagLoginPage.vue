<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { Gamepad2, KeyRound } from 'lucide-vue-next'
import AuthLayout from '../layouts/AuthLayout.vue'
import AppButton from '../components/ui/AppButton.vue'
import BagPad from '../components/auth-bag/BagPad.vue'
import BagMark from '../components/auth-bag/BagMark.vue'
import BagItemIcon from '../components/auth-bag/BagItemIcon.vue'
import { itemById } from '../features/auth-bag/catalog'
import { firstMismatch, gameRound, GAME_MEMORY_FROM_LEVEL } from '../features/auth-bag/game'
import { MAX_ITEMS, MIN_ITEMS } from '../features/auth-bag/sequence'
import { useAuthStore } from '../stores/auth'
import { useContextStore } from '../stores/context'

/*
 * AUTH-BAG-001 — secondary sign-in with the school-bag passcode. The password stays the main
 * method; this page only exists while the rollout flag is on (see routes.ts).
 * The sequence lives in memory only and is cleared after every attempt.
 */
const GENERIC_FAILURE = 'Không thể đăng nhập bằng cách này. Kiểm tra thông tin hoặc dùng mật khẩu.'

const auth = useAuthStore()
const context = useContextStore()
const router = useRouter()
const route = useRoute()

const code = ref(typeof route.query.code === 'string' ? route.query.code : '')
const draft = ref<string[]>([])
const pad = ref<InstanceType<typeof BagPad> | null>(null)
type Tone = 'info' | 'error' | 'success'
const message = ref<{ tone: Tone; text: string } | null>(null)
const busy = ref(false)
const ready = ref(false)
const SUCCESS_PAUSE_MS = 1100

function notify(tone: Tone, text: string) {
  message.value = { tone, text }
}

/** Enter in the code field with an empty bag moves on to the wheel instead of failing. */
function onCodeEnter(event: KeyboardEvent) {
  if (!code.value.trim() || draft.value.length) return
  event.preventDefault()
  pad.value?.focus()
}

// ===== Practice game (only offered while the code field is empty; never sent anywhere) =====
const playing = ref(false)
const level = ref(1)
const streak = ref(0)
const target = ref<string[]>([])
const memoryRound = computed(() => level.value >= GAME_MEMORY_FROM_LEVEL)
const listHidden = computed(() => memoryRound.value && draft.value.length > 0)

function nextAttempt() {
  draft.value = []
  pad.value?.reshuffle()
}

function startGame() {
  playing.value = true
  level.value = 1
  streak.value = 0
  target.value = gameRound(1)
  nextAttempt()
  notify('info', 'Xếp đúng các món theo đề rồi bấm "Kiểm tra". Chỉ để chơi: không gửi gì lên máy chủ, không tính lượt thử.')
  pad.value?.focus()
}

function exitGame() {
  playing.value = false
  target.value = []
  nextAttempt()
  message.value = null
}

function checkGame() {
  if (!draft.value.length) return notify('error', 'Cặp đang trống.')
  const wrongAt = firstMismatch(target.value, draft.value)
  const packed = draft.value.length
  nextAttempt()
  if (wrongAt === -1) {
    streak.value++
    level.value++
    target.value = gameRound(level.value)
    const memo = level.value === GAME_MEMORY_FROM_LEVEL ? ' Từ giờ đề sẽ ẩn khi bạn bắt đầu xếp: thử trí nhớ nhé!' : ''
    return notify('success', `Chính xác! Lên cấp ${level.value}.${memo}`)
  }
  streak.value = 0
  if (wrongAt >= packed) return notify('error', `Còn thiếu món thứ ${wrongAt + 1}. Xếp lại nào!`)
  if (wrongAt >= target.value.length) return notify('error', 'Cặp bị thừa món. Xếp lại nào!')
  notify('error', `Món thứ ${wrongAt + 1} chưa đúng. Xếp lại nào!`)
}

async function submit() {
  if (busy.value) return
  if (playing.value) return checkGame()
  if (!code.value.trim()) return notify('error', 'Hãy nhập mã đăng nhập.')
  if (!draft.value.length) return notify('error', 'Cặp đang trống.')
  const items = [...draft.value]
  // Cleared and reshuffled after every attempt, whatever the result.
  draft.value = []
  pad.value?.reshuffle()
  // Too short or too long can never match; answer like any other failure without a request.
  if (items.length < MIN_ITEMS || items.length > MAX_ITEMS) return notify('error', GENERIC_FAILURE)
  busy.value = true
  message.value = null
  try {
    await auth.loginWithBag(code.value, items)
    context.hydrate(auth.legacyState)
    ready.value = true
    notify('success', 'Hành trang đã sẵn sàng. Cùng học thôi!')
    // A short beat so the student sees the greeting before the dashboard opens.
    await new Promise(resolve => setTimeout(resolve, SUCCESS_PAUSE_MS))
    await router.replace(auth.currentUser?.role === 'admin' ? '/admin' : '/dashboard')
  } catch (error) {
    const unavailable = (error as { code?: string })?.code === 'UNAVAILABLE'
    notify('error', unavailable && error instanceof Error ? error.message : GENERIC_FAILURE)
  } finally {
    busy.value = false
  }
}

onBeforeUnmount(() => { draft.value = [] })
</script>

<template>
  <AuthLayout>
    <section class="bag-login">
      <header class="bag-head">
        <RouterLink :to="{ path: '/login' }" class="back">← Dùng mật khẩu</RouterLink>
      </header>

      <div class="bag-title">
        <span class="eyebrow">CHUẨN BỊ VÀO LỚP</span>
        <h1 class="bag-mark-host"><BagMark :size="40" />Hành trang tự học</h1>
        <p class="guide">Chọn đúng món, đủ số lượng, theo thứ tự bí mật của bạn.</p>
        <p>Nhập mã đăng nhập, xoay tới từng món rồi bấm hoặc kéo vào cặp. Đừng xếp khi có người đang nhìn.</p>
      </div>

      <form class="bag-form" novalidate @submit.prevent="submit">
        <label v-if="!playing" class="code-field">
          <span>Mã đăng nhập</span>
          <input v-model.trim="code" autocomplete="username" autocapitalize="none" spellcheck="false" placeholder="Ví dụ: hs-01" @keydown.enter="onCodeEnter" />
        </label>

        <p v-if="!playing && !code" class="play-invite">
          <span>Chưa nhập mã? Tập tay với trò chơi, không tính lượt thử.</span>
          <button type="button" class="play-button" @click="startGame"><Gamepad2 aria-hidden="true" />Chơi "Xếp cặp theo đề"</button>
        </p>

        <section v-if="playing" class="game-card" aria-label="Trò chơi Xếp cặp theo đề">
          <div class="game-head">
            <strong>Xếp cặp theo đề</strong>
            <span class="game-stats">Cấp {{ level }} · Chuỗi đúng {{ streak }}</span>
          </div>
          <p v-if="listHidden" class="game-hidden">Đề đã ẩn. Nhớ lại và xếp tiếp nhé! (Bấm "Làm lại" để xem đề.)</p>
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
          @full="notify('error', `Cặp chỉ chứa tối đa ${MAX_ITEMS} món.`)"
          @cleared="notify('info', 'Đã xoá các món trong cặp khi bạn rời tab.')"
        >
          <p v-if="message" class="message" :class="message.tone" role="alert">
            <span v-if="message.tone === 'success'" class="sparkles" aria-hidden="true">✨</span>{{ message.text }}
          </p>
          <template v-if="playing">
            <AppButton type="submit"><Gamepad2 />Kiểm tra</AppButton>
            <button type="button" class="alt link" @click="exitGame">Thoát trò chơi</button>
          </template>
          <template v-else>
            <AppButton type="submit" :loading="busy || ready" :disabled="ready"><KeyRound />Bắt đầu tự học</AppButton>
            <RouterLink :to="{ path: '/login' }" class="alt">Dùng mật khẩu</RouterLink>
          </template>
        </BagPad>
      </form>

      <p class="privacy">
        Chưa chuẩn bị hành trang? Đăng nhập bằng mật khẩu rồi thiết lập "Hành trang tự học" trong Cài đặt.
        Cách này không chống được người quay lại toàn bộ thao tác của bạn.
      </p>
    </section>
  </AuthLayout>
</template>

<style scoped>
.bag-login {
  width: min(1120px, calc(100vw - 48px));
  margin: auto;
  padding: 26px clamp(18px, 3vw, 34px) 22px;
  border: 1px solid color-mix(in srgb, var(--color-primary) 14%, var(--border));
  border-radius: 28px;
  background: var(--surface);
  box-shadow: var(--shadow-md);
}

.bag-head { display: flex; align-items: center; gap: 12px; }
.back, .alt { color: var(--color-primary); font-weight: 700; text-decoration: none; }
.alt { justify-self: start; }
.back:hover, .alt:hover { text-decoration: underline; }

.bag-title { margin-top: 14px; }
.eyebrow { font-size: var(--font-size-ui-min, .72rem); font-weight: 900; letter-spacing: .16em; color: var(--color-primary); }
.bag-title h1 { display: flex; align-items: center; gap: 10px; margin: 6px 0; font-size: clamp(1.5rem, 2.6vw, 2rem); }
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

.stage { margin-top: 18px; }

.link { padding: 0; border: 0; background: none; font: inherit; cursor: pointer; }
.play-invite { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; margin: 10px 0 0; color: var(--text-muted); font-size: .85rem; }
.play-button {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 6px 12px;
  border: 1px dashed color-mix(in srgb, var(--color-primary) 45%, var(--border));
  border-radius: 999px;
  background: color-mix(in srgb, var(--color-primary) 8%, var(--surface));
  color: var(--color-primary);
  font: inherit; font-weight: 800;
  cursor: pointer;
}
.play-button:hover { background: color-mix(in srgb, var(--color-primary) 14%, var(--surface)); }
.play-button svg { width: 16px; height: 16px; }
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

.message { margin: 0; padding: 10px 12px; border-radius: 12px; font-size: .9rem; line-height: 1.45; }
.message.info { background: color-mix(in srgb, var(--color-sky, #3b82f6) 12%, var(--surface)); }
.message.error { background: color-mix(in srgb, var(--color-danger) 12%, var(--surface)); color: var(--color-danger); }
.message.success {
  background: linear-gradient(120deg, color-mix(in srgb, var(--color-mint, #22a06b) 20%, var(--surface)), color-mix(in srgb, #f5b400 18%, var(--surface)));
  color: var(--text);
  font-weight: 800;
  animation: ready-pop 420ms cubic-bezier(.3, 1.5, .5, 1);
}
.sparkles { display: inline-block; margin-right: 6px; animation: sparkle 900ms ease-in-out infinite; }
.guide { color: var(--text) !important; font-weight: 800; }
@keyframes ready-pop { 0% { transform: scale(.9); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }
@keyframes sparkle { 50% { transform: scale(1.25) rotate(12deg); } }
@media (prefers-reduced-motion: reduce) { .message.success, .sparkles { animation: none; } }

.privacy { margin: 16px 0 0; color: var(--text-muted); font-size: .8rem; line-height: 1.5; }

@media (max-width: 560px) {
  .bag-login { width: calc(100vw - 24px); border-radius: 20px; }
}
</style>
