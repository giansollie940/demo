<script setup lang="ts">
// FEAT-008 — Admin storage health.
//
// Two honesty rules drive this screen:
//  1. A provider whose capacity nobody configured shows "Chưa đặt dung lượng",
//     never 0%. A made-up percentage would either hide a real emergency or
//     scare Admin into deleting data that is fine.
//  2. Every number says where it came from, and the label names the value that
//     actually drove the percentage. 'metadata' is what the app itself accounts
//     for and can undercount objects R2 holds but the app forgot; 'provider' is
//     R2's own answer, used only while it is recent. An R2 answer that has gone
//     stale is called out rather than quietly continuing to drive the lock.
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { AlertTriangle, DatabaseZap, HardDrive, RefreshCw, ShieldAlert, Trash2 } from 'lucide-vue-next'
import AppButton from '../ui/AppButton.vue'
import AppCard from '../ui/AppCard.vue'
import InlineStatus, { type InlineStatusState } from '../ui/InlineStatus.vue'
import { subscribeStorageChanges } from '../../features/storage/live'
import { appDialog } from '../../features/shared/app-dialog'
import { useContextStore } from '../../stores/context'
import { useAuthStore } from '../../stores/auth'
import {
  cleanupPendingMedia, formatBytes, levelLabels, levelTones, measureProviders,
  refreshStorage, setStorageCapacity, storageStatus,
  type StorageProvider, type StorageState,
} from '../../features/storage/api'

const context = useContextStore()
const auth = useAuthStore()
const state = ref<StorageState | null>(null)
const busy = ref('')
const status = ref<InlineStatusState>('idle')
const statusMessage = ref('')
const sourceNote = ref('')
const checkedAt = ref(0)
const updating = ref(false)
const providerNote = ref('')
const connection = ref('Đang kết nối cập nhật trực tiếp…')

const providers = computed(() => [
  { key: 'database' as const, title: 'Cơ sở dữ liệu Supabase', icon: DatabaseZap, data: state.value?.providers.database },
  { key: 'r2' as const, title: 'Kho ảnh Cloudflare R2', icon: HardDrive, data: state.value?.providers.r2 },
])

const unconfigured = computed(() => providers.value.filter(p => p.data && p.data.level === 'unconfigured').map(p => p.title))
const worst = computed<StorageProvider['level']>(() => {
  const order: StorageProvider['level'][] = ['critical', 'warning', 'info', 'normal', 'unknown', 'unconfigured']
  for (const level of order) if (providers.value.some(p => p.data?.level === level)) return level
  return 'unknown'
})

const yearName = (id: string) => context.schoolYears?.find(year => year.id === id)?.name ?? 'Năm học khác'

function report(error: unknown, fallback: string) {
  status.value = 'error'
  statusMessage.value = error instanceof Error && error.message ? error.message : fallback
}

