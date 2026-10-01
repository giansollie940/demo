<script setup lang="ts">
import { computed, watch } from 'vue'
import { awardMonthLabel, awardMonthOptions, type AwardMode, type AwardPeriod, type AwardWeekOption } from '../../features/homework/award-months'

/*
 * Góc tuyên dương: chọn xem theo tháng, theo tuần hoặc cả năm học, rồi chọn kỳ.
 * Tuần đầu tiên trong danh sách (mới nhất) hoặc `defaultWeek` được chọn khi chuyển sang "Tuần".
 */
const period = defineModel<AwardPeriod>({ required: true })
const props = defineProps<{ months?: string[]; weeks: AwardWeekOption[]; defaultWeek?: string | null }>()

const monthOptions = computed(() => awardMonthOptions(props.months, period.value.month))
const modes: Array<{ id: AwardMode; label: string }> = [
  { id: 'month', label: 'Tháng' },
  { id: 'week', label: 'Tuần' },
  { id: 'year', label: 'Năm học' },
]

function setMode(mode: AwardMode) {
  const next = { ...period.value, mode }
  if (mode === 'week' && !props.weeks.some(w => w.id === next.week))
    next.week = props.weeks.find(w => w.id === props.defaultWeek)?.id ?? props.weeks[0]?.id ?? ''
  period.value = next
}

// A week list that arrives later (or changes with the class) still gets a valid selection.
watch(() => props.weeks, weeks => {
  if (period.value.mode === 'week' && !weeks.some(w => w.id === period.value.week)) setMode('week')
})
</script>

<template>
  <div class="award-period">
    <div class="modes" role="radiogroup" aria-label="Xem tuyên dương theo">
      <button
        v-for="m in modes"
        :key="m.id"
        type="button"
        role="radio"
        :aria-checked="period.mode === m.id"
        :class="{ active: period.mode === m.id }"
        :disabled="m.id === 'week' && !weeks.length"
        @click="setMode(m.id)"
      >{{ m.label }}</button>
    </div>
    <select v-if="period.mode === 'month'" aria-label="Chọn tháng" :value="period.month" @change="period = { ...period, month: ($event.target as HTMLSelectElement).value }">
      <option v-for="m in monthOptions" :key="m" :value="m">{{ awardMonthLabel(m) }}</option>
    </select>
    <select v-else-if="period.mode === 'week'" aria-label="Chọn tuần" :value="period.week" @change="period = { ...period, week: ($event.target as HTMLSelectElement).value }">
      <option v-for="w in weeks" :key="w.id" :value="w.id">{{ w.label }}</option>
    </select>
  </div>
</template>

<style scoped>
.award-period { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.modes { display: inline-flex; gap: 4px; padding: 4px; border-radius: 12px; background: var(--surface-soft, rgba(0, 0, 0, .04)); }
.modes button { min-height: 34px; padding: 0 12px; border: 1px solid transparent; border-radius: 9px; background: transparent; color: var(--text-muted); font: inherit; font-weight: 800; cursor: pointer; }
.modes button.active { background: var(--surface); border-color: var(--border); color: var(--color-primary); }
.modes button:disabled { opacity: .45; cursor: not-allowed; }
select { min-height: 38px; }
</style>
