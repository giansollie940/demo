<script setup lang="ts">
import { ref } from 'vue'
import ScheduleGrid from '../../src/components/schedule/ScheduleGrid.vue'
import ScheduleModeTabs from '../../src/components/schedule/ScheduleModeTabs.vue'
import WeekCalendarSetup from '../../src/components/weeks/WeekCalendarSetup.vue'
import WeekEditorCard from '../../src/components/weeks/WeekEditorCard.vue'
import type { ScheduleSlot } from '../../src/types/legacy'
import type { WeekEditorDraft } from '../../src/features/weeks/week-editor-model'

const mode = ref<'default' | 'week'>('week')
const slots = ref<ScheduleSlot[]>([
  { dow: 0, period: 1 }, { dow: 0, period: 2 }, { dow: 2, period: 3 }, { dow: 4, period: 2 },
])
const weekStart = ref('2026-08-24')
const week = ref<WeekEditorDraft>({
  id: 'week-12', number: 12, startDate: '2026-11-02', endDate: '2026-11-08',
  holiday: false, deadlineMode: 'specific', deadline: '2026-11-01T20:00', note: 'Kiểm tra giữa kỳ',
})
const periods = [
  { n: 1, start: '07:00', end: '07:40' }, { n: 2, start: '07:45', end: '08:25' },
  { n: 3, start: '08:30', end: '09:10' }, { n: 4, start: '09:25', end: '10:05' },
]
</script>

<template>
  <main class="preview-shell">
    <header><h1>CP2 · Tuần và thời khóa biểu</h1><p>Harness chỉ dùng để đo responsive và interaction CSS; không kết nối dữ liệu thật.</p></header>
    <section class="preview-section">
      <ScheduleModeTabs v-model="mode" :week-number="12" />
      <ScheduleGrid v-model="slots" :periods="periods" />
    </section>
    <WeekCalendarSetup v-model="weekStart" deadline-time="20:00" admin />
    <WeekEditorCard v-model="week" operational-status="open" current viewing deadline-time="20:00" />
  </main>
</template>

<style scoped>
.preview-shell{width:auto;max-width:1180px;margin:0 auto;padding:24px;display:grid;gap:24px}.preview-shell>*{min-width:0}.preview-shell>header h1{margin:0}.preview-shell>header p{margin:8px 0 0;color:var(--text-muted)}.preview-section{display:grid;gap:20px;padding:24px;border:1px solid var(--border);border-radius:var(--radius-lg);background:var(--surface)}@media(max-width:520px){.preview-shell{padding:12px;gap:16px}.preview-section{padding:12px}}
</style>