let pendingLoad: Promise<void> | null = null
let unsubscribe: (() => void) | undefined
let debounce: ReturnType<typeof setTimeout> | undefined
let dirty = false
let r2Dirty = false
function queueRefresh(r2 = false) {
  dirty = true; r2Dirty ||= r2
  if (disposed || typeof document !== 'undefined' && document.visibilityState === 'hidden') return
  if (debounce) clearTimeout(debounce)
  debounce = setTimeout(() => { debounce = undefined; void load() }, 1200)
}
let lastLoadedAt = 0
let disposed = false
function load() {
  if (pendingLoad) return pendingLoad
  if (disposed || busy.value || auth.currentUser?.role !== 'admin' || typeof document !== 'undefined' && document.visibilityState === 'hidden') return Promise.resolve()
  const actor = auth.currentUser
  const stillCurrent = () => !disposed && auth.currentUser === actor && auth.currentUser?.role === 'admin'
  const measureR2 = r2Dirty || !state.value
  dirty = false; r2Dirty = false
  updating.value = true
  pendingLoad = (async () => {
    try {
      await refreshStorage()
      if (!stillCurrent()) return
      const fresh = await storageStatus()
      if (!stillCurrent()) return
      state.value = fresh
      lastLoadedAt = Date.now()
      checkedAt.value = lastLoadedAt
      if (status.value === 'error') { status.value = 'success'; statusMessage.value = 'Đã cập nhật trạng thái dung lượng.' }
      if (measureR2) {
        try {
          const result = await measureProviders()
          if (!stillCurrent()) return
          state.value = { ...result.state, candidates: fresh.candidates }
          providerNote.value = result.r2.ok ? '' : 'Chưa đối soát được kho ảnh; hãy bấm “Hỏi kho ảnh” để thử lại. Số liệu ứng dụng vẫn được cập nhật.'
        } catch {
          if (stillCurrent()) providerNote.value = 'Chưa kết nối được kho ảnh; hãy bấm “Hỏi kho ảnh” để thử lại. Đang giữ số đo R2 gần nhất.'
        }
      }
    } catch (error) { if (stillCurrent()) report(error, 'Không đọc được dung lượng. Đang giữ số liệu cập nhật gần nhất.') }
    finally { updating.value = false; pendingLoad = null; if (dirty && !disposed) queueRefresh(r2Dirty) }
  })()
  return pendingLoad
}
function refreshOnFocus() { if (Date.now() - lastLoadedAt >= 5_000 && !busy.value) queueRefresh(true) }

async function refreshLocal() {
  if (updating.value || busy.value) return
  busy.value = 'refresh'; status.value = 'saving'; statusMessage.value = 'Đang đo lại…'
  try {
    state.value = { ...(await refreshStorage()), candidates: state.value?.candidates }
    state.value = await storageStatus()
    status.value = 'success'; statusMessage.value = 'Đã đo lại dung lượng trong cơ sở dữ liệu.'
  } catch (error) { report(error, 'Không đo lại được.') } finally { busy.value = ''; if (dirty) queueRefresh(r2Dirty) }
}

async function measureAll() {
  if (updating.value || busy.value) return
  busy.value = 'measure'; status.value = 'saving'; statusMessage.value = 'Đang hỏi kho ảnh…'; sourceNote.value = ''
  try {
    const result = await measureProviders()
    state.value = await storageStatus()
    if (result.r2.ok) { providerNote.value = ''; status.value = 'success'; statusMessage.value = 'Đã lấy số liệu trực tiếp từ Cloudflare R2.' }
    else {
      // Not an error state: the dashboard still has the in-database numbers.
      status.value = 'server-changed'
      statusMessage.value = result.r2.partial
        ? 'Kho ảnh quá lớn để đọc hết trong một lần. Đang dùng số liệu do ứng dụng tự cộng.'
        : 'Chưa hỏi được Cloudflare R2. Đang dùng số liệu do ứng dụng tự cộng.'
      sourceNote.value = String(result.r2.reason ?? '')
    }
  } catch (error) { report(error, 'Chưa đọc được dung lượng từ kho ảnh.') } finally { busy.value = ''; if (dirty) queueRefresh(r2Dirty) }
}

async function editCapacity(key: 'database' | 'r2', title: string) {
  if (updating.value || busy.value) return
  const current = state.value?.providers[key]?.configured_bytes
  const value = await appDialog.prompt({
    title: `Dung lượng của ${title}`,
    body: 'Nhập theo GB đúng với gói dịch vụ đang dùng ở deployment này. Để trống nghĩa là chưa biết — hệ thống sẽ không cảnh báo và không bật chế độ bảo vệ cho nhà cung cấp đó.',
    label: 'Dung lượng (GB)',
    placeholder: 'ví dụ 0.5',
    initialValue: current ? String(Math.round((Number(current) / 1024 ** 3) * 1000) / 1000) : '',
    validate: (input: string) => (!input.trim() || Number(input) > 0 ? '' : 'Dung lượng phải lớn hơn 0.'),
  })
  if (value === null) return
  busy.value = `capacity:${key}`; status.value = 'saving'; statusMessage.value = 'Đang lưu…'
  try {
    await setStorageCapacity(key, value.trim() ? Math.round(Number(value) * 1024 ** 3) : null)
    state.value = await storageStatus()
    status.value = 'success'
    statusMessage.value = value.trim() ? `Đã đặt dung lượng cho ${title}.` : `Đã xoá dung lượng cấu hình của ${title}.`
  } catch (error) { report(error, 'Không lưu được dung lượng.') } finally { busy.value = ''; if (dirty) queueRefresh(r2Dirty) }
}

