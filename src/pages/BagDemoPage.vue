<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { KeyRound, Shuffle, Eye, EyeOff } from 'lucide-vue-next'
import AuthLayout from '../layouts/AuthLayout.vue'
import AppButton from '../components/ui/AppButton.vue'
import BagItemIcon from '../components/auth-bag/BagItemIcon.vue'
import BagPad from '../components/auth-bag/BagPad.vue'
import { itemById } from '../features/auth-bag/catalog'
import { checkPolicy, MAX_ITEMS, MIN_ITEMS, POLICY_MESSAGE, randomSequence, sameSequence } from '../features/auth-bag/sequence'

/*
 * AUTH-BAG-001 prototype — "Mật mã chiếc cặp".
 * Interaction prototype only: nothing is sent to a server, no session is created, and the demo
 * secret lives in this component's memory until the page is left (never in storage or logs).
 */

type Phase = 'create' | 'confirm' | 'login'
type Tone = 'info' | 'error' | 'success'

const LOCK_AFTER_FAILS = 5
const DEMO_LOCK_MS = 60_000 // The server locks for 15 minutes; shortened for the demo.

const phase = ref<Phase>('create')
const pad = ref<InstanceType<typeof BagPad> | null>(null)
const draft = ref<string[]>([])
const pending = ref<string[] | null>(null)
const enrolled = ref<string[] | null>(null)
const generated = ref<string[] | null>(null)
const showGenerated = ref(false)
const accountCode = ref('')
const message = ref<{ tone: Tone; text: string } | null>(null)
const fails = ref(0)
const lockedUntil = ref(0)
const now = ref(Date.now())

const locked = computed(() => lockedUntil.value > now.value)
const lockSeconds = computed(() => Math.max(0, Math.ceil((lockedUntil.value - now.value) / 1000)))

const heading = computed(() => ({
  create: 'Bước 1/2 — Chọn cách xếp cặp',
  confirm: 'Bước 2/2 — Nhập lại để xác nhận',
  login: 'Hành trang tự học',
}[phase.value]))

function notify(tone: Tone, text: string) {
  message.value = { tone, text }
}

function newAttempt() {
  draft.value = []
  pad.value?.reshuffle()
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
  // The sequence is cleared after every result, and the desk reshuffled.
  newAttempt()
  if (ok) {
    fails.value = 0
    notify('success', 'Hành trang đã sẵn sàng. Cùng học thôi! (Bản thử: không có phiên đăng nhập nào được tạo.)')
    return
  }
  fails.value++
  if (fails.value >= LOCK_AFTER_FAILS) {
    fails.value = 0
    lockedUntil.value = Date.now() + DEMO_LOCK_MS
  }
  // One generic message: never which item, colour, count or turn was wrong.
  notify('error', 'Không thể đăng nhập bằng cách này. Kiểm tra thông tin hoặc dùng mật khẩu.')
}

// ===== Leaving the tab hides a generated sequence (the pad empties the bag itself) =====
function onVisibility() {
  if (document.visibilityState !== 'hidden' || !showGenerated.value) return
  showGenerated.value = false
  notify('info', 'Đã ẩn chuỗi khi bạn rời tab.')
}

let clock: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  document.addEventListener('visibilitychange', onVisibility)
  clock = setInterval(() => { now.value = Date.now() }, 1000)
})

onBeforeUnmount(() => {
  document.removeEventListener('visibilitychange', onVisibility)
  clearInterval(clock)
  draft.value = []
  pending.value = null
  enrolled.value = null
  generated.value = null
})
</script>

<template>
  <AuthLayout>
    <section class="bag-demo">
      <header class="bag-head">
        <RouterLink to="/login" class="back">← Dùng mật khẩu</RouterLink>
        <span class="badge">Bản thử — không đăng nhập thật</span>
      </header>

      <div class="bag-title">
        <span class="eyebrow">HÀNH TRANG TỰ HỌC</span>
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

      <BagPad ref="pad" v-model="draft" class="stage" @full="notify('error', `Cặp chỉ chứa tối đa ${MAX_ITEMS} món.`)" @cleared="notify('info', 'Đã xoá các món trong cặp khi bạn rời tab.')">
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
            <AppButton :disabled="locked" @click="closeBag"><KeyRound />{{ locked ? `Tạm ngưng ${lockSeconds}s` : 'Bắt đầu tự học' }}</AppButton>
            <RouterLink to="/login" class="alt">Dùng mật khẩu</RouterLink>
            <button type="button" class="link" @click="startOver">Tạo lại mật mã thử</button>
          </template>
        </div>
      </BagPad>

      <p class="privacy">
        Bản thử chỉ để thử thao tác: không gửi dữ liệu đi đâu, không tạo phiên đăng nhập, mật mã thử mất khi rời trang.
        Chiếc cặp không chống được người quay lại toàn bộ thao tác của bạn.
      </p>
    </section>
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

.stage { margin-top: 18px; }

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

@media (max-width: 560px) {
  .bag-demo { width: calc(100vw - 24px); border-radius: 20px; }
}
</style>
