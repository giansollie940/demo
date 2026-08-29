<script setup lang="ts">
import { AlertTriangle, CheckCircle2, Clock3, Laptop2, UserRound } from 'lucide-vue-next'
import type { CurrentUser, RegistrationRecord } from '../../types/legacy'

const props = defineProps<{
  registrations: RegistrationRecord[]
  users: CurrentUser[]
  selectedId: string | null
}>()
const emit = defineEmits<{ select: [id: string] }>()
const dayName = (dow:number) => ['Thứ 2','Thứ 3','Thứ 4','Thứ 5','Thứ 6','Thứ 7','Chủ nhật'][Number(dow)] ?? `Ngày ${Number(dow)+1}`
function userFor(row:RegistrationRecord){return props.users.find(user=>user.id===row.studentId)}
function statusText(row:RegistrationRecord){
  if(row.status==='approved') return 'Đã duyệt'
  if(row.status==='needs_revision') return 'Cần sửa'
  if(['pending','processing'].includes(row.aiReviewStatus??'')) return 'AI đang xử lý'
  if(row.status==='draft') return 'Bản nháp'
  return 'Chờ duyệt'
}
</script>

<template>
  <div class="approval-list" aria-label="Danh sách đăng ký">
    <button
      v-for="row in registrations"
      :key="row.id"
      type="button"
      class="approval-row"
      :class="{ selected: selectedId === row.id }"
      :aria-current="selectedId === row.id ? 'true' : undefined"
      @click="emit('select', row.id)"
    >
      <span class="student-icon"><UserRound aria-hidden="true" /></span>
      <span class="row-copy">
        <span class="row-top"><strong>{{ userFor(row)?.name ?? 'Học sinh' }}</strong><span class="row-status" :data-status="row.status">{{ statusText(row) }}</span></span>
        <span class="row-meta"><b>{{ userFor(row)?.code ?? '–' }}</b><span>{{ dayName(row.dow) }} · Tiết {{ row.period }}</span></span>
        <span class="row-flags">
          <span v-if="row.isEmergency"><AlertTriangle aria-hidden="true" />Đăng ký bổ sung</span>
          <span v-if="row.usesElectronicDevice"><Laptop2 aria-hidden="true" />Thiết bị điện tử</span>
          <span v-if="['pending','processing'].includes(row.aiReviewStatus??'')"><Clock3 aria-hidden="true" />AI</span>
          <span v-if="row.status==='approved'"><CheckCircle2 aria-hidden="true" />Hoàn tất</span>
        </span>
      </span>
    </button>
    <div v-if="!registrations.length" class="empty-list">Không có đăng ký phù hợp bộ lọc.</div>
  </div>
</template>

<style scoped>
.approval-list{display:grid;gap:8px;align-content:start}.approval-row{width:100%;display:grid;grid-template-columns:42px minmax(0,1fr);gap:10px;text-align:left;border:1px solid var(--border);border-radius:14px;background:var(--surface-raised);padding:12px;color:var(--text);cursor:pointer;transition:border-color var(--transition-fast),box-shadow var(--transition-fast),transform var(--transition-fast)}.approval-row:hover{border-color:color-mix(in srgb,var(--color-primary) 40%,var(--border));box-shadow:var(--shadow-sm);transform:translateY(-1px)}.approval-row.selected{border-color:var(--color-primary);box-shadow:0 0 0 2px color-mix(in srgb,var(--color-primary) 16%,transparent)}.approval-row:focus-visible{outline:3px solid var(--focus-inner);outline-offset:2px}.student-icon{width:42px;height:42px;display:grid;place-items:center;border-radius:12px;background:var(--surface-soft);color:var(--color-primary)}.student-icon svg{width:20px}.row-copy{min-width:0;display:grid;gap:5px}.row-top,.row-meta,.row-flags{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.row-top{justify-content:space-between}.row-status{font-size:.72rem;font-weight:900;padding:4px 8px;border-radius:999px;background:var(--surface-soft);color:var(--text-muted)}.row-status[data-status="approved"]{color:var(--color-success)}.row-status[data-status="needs_revision"]{color:var(--color-warning)}.row-meta{font-size:.78rem;color:var(--text-muted)}.row-meta b{color:var(--text)}.row-flags{font-size:.72rem;color:var(--text-muted)}.row-flags span{display:inline-flex;align-items:center;gap:4px}.row-flags svg{width:13px}.empty-list{padding:28px 18px;text-align:center;color:var(--text-muted);border:1px dashed var(--border);border-radius:14px;background:var(--surface-soft)}
@media(prefers-reduced-motion:reduce){.approval-row{transition:none}.approval-row:hover{transform:none}}
</style>
