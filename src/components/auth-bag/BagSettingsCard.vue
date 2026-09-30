<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { Eye, EyeOff, KeyRound, Shuffle } from 'lucide-vue-next'
import AppButton from '../ui/AppButton.vue'
import AppCard from '../ui/AppCard.vue'
import BagItemIcon from './BagItemIcon.vue'
import BagPad from './BagPad.vue'
import BagMark from './BagMark.vue'
import { itemById } from '../../features/auth-bag/catalog'
import { checkPolicy, MAX_ITEMS, MIN_ITEMS, POLICY_MESSAGE, randomSequence, sameSequence, type PolicyIssue } from '../../features/auth-bag/sequence'
import { legacyApi } from '../../services/legacy-supabase'

/*
 * AUTH-BAG-001 — set up, change or turn off the school-bag passcode (students and monitors).
 * It is a second credential beside the password, which never changes here. Every change needs
 * the current password first; the sequence stays in memory and is sent once, on save.
 */
type Phase = 'loading' | 'idle' | 'unavailable' | 'password' | 'create' | 'confirm' | 'saving'
type Intent = 'enroll' | 'disable'
type Tone = 'info' | 'error' | 'success'

const phase = ref<Phase>('loading')
const intent = ref<Intent>('enroll')
const enabled = ref(false)
const updatedAt = ref<string | null>(null)
const password = ref('')
const draft = ref<string[]>([])
const pending = ref<string[] | null>(null)
const generated = ref<string[] | null>(null)
const showGenerated = ref(false)
const message = ref<{ tone: Tone; text: string } | null>(null)
const busy = ref(false)
const pad = ref<InstanceType<typeof BagPad> | null>(null)

const updatedLabel = computed(() => {
  if (!updatedAt.value) return ''
  const date = new Date(updatedAt.value)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' })
})

function notify(tone: Tone, text: string) {
  message.value = { tone, text }
}

function errorCode(error: unknown) {
  return String((error as { code?: string })?.code ?? '')
}

function errorText(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback
}

function clearSecrets() {
  draft.value = []
  pending.value = null
  generated.value = null
  showGenerated.value = false
  password.value = ''
}

async function loadStatus() {
  phase.value = 'loading'
  try {
    const status = await legacyApi.bagCredential('status')
    enabled.value = status.enabled
    updatedAt.value = status.updated_at
    phase.value = 'idle'
  } catch (error) {
    phase.value = 'unavailable'
    notify('error', errorCode(error) === 'NOT_ELIGIBLE'
      ? 'Tài khoản này chưa dùng được "Hành trang tự học".'
      : 'Chưa tải được trạng thái. Hãy thử lại sau.')
  }
}

function start(next: Intent) {
  clearSecrets()
  intent.value = next
  message.value = null
  phase.value = 'password'
}

function cancel() {
  clearSecrets()
  message.value = null
  phase.value = 'idle'
}

async function confirmPassword() {
  if (!password.value) return notify('error', 'Hãy nhập mật khẩu hiện tại.')
  busy.value = true
  try {
    await legacyApi.reauthenticateOwnPassword(password.value)
    password.value = ''
    message.value = null
    if (intent.value === 'disable') return await disable()
    // Re-confirmed after the session went stale at save time: save what was already confirmed.
    if (pending.value) return await save(pending.value)
    phase.value = 'create'
  } catch (error) {
    notify('error', errorText(error, 'Mật khẩu hiện tại không đúng.'))
  } finally {
    busy.value = false
  }
}

function toCreate(text: string) {
  clearSecrets()
  phase.value = 'create'
  notify('error', text)
}

// ===== Step 1: create =====
function continueCreate() {
  const issue = checkPolicy(draft.value)
  if (issue) return notify('error', POLICY_MESSAGE[issue])
  goConfirm([...draft.value])
}

function generate() {
  generated.value = randomSequence(12)
  showGenerated.value = false
  notify('info', 'Đã tạo một chuỗi ngẫu nhiên. Bấm "Xem chuỗi để học" khi không có ai nhìn, rồi nhập lại ở bước sau.')
}

function useGenerated() {
  if (generated.value) goConfirm([...generated.value])
}

function goConfirm(sequence: string[]) {
  pending.value = sequence
  generated.value = null
  showGenerated.value = false
  draft.value = []
  pad.value?.reshuffle()
  phase.value = 'confirm'
  notify('info', 'Giờ xếp lại đúng như vậy vào chiếc cặp trống.')
}

// ===== Step 2: confirm and save =====
async function confirmAndSave() {
  if (!pending.value || !sameSequence(pending.value, draft.value)) {
    return toCreate('Hai lần xếp không khớp. Hãy xếp lại từ bước 1.')
  }
  draft.value = []
  await save(pending.value)
}