async function cleanup() {
  if (updating.value || busy.value) return
  const ok = await appDialog.confirm({
    title: 'Dọn ảnh chờ quá hạn',
    body: 'Chỉ xoá những ảnh đã tải lên nhưng không được gửi kèm bài nào và đã quá 24 giờ. Ảnh đang gắn với bài, lịch sử hay bản chỉnh sửa không bị đụng tới. Việc xoá chạy nền, nên dung lượng chỉ giảm sau khi kho ảnh xác nhận.',
    confirmLabel: 'Dọn ảnh chờ',
  })
  if (!ok) return
  busy.value = 'cleanup'; status.value = 'saving'; statusMessage.value = 'Đang dọn…'
  try {
    const result = await cleanupPendingMedia()
    state.value = await storageStatus()
    // Queuing is not deleting. The numbers deliberately do not move yet, so say
    // that plainly instead of letting Admin read an unchanged percentage as a
    // failure — and point at the one action that can actually lower it.
    status.value = 'success'
    statusMessage.value = result.queued
      ? `Đã xếp ${result.queued} ảnh chờ vào hàng xoá. Số dung lượng chưa giảm ngay: tệp vẫn nằm trong kho cho tới khi tiến trình nền xoá xong. Trang cập nhật khi tiến trình nền xác nhận thay đổi; bạn cũng có thể bấm “Hỏi kho ảnh”.`
      : 'Không có ảnh chờ nào quá hạn.'
  } catch (error) { report(error, 'Không dọn được ảnh chờ.') } finally { busy.value = ''; if (dirty) queueRefresh(r2Dirty) }
}

async function connect() {
  if (auth.currentUser?.role !== 'admin' || disposed) return
  try {
    const stop = await subscribeStorageChanges(r2 => queueRefresh(r2), status => {
      if (disposed) return
      if (status === 'SUBSCRIBED') {
        connection.value = 'Đang nhận cập nhật khi dữ liệu thay đổi'
        queueRefresh(true)
      } else {
        connection.value = 'Mất kết nối cập nhật trực tiếp; số liệu có thể đã cũ. Có thể đo bằng nút bên dưới.'
      }
    })
    if (disposed || auth.currentUser?.role !== 'admin') stop()
    else unsubscribe = stop
  } catch (error) { if (!disposed) connection.value = error instanceof Error ? error.message : 'Chưa kết nối được cập nhật trực tiếp.' }
}
watch(() => auth.currentUser?.role, role => {
  if (role !== 'admin') { unsubscribe?.(); unsubscribe = undefined; if (debounce) clearTimeout(debounce); dirty = r2Dirty = false; state.value = null }
})
onMounted(() => {
  void load()
  void connect()
  if (typeof window !== 'undefined') {
    window.addEventListener('focus', refreshOnFocus)
    document.addEventListener('visibilitychange', refreshOnFocus)
  }
})
onBeforeUnmount(() => {
  disposed = true
  unsubscribe?.()
  if (debounce) clearTimeout(debounce)
  if (typeof window !== 'undefined') {
    window.removeEventListener('focus', refreshOnFocus)
    document.removeEventListener('visibilitychange', refreshOnFocus)
  }
})

</script>

