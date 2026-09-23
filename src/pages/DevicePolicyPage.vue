<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Lock, LockOpen, RefreshCw } from 'lucide-vue-next'
import DevicePolicyIcon from '../components/icons/DevicePolicyIcon.vue'
import AppCard from '../components/ui/AppCard.vue'
import AppButton from '../components/ui/AppButton.vue'
import InlineStatus, { type InlineStatusState } from '../components/ui/InlineStatus.vue'
import PageArtwork from '../components/ui/PageArtwork.vue'
import PageBannerArt from '../components/ui/PageBannerArt.vue'
import { useContextStore } from '../stores/context'
import { legacyApi } from '../services/legacy-supabase'
import { useDevicePolicy, useDevicePolicyRefresh } from '../features/registrations/device-policy-queries'
import { deviceSlotRows, type DeviceSlotRow, type DevicePolicyHistoryPayload } from '../features/registrations/device-policy'
import DevicePolicyHistory from '../components/registrations/DevicePolicyHistory.vue'
import { useNowTicker } from '../features/shared/useNowTicker'
import { appDialog } from '../features/shared/app-dialog'

const context = useContextStore(), nowMs = useNowTicker(30_000)
const classId = computed(() => context.selectedClassId)
const weekId = computed(() => context.selectedWeekId)
const week = computed(() => context.selectedWeek)
const policy = useDevicePolicy(classId, weekId)
const refresh = useDevicePolicyRefresh()
const rows = computed(() => deviceSlotRows(policy.query.data.value, nowMs.value))
const busy = ref(''), status = ref<InlineStatusState>('idle'), message = ref('')
// FINAL §8 cho giáo viên "xem lịch sử lock/unlock/override". RC3 có RPC và
// không có màn hình, nên trên thực tế giáo viên không xem được (Sol RC3 R-001).
const history = ref<DevicePolicyHistoryPayload | null>(null)
const historyLoading = ref(false), historyError = ref('')
async function loadHistory() {
  if (!classId.value) return
  historyLoading.value = true; historyError.value = ''
  try {
    history.value = await legacyApi.deviceUsePolicy('history', { class_id: classId.value }) as DevicePolicyHistoryPayload
  } catch (error) {
    historyError.value = error instanceof Error ? error.message : 'Không đọc được lịch sử chính sách.'
  } finally { historyLoading.value = false }
}
watch(classId, loadHistory, { immediate: true })
const days = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6']
const rowKey = (row: DeviceSlotRow) => `${row.dow}-${row.period}`
const slotName = (row: DeviceSlotRow) => `${days[row.dow] ?? `Ngày ${row.dow + 1}`} · Tiết ${row.period}`

function timeText(value: number | null) {
  if (!value) return ''
  return new Date(value).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })
}

async function run(row: DeviceSlotRow, action: 'lock' | 'unlock' | 'allow_session' | 'revoke_allow', confirm?: { title: string; body: string }) {
  if (confirm && !await appDialog.confirm({ ...confirm, confirmLabel: 'Đồng ý' })) return
  busy.value = rowKey(row); status.value = 'idle'; message.value = ''
  try {
    const result = await legacyApi.deviceUsePolicy(action, {
      class_id: classId.value, week_id: weekId.value, weekday: row.dow + 1, period_number: row.period,
    }) as { changed?: boolean; registrations_updated?: number }
    await refresh(classId.value, weekId.value)
    await loadHistory()
    status.value = 'success'
    message.value = result?.changed === false
      ? 'Chính sách đã ở đúng trạng thái này, không có gì thay đổi.'
      : `Đã cập nhật ${slotName(row)}.` + (result?.registrations_updated
        ? ` ${result.registrations_updated} đăng ký đã có được tính lại.` : '')
  } catch (error) {
    status.value = 'error'
    message.value = error instanceof Error ? error.message : 'Không cập nhật được chính sách thiết bị điện tử.'
  } finally { busy.value = '' }
}
</script>

