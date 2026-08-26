<script setup lang="ts">
import { CalendarOff, CheckCircle2, Clock3, LockKeyhole } from 'lucide-vue-next'
import { computed } from 'vue'

export type WeekDisplayStatus = 'open' | 'locked' | 'upcoming' | 'holiday'
const props = defineProps<{ status: WeekDisplayStatus }>()
const config = computed(() => ({
  open: { label: 'Đang mở', icon: CheckCircle2 },
  locked: { label: 'Đã khóa', icon: LockKeyhole },
  upcoming: { label: 'Sắp tới', icon: Clock3 },
  holiday: { label: 'Tuần nghỉ', icon: CalendarOff },
}[props.status]))
</script>

<template>
  <span class="week-status" :class="`is-${status}`">
    <component :is="config.icon" aria-hidden="true" />
    {{ config.label }}
  </span>
</template>

<style scoped>
.week-status{display:inline-flex;align-items:center;gap:8px;padding:8px 12px;border-radius:999px;background:var(--surface-soft);color:var(--text-muted);font-size:.78rem;font-weight:850}.week-status svg{width:16px}.is-open{background:var(--wash-mint);color:var(--color-success)}.is-locked{color:var(--text-muted)}.is-upcoming{background:var(--wash-sky);color:var(--color-info)}.is-holiday{background:var(--wash-sun);color:var(--color-warning)}
</style>