<template>
  <div class="storage-health">
    <AppCard padding="md" class="bar">
      <div>
        <span class="kicker"><HardDrive aria-hidden="true" />DUNG LƯỢNG HỆ THỐNG</span>
        <p v-if="state?.measured_at">Đo lần cuối {{ new Date(state.measured_at).toLocaleString('vi-VN') }}</p>
        <p v-else>Chưa có số đo nào.</p>
        <p role="status">{{ updating ? 'Đang cập nhật…' : checkedAt ? 'Cập nhật thành công lúc ' + new Date(checkedAt).toLocaleTimeString('vi-VN') : 'Đang kết nối…' }}</p>
        <p>{{ connection }}</p>
        <p>Ảnh chờ xóa chỉ biến mất sau khi quyền tải còn hiệu lực hết hạn, cộng 3 phút an toàn và một lượt xử lý nền thành công.</p>
        <p>Thay đổi trực tiếp trong R2: dùng “Hỏi kho ảnh” để đối soát.</p>
        <p v-if="providerNote">{{ providerNote }}</p>
      </div>
      <div class="bar-actions">
        <AppButton :disabled="updating || !!busy" variant="secondary" :loading="busy === 'refresh'" @click="refreshLocal"><RefreshCw aria-hidden="true" />Đo trong CSDL</AppButton>
        <AppButton :disabled="updating || !!busy" :loading="busy === 'measure'" @click="measureAll"><HardDrive aria-hidden="true" />Hỏi kho ảnh</AppButton>
      </div>
    </AppCard>

    <InlineStatus :state="status" :message="statusMessage" />

    <AppCard v-if="state?.flags.protection_mode" padding="md" class="alert danger">
      <ShieldAlert aria-hidden="true" />
      <div>
        <b>Đang ở chế độ bảo vệ dung lượng</b>
        <p>Cơ sở dữ liệu đã vượt 95%. Bài dạng chữ, chỉnh sửa, báo cáo, nhật ký và dọn dẹp vẫn chạy; thả tim mới và ảnh mới tạm khoá cho tới khi dung lượng giảm. Không thể tắt thủ công khi vẫn còn trên 95%.</p>
      </div>
    </AppCard>
    <AppCard v-else-if="state?.flags.r2_upload_locked" padding="md" class="alert warn">
      <ShieldAlert aria-hidden="true" />
      <div>
        <b>Kho ảnh đã khoá ảnh mới</b>
        <p>Cloudflare R2 đã vượt 95%. Bài dạng chữ vẫn đăng bình thường và ảnh cũ vẫn xem được.</p>
      </div>
    </AppCard>
    <AppCard v-else-if="worst === 'warning'" padding="md" class="alert warn">
      <AlertTriangle aria-hidden="true" />
      <div><b>Đã vượt 85%</b><p>Nên lưu trữ năm học cũ hoặc dọn ảnh chờ trước khi chạm ngưỡng 95%.</p></div>
    </AppCard>
    <AppCard v-else-if="worst === 'info'" padding="md" class="alert info">
      <AlertTriangle aria-hidden="true" />
      <div><b>Đã vượt 70%</b><p>Chưa khoá chức năng nào. Theo dõi thêm và cân nhắc dọn dẹp sớm.</p></div>
    </AppCard>

    <AppCard v-if="unconfigured.length" padding="md" class="alert info">
      <AlertTriangle aria-hidden="true" />
      <div>
        <b>Chưa đặt dung lượng cho {{ unconfigured.join(' và ') }}</b>
        <p>Dung lượng là cấu hình của deployment, không phải hằng số. Khi chưa đặt, hệ thống cố ý không hiện phần trăm và không bật cảnh báo — đoán bừa thì hoặc che mất sự cố thật, hoặc khoá nhầm một hệ thống đang khoẻ.</p>
      </div>
    </AppCard>

    <section class="cards">
      <AppCard v-for="provider in providers" :key="provider.key" padding="lg" class="usage">
        <header>
          <span class="title"><component :is="provider.icon" aria-hidden="true" />{{ provider.title }}</span>
          <span v-if="provider.data" class="level" :data-tone="levelTones[provider.data.level]">{{ levelLabels[provider.data.level] }}</span>
        </header>
        <template v-if="provider.data">
          <b class="percent">{{ provider.data.percent === null ? '—' : `${Number(provider.data.percent).toFixed(1)}%` }}</b>
          <div class="meter" :data-tone="levelTones[provider.data.level]" role="img"
            :aria-label="provider.data.percent === null ? 'Chưa đặt dung lượng' : `Đã dùng ${Number(provider.data.percent).toFixed(1)} phần trăm`">
            <span :style="{ width: `${Math.min(100, Number(provider.data.percent ?? 0))}%` }" />
          </div>
          <dl>
            <div><dt>Đang dùng</dt><dd>{{ formatBytes(provider.data.total_bytes) }}</dd></div>
            <div><dt>Dung lượng đặt</dt><dd>{{ formatBytes(provider.data.configured_bytes) }}</dd></div>
            <template v-if="provider.key === 'r2'">
              <div><dt>Đối soát R2 lúc</dt><dd>{{ provider.data.provider_measured_at ? new Date(provider.data.provider_measured_at).toLocaleString('vi-VN') : 'Chưa đối soát' }}</dd></div>
              <div><dt>Ảnh đang dùng</dt><dd>{{ formatBytes(provider.data.active_bytes) }}</dd></div>
              <div><dt>Ảnh chờ / tạm</dt><dd>{{ formatBytes(provider.data.pending_bytes) }}</dd></div>
              <div><dt>Đang chờ xoá</dt><dd>{{ formatBytes(provider.data.deleting_bytes) }}</dd></div>
              <div><dt>Số ảnh</dt><dd>{{ provider.data.media_count ?? 0 }}</dd></div>
            </template>
          </dl>
          <small class="source">
            Nguồn số liệu:
            <b v-if="provider.data.source === 'provider'">nhà cung cấp báo về</b>
            <b v-else-if="provider.data.source === 'metadata'">ứng dụng tự cộng</b>
            <b v-else>chưa đo</b>
            <template v-if="provider.key === 'r2' && provider.data.source === 'metadata'"> — có thể thiếu các tệp trong kho mà ứng dụng không còn ghi nhận.</template>
            <template v-if="provider.data.provider_stale"> Số của Cloudflare R2 đã quá cũ nên không còn được tính; bấm “Hỏi kho ảnh” để lấy số mới.</template>
            <template v-if="provider.key === 'r2' && Number(provider.data.deleting_bytes ?? 0) > 0"> Phần “đang chờ xoá” vẫn được tính là đã dùng: xếp hàng xoá chưa phải là đã xoá, tệp chỉ rời kho khi tiến trình nền xác nhận.</template>
            <template v-if="provider.data.stale"> · Số đo đã cũ hơn 24 giờ.</template>
          </small>
          <AppButton :disabled="updating || !!busy" variant="secondary" :loading="busy === `capacity:${provider.key}`" @click="editCapacity(provider.key, provider.title)">Đặt dung lượng</AppButton>
        </template>
        <p v-else class="muted">Đang tải…</p>
      </AppCard>
    </section>

    <AppCard padding="lg" class="candidates">
      <header>
        <div><h2>Có thể lưu trữ để giải phóng</h2><p>Dung lượng ảnh theo từng năm học. Việc đóng gói và xoá năm học thuộc FEAT-007; áp lực dung lượng không bao giờ tự xoá một năm học.</p></div>
        <AppButton :disabled="updating || !!busy" variant="secondary" :loading="busy === 'cleanup'" @click="cleanup"><Trash2 aria-hidden="true" />Dọn ảnh chờ quá hạn</AppButton>
      </header>
      <ul v-if="state?.candidates?.length">
        <li v-for="row in state.candidates" :key="row.school_year_id">
          <b>{{ yearName(row.school_year_id) }}</b>
          <span>{{ row.media_count }} ảnh · {{ formatBytes(row.media_bytes) }} · {{ row.notice_count }} bài có ảnh</span>
          <em>{{ row.archived ? 'Đã lưu trữ' : 'Chưa lưu trữ' }}</em>
        </li>
      </ul>
      <p v-else class="muted">Chưa có ảnh nào được lưu.</p>
    </AppCard>
  </div>
