<script setup lang="ts">
// FEAT-010 · Sol RC3 R-001 — lịch sử Khóa/Mở/mở riêng.
//
// Dùng chung cho trang của giáo viên và tab chỉ-đọc của quản trị: cùng một dữ
// liệu, cùng một cách đọc. Component này không có nút nào, nên đặt nó ở đâu
// cũng không cấp thêm quyền cho ai.
import { computed } from 'vue'
import { History, Lock, LockOpen } from 'lucide-vue-next'
import AppCard from '../ui/AppCard.vue'
import InlineStatus from '../ui/InlineStatus.vue'
import {
  DEVICE_HISTORY_LABEL, deviceHistoryEvents, deviceSlotLabel,
  type DevicePolicyHistoryPayload,
} from '../../features/registrations/device-policy'

const props = defineProps<{
  history: DevicePolicyHistoryPayload | null
  loading?: boolean
  error?: string
}>()
const events = computed(() => deviceHistoryEvents(props.history))
const when = (value: number) =>
  new Date(value).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' })
</script>

<template>
  <AppCard padding="lg" class="policy-history">
    <h2><History aria-hidden="true" />Lịch sử khóa / mở</h2>
    <InlineStatus v-if="error" state="error" :message="error" />
    <p v-else-if="loading" class="muted">Đang tải lịch sử…</p>
    <p v-else-if="!events.length" class="muted">Lớp này chưa có thao tác khóa hoặc mở nào.</p>
    <ol v-else class="timeline">
      <li v-for="(event, index) in events" :key="`${event.kind}-${event.at}-${index}`" :class="event.kind">
        <span class="mark">
          <Lock v-if="event.kind === 'lock' || event.kind === 'revoke_allow'" aria-hidden="true" />
          <LockOpen v-else aria-hidden="true" />
        </span>
        <span class="body">
          <b>{{ DEVICE_HISTORY_LABEL[event.kind] }}</b>
          <span class="slot">{{ deviceSlotLabel(event.dow, event.period) }}</span>
        </span>
        <time>{{ when(event.at) }}</time>
      </li>
    </ol>
  </AppCard>
</template>

<style scoped>
.policy-history h2{display:flex;align-items:center;gap:8px;margin:0 0 12px;font-size:1.05rem}
.policy-history h2 svg{width:18px;color:var(--color-primary)}
.muted{margin:0;color:var(--text-muted)}
.timeline{display:grid;gap:8px;margin:0;padding:0;list-style:none}
.timeline li{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:10px;padding:10px 12px;border-radius:12px;background:var(--surface-soft)}
.timeline li.lock,.timeline li.revoke_allow{background:var(--wash-sun)}
.timeline li.unlock,.timeline li.allow{background:var(--wash-sky)}
.mark{display:flex}
.mark svg{width:17px}
.timeline li.lock .mark,.timeline li.revoke_allow .mark{color:var(--color-warning)}
.timeline li.unlock .mark,.timeline li.allow .mark{color:var(--color-info)}
.body{display:flex;flex-wrap:wrap;gap:4px 10px;align-items:baseline}
.slot{color:var(--text-muted);font-size:.86rem}
time{color:var(--text-muted);font-size:.82rem;white-space:nowrap}
@media(max-width:520px){.timeline li{grid-template-columns:auto 1fr}time{grid-column:2}}
</style>