async function save(sequence: string[]) {
  phase.value = 'saving'
  try {
    const result = await legacyApi.bagCredential('enroll', sequence)
    clearSecrets()
    enabled.value = result.enabled
    updatedAt.value = new Date().toISOString()
    phase.value = 'idle'
    notify('success', 'Đã lưu hành trang của bạn. Mật khẩu vẫn giữ nguyên.')
  } catch (error) {
    const code = errorCode(error)
    if (code === 'REAUTH_REQUIRED') {
      // Keep the confirmed sequence in memory, ask for the password again, then save it.
      intent.value = 'enroll'
      phase.value = 'password'
      return notify('info', 'Phiên xác nhận đã hết hạn. Nhập lại mật khẩu để lưu.')
    }
    if (code === 'WEAK_SEQUENCE') {
      const issue = (error as { issue?: string }).issue as PolicyIssue | undefined
      return toCreate(issue && issue in POLICY_MESSAGE ? POLICY_MESSAGE[issue] : errorText(error, 'Chuỗi này quá dễ đoán.'))
    }
    if (code === 'INVALID_SEQUENCE') return toCreate(errorText(error, 'Chuỗi dụng cụ không hợp lệ.'))
    clearSecrets()
    phase.value = 'idle'
    notify('error', errorText(error, 'Chưa lưu được. Vui lòng thử lại sau.'))
  }
}

async function disable() {
  phase.value = 'saving'
  try {
    await legacyApi.bagCredential('disable')
    enabled.value = false
    updatedAt.value = new Date().toISOString()
    notify('success', 'Đã tắt "Hành trang tự học".')
  } catch (error) {
    notify('error', errorText(error, 'Chưa tắt được. Vui lòng thử lại sau.'))
  } finally {
    clearSecrets()
    phase.value = 'idle'
  }
}

function onVisibility() {
  if (document.visibilityState === 'hidden') showGenerated.value = false
}

onMounted(() => {
  document.addEventListener('visibilitychange', onVisibility)
  void loadStatus()
})

onBeforeUnmount(() => {
  document.removeEventListener('visibilitychange', onVisibility)
  clearSecrets()
})
</script>

