<script setup lang="ts">
// FEAT-010 · Sol RC3 R-001 — Quản trị xem trạng thái và lịch sử, **chỉ xem**.
//
// FINAL §8: Admin "được xem trạng thái/audit để hỗ trợ quản trị" nhưng "không
// mặc nhiên thay Teacher để Lock/Unlock". RC3 có quyền đọc ở backend
// (`can_manage_class` bao gồm admin) và không có màn hình nào, nên trên thực tế
// Admin không xem được gì — một quyền chỉ tồn tại trong SQL thì không phải là
// một quyền người dùng có.
//
// Vì sao là tab của Quản trị chứ không phải mở trang của giáo viên cho Admin:
// router chuyển hướng Admin khỏi mọi đường dẫn trừ /admin, /settings và
// /homework. Khoét một lỗ trong lớp chặn đó để dùng lại một trang **có nút bấm**
// là cách tốn ít dòng nhất và cũng là cách dễ vô tình cấp quyền ghi nhất. Ở đây
// không có nút nào để vô tình cấp.
import { computed, ref, watch } from 'vue'
import { Laptop2, RefreshCw } from 'lucide-vue-next'
import AppCard from '../ui/AppCard.vue'
import InlineStatus, { type InlineStatusState } from '../ui/InlineStatus.vue'
import DevicePolicyHistory from '../registrations/DevicePolicyHistory.vue'
import { legacyApi } from '../../services/legacy-supabase'
import {
  deviceSlotLabel, deviceSlotRows,
  type DevicePolicyHistoryPayload, type DevicePolicySlot,
} from '../../features/registrations/device-policy'

const props = defineProps<{
  classes: Array<{ id: string; code?: string; name?: string }>
  weeks: Array<{ id: string; number?: number }>
}>()

// Không có nút nào phụ thuộc "buổi đã bắt đầu chưa", nên không cần đồng hồ
// chạy: chụp một mốc lúc tải là đủ, và nó giữ component này mount được ở bất kỳ
// đâu.
const loadedAt = ref(Date.now())
const classId = ref(props.classes[0]?.id ?? '')
const weekId = ref(props.weeks[0]?.id ?? '')
const slots = ref<DevicePolicySlot[]>([])
const history = ref<DevicePolicyHistoryPayload | null>(null)
const loading = ref(false)
const status = ref<InlineStatusState>('idle')
const message = ref('')

const rows = computed(() => deviceSlotRows(slots.value, loadedAt.value))
const className = (id: string) => {
  const found = props.classes.find(item => item.id === id)
  return found ? (found.code ? `${found.code} — ${found.name ?? ''}`.trim() : found.name ?? id) : id
}

async function load() {
  if (!classId.value) return
  loading.value = true; status.value = 'idle'; message.value = ''; loadedAt.value = Date.now()
  try {
    const [state, log] = await Promise.all([
      weekId.value
        ? legacyApi.deviceUsePolicy('state', { class_id: classId.value, week_id: weekId.value })
        : Promise.resolve([]),
      legacyApi.deviceUsePolicy('history', { class_id: classId.value }),
    ])
    slots.value = (state ?? []) as DevicePolicySlot[]
    history.value = log as DevicePolicyHistoryPayload
  } catch (error) {
    status.value = 'error'
    message.value = error instanceof Error ? error.message : 'Không đọc được chính sách thiết bị của lớp này.'
  } finally { loading.value = false }
}

watch([classId, weekId], load, { immediate: true })
</script>

<template>
  <div class="admin-device-policy">
    <AppCard padding="lg">
      <h2><Laptop2 aria-hidden="true" />Thiết bị điện tử — chế độ chỉ xem</h2>
      <p class="muted">
        Quản trị <b>chỉ xem</b> trạng thái và lịch sử để hỗ trợ điều hành. Việc khóa hoặc mở
        thuộc về giáo viên được phân công lớp — trang này cố ý không có nút thao tác nào,
        và máy chủ cũng từ chối nếu có ai gọi thẳng.
      </p>
      <div class="pickers">
        <label><span>Lớp</span>
          <select v-model="classId">
            <option v-for="row in classes" :key="row.id" :value="row.id">{{ className(row.id) }}</option>
          </select>
        </label>
        <label><span>Tuần</span>
          <select v-model="weekId">
            <option v-for="row in weeks" :key="row.id" :value="row.id">Tuần {{ row.number ?? '–' }}</option>
          </select>
        </label>
        <span v-if="loading" class="syncing"><RefreshCw aria-hidden="true" />Đang tải</span>
      </div>
    </AppCard>

    <InlineStatus :state="status" :message="message" />

    <AppCard padding="lg">
      <h2>Trạng thái theo tiết</h2>
      <p v-if="!rows.length" class="muted">Tuần đang chọn không có tiết tự học nào cho lớp này.</p>
      <ul v-else class="slot-list">
        <li v-for="row in rows" :key="`${row.dow}-${row.period}`" :class="row.state">
          <b>{{ deviceSlotLabel(row.dow, row.period) }}</b>
          <span>{{ row.state === 'locked' ? 'Đang khóa' : row.state === 'allow_override' ? 'Được mở riêng tuần này' : 'Đang mở' }}</span>
          <small v-if="row.recurringLocked">Slot hiện đang khóa</small>
          <small v-else>Slot hiện đang mở</small>
        </li>
      </ul>
    </AppCard>

    <DevicePolicyHistory :history="history" :loading="loading" :error="''" />
  </div>
</template>

<style scoped>
.admin-device-policy{display:grid;gap:16px}
h2{display:flex;align-items:center;gap:8px;margin:0 0 8px;font-size:1.05rem}
h2 svg{width:18px;color:var(--color-warning)}
.muted{margin:0 0 12px;color:var(--text-muted)}
.pickers{display:flex;flex-wrap:wrap;align-items:flex-end;gap:12px}
.pickers label{display:grid;gap:4px}
.pickers span{font-size:var(--font-size-ui-min);font-weight:850;color:var(--text-muted)}
.pickers select{min-height:44px;min-width:180px;border:1px solid var(--border);border-radius:10px;padding:8px 12px;background:var(--input);color:var(--text)}
.syncing{display:flex;align-items:center;gap:6px;color:var(--color-info);font-size:var(--font-size-ui-min);font-weight:850}
.syncing svg{width:16px}
.slot-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:10px;margin:0;padding:0;list-style:none}
.slot-list li{display:grid;gap:2px;padding:10px 12px;border-radius:12px;background:var(--surface-soft)}
.slot-list li.locked{background:var(--wash-sun)}
.slot-list li.allow_override{background:var(--wash-sky)}
.slot-list small{color:var(--text-muted)}
</style>
