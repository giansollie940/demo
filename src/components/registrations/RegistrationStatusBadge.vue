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
.registration-status{display:inline-flex;align-items:center;gap:8px;padding:8px 12px;border:1px solid var(--border);border-radius:999px;background:var(--surface-soft);color:var(--text-muted);font-size:.78rem;font-weight:850;white-space:nowrap}.registration-status svg{width:16px}.is-info{background:var(--wash-sky);border-color:color-mix(in srgb,var(--color-sky) 18%,var(--border));color:var(--color-info)}.is-success{background:var(--wash-mint);border-color:color-mix(in srgb,var(--color-mint) 18%,var(--border));color:var(--color-success)}.is-warning{background:var(--wash-sun);border-color:color-mix(in srgb,var(--color-sun) 18%,var(--border));color:var(--color-warning)}.is-danger{background:var(--wash-coral);border-color:color-mix(in srgb,var(--color-coral) 18%,var(--border));color:var(--color-danger)}
</style>