<template>
  <AppCard padding="lg" class="bag-settings">
    <div class="section-title bag-mark-host">
      <BagMark :size="34" />
      <div>
        <span>CÁCH VÀO LỚP VUI HƠN</span>
        <h2>Hành trang tự học</h2>
      </div>
    </div>

    <p class="intro">
      Chọn đúng món, đủ số lượng, theo thứ tự bí mật của bạn ({{ MIN_ITEMS }}–{{ MAX_ITEMS }} món). Lần sau chỉ cần xếp
      hành trang đúng như vậy là bắt đầu tự học, không cần gõ mật khẩu. Đây là cách phụ: mật khẩu không thay đổi và vẫn luôn dùng được.
    </p>

    <p v-if="message" class="message" :class="message.tone" role="status">{{ message.text }}</p>

    <div v-if="phase === 'loading'" class="status muted">Đang tải trạng thái…</div>

    <div v-else-if="phase === 'unavailable'" class="actions">
      <AppButton type="button" variant="secondary" @click="loadStatus">Thử lại</AppButton>
    </div>

    <div v-else-if="phase === 'idle' || phase === 'saving'" class="status-row">
      <div class="status">
        <b :class="enabled ? 'on' : 'off'">{{ enabled ? 'Đang bật' : 'Chưa bật' }}</b>
        <small v-if="updatedLabel">Cập nhật {{ updatedLabel }}</small>
      </div>
      <div class="actions">
        <AppButton type="button" :loading="phase === 'saving'" @click="start('enroll')">
          <KeyRound />{{ enabled ? 'Đổi cách xếp' : 'Thiết lập' }}
        </AppButton>
        <AppButton v-if="enabled" type="button" variant="danger" :disabled="phase === 'saving'" @click="start('disable')">Tắt</AppButton>
      </div>
    </div>

    <form v-else-if="phase === 'password'" class="password-step" novalidate @submit.prevent="confirmPassword">
      <label>
        <span>{{ intent === 'disable' ? 'Nhập mật khẩu để tắt "Hành trang tự học"' : 'Nhập mật khẩu hiện tại để tiếp tục' }}</span>
        <input v-model="password" type="password" autocomplete="current-password" />
      </label>
      <div class="actions">
        <AppButton type="submit" :loading="busy" :variant="intent === 'disable' ? 'danger' : 'primary'">
          {{ intent === 'disable' ? 'Tắt' : 'Tiếp tục' }}
        </AppButton>
        <AppButton type="button" variant="secondary" :disabled="busy" @click="cancel">Huỷ</AppButton>
      </div>
    </form>

    <div v-else class="enroll-step">
      <h3>{{ phase === 'create' ? 'Bước 1/2 — Chuẩn bị hành trang' : 'Bước 2/2 — Xếp lại để xác nhận' }}</h3>
      <p class="muted">
        <template v-if="phase === 'create'">Xoay tới món cần chọn rồi bấm hoặc kéo vào cặp. Một món có thể chọn nhiều lần. Đừng tạo khi có người đang nhìn.</template>
        <template v-else>Xếp lại đúng như lần đầu. Hai lần phải khớp hoàn toàn.</template>
      </p>
      <BagPad
        ref="pad"
        v-model="draft"
        label="Bàn dụng cụ để tạo mật mã"
        @full="notify('error', `Cặp chỉ chứa tối đa ${MAX_ITEMS} món.`)"
        @cleared="notify('info', 'Đã xoá các món trong cặp khi bạn rời tab.')"
      >
        <template v-if="phase === 'create'">
          <AppButton type="button" @click="continueCreate">Tiếp tục</AppButton>
          <AppButton type="button" variant="secondary" @click="generate"><Shuffle />Tạo ngẫu nhiên</AppButton>
          <div v-if="generated" class="generated">
            <AppButton type="button" variant="secondary" @click="showGenerated = !showGenerated">
              <EyeOff v-if="showGenerated" /><Eye v-else />{{ showGenerated ? 'Ẩn chuỗi' : 'Xem chuỗi để học' }}
            </AppButton>
            <ol v-if="showGenerated" class="sequence-list">
              <li v-for="(id, index) in generated" :key="index">
                <span class="mini"><BagItemIcon :kind="itemById(id)!.kind" :color="itemById(id)!.color" /></span>
                {{ itemById(id)!.label }}
              </li>
            </ol>
            <AppButton type="button" @click="useGenerated">Dùng chuỗi này</AppButton>
          </div>
        </template>
        <template v-else>
          <AppButton type="button" @click="confirmAndSave">Lưu cách xếp</AppButton>
        </template>
        <AppButton type="button" variant="secondary" @click="cancel">Huỷ</AppButton>
      </BagPad>
    </div>
  </AppCard>
</template>

<style scoped>
.bag-settings { grid-column: 1 / -1; background: color-mix(in srgb, var(--surface) 96%, transparent); }
.section-title { display: flex; gap: 12px; align-items: center; margin-bottom: 14px; }
.section-title > svg { width: 28px; color: var(--color-primary); }
.section-title span { color: var(--color-primary); font-size: var(--font-size-ui-min); font-weight: 850; letter-spacing: .08em; }
.section-title h2 { margin: 4px 0; }
.intro, .muted { margin: 0 0 12px; color: var(--text-muted); line-height: 1.55; }
.status-row { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; }
.status { display: grid; gap: 3px; }
.status b.on { color: var(--color-success); }
.status b.off { color: var(--text-muted); }
.status small { color: var(--text-muted); }
.actions { display: flex; flex-wrap: wrap; gap: 8px; }
.password-step { display: grid; gap: 12px; max-width: 420px; }
.password-step label { display: grid; gap: 6px; font-size: .85rem; font-weight: 750; }
.password-step input {
  width: 100%;
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 11px 12px;
  background: var(--surface);
  color: var(--text);
  font: inherit;
}
.password-step input:focus { outline: 3px solid var(--focus-ring); border-color: var(--color-primary); }
.enroll-step h3 { margin: 4px 0 6px; font-size: 1.05rem; }
.message { margin: 0 0 12px; padding: 10px 12px; border-radius: 12px; font-size: .9rem; line-height: 1.45; }
.message.info { background: color-mix(in srgb, var(--color-sky, #3b82f6) 12%, var(--surface)); }
.message.error { background: color-mix(in srgb, var(--color-danger) 12%, var(--surface)); color: var(--color-danger); }
.message.success { background: color-mix(in srgb, var(--color-mint, #22a06b) 16%, var(--surface)); }
.generated { display: grid; gap: 8px; padding: 10px; border: 1px dashed var(--border); border-radius: 14px; }
.sequence-list { display: grid; gap: 4px; margin: 0; padding-left: 22px; font-size: .88rem; }
.sequence-list li { display: flex; align-items: center; gap: 6px; }
.mini { display: inline-block; width: 22px; height: 22px; }
@media (max-width: 850px) { .bag-settings { grid-column: auto; } }
</style>