</template>

<style scoped>
.storage-health{display:grid;gap:14px}
.bar{display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap}
.bar p{margin:4px 0 0;color:var(--text-muted)}
.bar-actions{display:flex;gap:8px;flex-wrap:wrap}
.kicker{display:flex;align-items:center;gap:7px;color:var(--color-primary);font-size:var(--font-size-ui-min);font-weight:900;letter-spacing:.04em}
.kicker svg,.title svg,.alert>svg{width:18px}
.alert{display:flex;align-items:flex-start;gap:11px}
.alert>svg{flex:none;margin-top:2px}
.alert p{margin:4px 0 0;color:var(--text-muted);line-height:1.55}
.alert.danger{border-color:color-mix(in srgb,var(--color-danger) 34%,var(--border));background:color-mix(in srgb,var(--color-danger) 7%,var(--surface))}
.alert.danger>svg{color:var(--color-danger)}
.alert.warn{border-color:color-mix(in srgb,var(--color-warning) 34%,var(--border));background:color-mix(in srgb,var(--color-warning) 8%,var(--surface))}
.alert.warn>svg{color:var(--color-warning)}
.alert.info{border-color:color-mix(in srgb,var(--color-info) 30%,var(--border))}
.alert.info>svg{color:var(--color-info)}
.cards{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.usage{display:grid;gap:10px;align-content:start}
.usage header{display:flex;align-items:center;justify-content:space-between;gap:10px}
.title{display:flex;align-items:center;gap:8px;font-weight:900}
.level{padding:4px 10px;border-radius:999px;font-size:var(--font-size-ui-min);font-weight:850;background:var(--surface-soft);color:var(--text-muted)}
.level[data-tone="success"]{color:var(--color-success)}
.level[data-tone="info"]{color:var(--color-info)}
.level[data-tone="warning"]{color:var(--color-warning)}
.level[data-tone="danger"]{color:var(--color-danger)}
.percent{font-size:2.1rem;line-height:1.1}
.meter{height:10px;border-radius:999px;background:var(--surface-soft);overflow:hidden}
.meter span{display:block;height:100%;border-radius:999px;background:var(--color-success)}
.meter[data-tone="info"] span{background:var(--color-info)}
.meter[data-tone="warning"] span{background:var(--color-warning)}
.meter[data-tone="danger"] span{background:var(--color-danger)}
.meter[data-tone="neutral"] span{background:var(--border)}
dl{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;margin:0}
dl>div{display:grid;gap:2px;padding:8px 10px;border-radius:12px;background:var(--surface-soft)}
dt{color:var(--text-muted);font-size:var(--font-size-ui-min);font-weight:800}
dd{margin:0;font-weight:850}
.source{color:var(--text-muted);line-height:1.5}
.candidates header{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;flex-wrap:wrap}
.candidates h2{margin:0 0 4px}
.candidates p{margin:0;color:var(--text-muted)}
.candidates ul{list-style:none;display:grid;gap:8px;margin:14px 0 0;padding:0}
.candidates li{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:11px 13px;border:1px solid var(--border);border-radius:14px;background:var(--surface-soft)}
.candidates li span{color:var(--text-muted);font-size:var(--font-size-ui-min)}
.candidates li em{font-style:normal;font-weight:850;color:var(--color-warning)}
.muted{color:var(--text-muted)}
@media(max-width:900px){.cards{grid-template-columns:1fr}.bar{align-items:stretch;flex-direction:column}.bar-actions :deep(.app-button){flex:1}}
</style>