<template>
  <div class="page-stack device-policy-page">
    <header class="page-banner device-header">
      <PageBannerArt tone="sun" />
      <div class="page-head-lead">
        <PageArtwork name="schedule" tone="sun" />
        <div>
          <span class="page-context"><DevicePolicyIcon />Chính sách lớp</span>
          <h1>Thiết bị điện tử</h1>
          <p>Tuần {{ week?.number ?? '–' }} · khóa hoặc mở việc đăng ký thiết bị theo từng tiết.</p>
        </div>
      </div>
      <span v-if="policy.query.isFetching.value" class="syncing"><RefreshCw />Đang đồng bộ</span>
    </header>

    <InlineStatus :state="status" :message="message" />

    <AppCard padding="lg" class="policy-intro">
      <p>
        Khóa một tiết sẽ áp dụng cho <b>các buổi chưa bắt đầu</b> và lặp lại ở những tuần sau
        cho tới khi bạn mở lại. Thao tác này <b>không sửa các tuần đã học xong</b>: những buổi đó
        giữ nguyên trạng thái lịch sử của chúng.
      </p>
      <p class="muted">
        Học sinh vẫn nhìn thấy ô chọn thiết bị, nhưng ô đó bị khóa kèm lý do, và lựa chọn cũ của
        các em được giữ lại — nếu bạn mở khóa trước giờ học, lựa chọn đó tự có hiệu lực trở lại.
      </p>
    </AppCard>

    <section v-if="rows.length" class="slot-grid">
      <article v-for="row in rows" :key="rowKey(row)" class="slot-card" :class="row.state">
        <header>
          <h2>{{ slotName(row) }}</h2>
          <span class="state">
            <Lock v-if="row.state === 'locked'" aria-hidden="true" />
            <LockOpen v-else aria-hidden="true" />
            {{ row.state === 'locked' ? 'Đang khóa' : row.state === 'allow_override' ? 'Được mở riêng tuần này' : 'Đang mở' }}
          </span>
        </header>
        <p v-if="row.lockedAt" class="meta">Khóa từ {{ timeText(row.lockedAt) }}</p>
        <p v-else-if="row.state === 'locked'" class="meta">Buổi của tuần này thuộc một khoảng khóa đã kết thúc; slot hiện đang mở.</p>
        <p v-if="row.sessionStart" class="meta">Buổi tuần này bắt đầu {{ timeText(row.sessionStart) }}<template v-if="row.started"> · đã bắt đầu</template></p>
        <p v-else class="meta warn">Chưa xác định được giờ bắt đầu của buổi này trong tuần đang chọn.</p>
        <footer>
          <AppButton
            v-if="!row.recurringLocked"
            variant="secondary"
            :loading="busy === rowKey(row)"
            @click="run(row, 'lock', { title: 'Khóa thiết bị điện tử', body: `Khóa ${slotName(row)} từ bây giờ. Các buổi đã bắt đầu không bị ảnh hưởng.` })"
          ><Lock aria-hidden="true" />Khóa từ bây giờ</AppButton>
          <AppButton
            v-else
            variant="secondary"
            :loading="busy === rowKey(row)"
            @click="run(row, 'unlock', { title: 'Mở thiết bị điện tử', body: `Mở ${slotName(row)} từ bây giờ. Các tuần trước đó vẫn được ghi nhận là đã khóa.` })"
          ><LockOpen aria-hidden="true" />Mở từ bây giờ</AppButton>
          <AppButton v-if="row.canAllow" :loading="busy === rowKey(row)" @click="run(row, 'allow_session')">Mở riêng tuần này</AppButton>
          <AppButton v-if="row.canRevoke" variant="danger" :loading="busy === rowKey(row)" @click="run(row, 'revoke_allow')">Hủy mở riêng</AppButton>
        </footer>
      </article>
    </section>
    <AppCard v-else padding="lg" class="empty-policy">
      <h2>Lớp này chưa có tiết tự học nào</h2>
      <p>Hãy cấu hình thời khóa biểu trước; chính sách thiết bị áp theo từng tiết trong đó.</p>
    </AppCard>

    <DevicePolicyHistory :history="history" :loading="historyLoading" :error="historyError" />
  </div>
</template>

<style scoped>
.device-policy-page{max-width:1500px;margin:0 auto}
.device-header{display:flex;align-items:flex-start;justify-content:space-between;gap:20px;background:linear-gradient(135deg,var(--wash-sun),color-mix(in srgb,var(--wash-pink) 60%,var(--surface)))}
.device-header h1{margin:8px 0;font-size:clamp(2rem,4vw,3rem)}
.device-header p{margin:0;color:var(--text-muted)}
.page-context,.syncing{display:flex;align-items:center;gap:8px;color:var(--color-warning);font-size:.86rem;font-weight:850}
.page-context svg,.syncing svg{width:18px}
.syncing{padding:7px 10px;border-radius:999px;background:var(--wash-sky);color:var(--color-info)}
.policy-intro p{margin:0 0 8px}
.policy-intro p:last-child{margin-bottom:0}
.slot-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px}
.slot-card{display:grid;gap:10px;padding:18px;border:1px solid var(--border);border-radius:18px;background:var(--surface-raised);box-shadow:var(--shadow-sm)}
.slot-card.locked{border-color:color-mix(in srgb,var(--color-warning) 38%,var(--border));background:linear-gradient(145deg,var(--surface),var(--wash-sun))}
.slot-card.allow_override{border-color:color-mix(in srgb,var(--color-info) 38%,var(--border));background:linear-gradient(145deg,var(--surface),var(--wash-sky))}
.slot-card header{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}
.slot-card h2{margin:0;font-size:1.05rem}
.state{display:flex;align-items:center;gap:6px;font-size:var(--font-size-ui-min);font-weight:900;color:var(--text-muted)}
.state svg{width:16px}
.slot-card.locked .state{color:var(--color-warning)}
.slot-card.allow_override .state{color:var(--color-info)}
.meta{margin:0;color:var(--text-muted);font-size:.84rem}
.meta.warn{color:var(--color-warning);font-weight:800}
footer{display:flex;gap:8px;flex-wrap:wrap}
footer :deep(.app-button){flex:1 1 auto;min-height:40px}
footer :deep(svg){width:16px}
.empty-policy{text-align:center}
.empty-policy h2{margin-top:0}
.empty-policy p{margin-bottom:0;color:var(--text-muted)}
@media(max-width:820px){.device-header{flex-direction:column}}
</style>
