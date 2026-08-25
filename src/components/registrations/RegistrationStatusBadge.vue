<script setup lang="ts">
import { AlertTriangle, CheckCircle2, Clock3, FilePenLine, MinusCircle } from 'lucide-vue-next'
import { computed } from 'vue'

const props = defineProps<{ status: string }>()
const config = computed(() => ({
  missing: { label: 'Chưa đăng ký', icon: MinusCircle, tone: 'neutral' },
  draft: { label: 'Bản nháp', icon: FilePenLine, tone: 'neutral' },
  submitted: { label: 'Đang chờ duyệt', icon: Clock3, tone: 'info' },
  approved: { label: 'Đã duyệt', icon: CheckCircle2, tone: 'success' },
  needs_revision: { label: 'Cần chỉnh sửa', icon: FilePenLine, tone: 'warning' },
  revision_overdue: { label: 'Báo cáo lỗi', icon: AlertTriangle, tone: 'danger' },
}[props.status] ?? { label: props.status || 'Chưa đăng ký', icon: MinusCircle, tone: 'neutral' }))
</script>

<template><span class="registration-status" :class="`is-${config.tone}`"><component :is="config.icon" aria-hidden="true" />{{ config.label }}</span></template>

<style scoped>
.registration-status{display:inline-flex;align-items:center;gap:8px;padding:8px 12px;border-radius:999px;background:var(--surface-soft);color:var(--text-muted);font-size:.78rem;font-weight:850;white-space:nowrap}.registration-status svg{width:16px}.is-info{background:color-mix(in srgb,var(--color-info) 13%,var(--surface));color:var(--color-info)}.is-success{background:color-mix(in srgb,var(--color-success) 13%,var(--surface));color:var(--color-success)}.is-warning{background:color-mix(in srgb,var(--color-warning) 13%,var(--surface));color:var(--color-warning)}.is-danger{background:color-mix(in srgb,var(--color-danger) 12%,var(--surface));color:var(--color-danger)}
</style>
