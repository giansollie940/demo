<script setup lang="ts">
import { MoreHorizontal } from 'lucide-vue-next'
import type { DashboardQueueRow } from '../../features/dashboard/dashboard-presenter'

defineProps<{ rows: DashboardQueueRow[]; total: number; revisionCount: number; issueCount: number }>()

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(-2).map(part => part[0]?.toUpperCase() ?? '').join('') || 'HS'
}
</script>

<template>
  <section class="queue-card-r7">
    <div class="queue-heading">
      <div><span>ƯU TIÊN</span><h2>Công việc cần xử lý</h2></div>
      <div class="queue-tabs" aria-label="Tóm tắt hàng chờ">
        <b>Cần duyệt {{ total }}</b><span>Chỉnh sửa {{ revisionCount }}</span><span>Quá hạn {{ issueCount }}</span>
      </div>
    </div>
    <div v-if="rows.length" class="queue-table" role="table" aria-label="Công việc cần xử lý">
      <div v-for="row in rows.slice(0, 6)" :key="row.id" class="queue-row" role="row">
        <span class="queue-avatar" aria-hidden="true">{{ initials(row.studentName) }}</span>
        <span class="queue-person"><strong>{{ row.studentName }}</strong><small>{{ row.classLabel }} · {{ row.studentCode }}</small></span>
        <span class="queue-content">{{ row.content }}</span>
        <span class="queue-time">{{ row.timestampLabel }}</span>
        <span class="queue-status" :data-status="row.status">{{ row.statusLabel }}</span>
        <RouterLink v-if="row.actionTo" :to="row.actionTo" class="queue-action" :aria-label="`Mở ${row.studentName}`"><MoreHorizontal /></RouterLink>
        <span v-else class="queue-action muted"><MoreHorizontal /></span>
      </div>
    </div>
    <div v-else class="queue-empty">Không có công việc cần giáo viên xử lý trong tuần đang xem.</div>
  </section>
</template>

<style scoped>
.queue-card-r7 { padding: 18px; border: 1px solid var(--border); border-radius: 22px; background: color-mix(in srgb, var(--surface) 97%, transparent); box-shadow: 0 10px 28px rgb(47 65 91 / .05); }
.queue-heading { display: flex; justify-content: space-between; gap: 16px; align-items: flex-end; margin-bottom: 12px; }
.queue-heading > div:first-child > span { color: var(--color-primary); font-size: .67rem; font-weight: 900; letter-spacing: .12em; }
h2 { margin: 4px 0 0; font-size: 1.08rem; }
.queue-tabs { display: flex; gap: 7px; flex-wrap: wrap; }
.queue-tabs span,.queue-tabs b { padding: 6px 9px; border-radius: 999px; background: var(--surface-soft); color: var(--text-muted); font-size: .68rem; font-weight: 800; }
.queue-tabs b { color: var(--color-primary); background: color-mix(in srgb, var(--wash-sky) 65%, var(--surface)); }
.queue-table { display: grid; }
.queue-row { display: grid; grid-template-columns: 38px minmax(130px,1.05fr) minmax(180px,1.5fr) 110px 90px 30px; gap: 10px; align-items: center; min-height: 58px; border-top: 1px solid color-mix(in srgb, var(--border) 80%, transparent); }
.queue-avatar { width: 34px; height: 34px; display: grid; place-items: center; border-radius: 50%; background: linear-gradient(145deg,var(--wash-peach),var(--wash-sky)); color: var(--color-primary); font-size: .68rem; font-weight: 900; }
.queue-person { min-width: 0; display: grid; gap: 2px; }
.queue-person strong,.queue-person small,.queue-content,.queue-time { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.queue-person strong { font-size: .77rem; }.queue-person small,.queue-time { color: var(--text-muted); font-size: .66rem; }.queue-content { color: var(--text-muted); font-size: .73rem; }
.queue-status { justify-self: start; padding: 5px 8px; border-radius: 999px; color: var(--color-warning); background: color-mix(in srgb,var(--wash-sun) 70%,var(--surface)); font-size: .65rem; font-weight: 900; }
.queue-status[data-status="needs_revision"] { color: var(--color-danger); background: color-mix(in srgb,var(--wash-pink) 68%,var(--surface)); }.queue-status[data-status="overdue"] { color: var(--color-danger); }
.queue-action { display: grid; place-items: center; width: 28px; height: 28px; border-radius: 9px; color: var(--text-muted); }.queue-action:hover { background: var(--surface-soft); color: var(--color-primary); }.queue-action :deep(svg) { width: 17px; }.queue-action.muted { opacity: .35; }
.queue-empty { min-height: 160px; display: grid; place-items: center; padding: 24px; border: 1px dashed var(--border); border-radius: 16px; background: var(--surface-soft); color: var(--text-muted); text-align: center; }
@media (max-width: 900px) { .queue-row { grid-template-columns: 38px minmax(120px,1fr) minmax(150px,1.4fr) 90px; }.queue-time,.queue-action { display:none; }.queue-status { justify-self:end; } }
@media (max-width: 620px) { .queue-heading { align-items:flex-start; flex-direction:column; }.queue-row { grid-template-columns: 36px minmax(0,1fr) auto; padding: 8px 0; }.queue-content { grid-column: 2 / 4; }.queue-time,.queue-action { display:none; } }
</style>
