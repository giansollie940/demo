<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { KeyRound } from 'lucide-vue-next'
import AuthLayout from '../layouts/AuthLayout.vue'
import AppButton from '../components/ui/AppButton.vue'
import BagPad from '../components/auth-bag/BagPad.vue'
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

async function submit() {
  if (busy.value) return
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
        <h1>🎒 Hành trang tự học</h1>
        <p class="guide">Chọn đúng món, đủ số lượng, theo thứ tự bí mật của bạn.</p>
        <p>Nhập mã đăng nhập, xoay tới từng món rồi bấm hoặc kéo vào cặp. Đừng xếp khi có người đang nhìn.</p>
      </div>

      <form class="bag-form" novalidate @submit.prevent="submit">
        <label class="code-field">
          <span>Mã đăng nhập</span>
          <input v-model.trim="code" autocomplete="username" autocapitalize="none" spellcheck="false" placeholder="Ví dụ: hs-01" />
        </label>

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
          <AppButton type="submit" :loading="busy || ready" :disabled="ready"><KeyRound />Bắt đầu tự học</AppButton>
          <RouterLink :to="{ path: '/login' }" class="alt">Dùng mật khẩu</RouterLink>
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

.stage { margin-top: 18px; }

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
