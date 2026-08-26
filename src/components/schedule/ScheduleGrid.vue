<script setup lang="ts">
import { computed, ref } from 'vue'
import { Check } from 'lucide-vue-next'
import type { PeriodRecord, ScheduleSlot } from '../../types/legacy'

const days = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6']
const props = withDefaults(defineProps<{
  modelValue: ScheduleSlot[]
  periods: PeriodRecord[]
  disabled?: boolean
}>(), { disabled: false })
const emit = defineEmits<{ 'update:modelValue': [value: ScheduleSlot[]] }>()

const currentDay = new Date().getDay()
const activeDay = ref(currentDay >= 1 && currentDay <= 5 ? currentDay - 1 : 0)
const selected = computed(() => new Set(props.modelValue.map(slot => `${slot.dow}-${slot.period}`)))

function isSelected(dow: number, period: number) {
  return selected.value.has(`${dow}-${period}`)
}

function toggle(dow: number, period: number) {
  if (props.disabled) return
  const key = `${dow}-${period}`
  const next = props.modelValue.filter(slot => `${slot.dow}-${slot.period}` !== key)
  if (!selected.value.has(key)) next.push({ dow, period })
  emit('update:modelValue', next.sort((a, b) => a.dow - b.dow || a.period - b.period))
}

function slotLabel(dow: number, period: PeriodRecord) {
  return `${days[dow]}, Tiết ${period.n}, ${period.start}–${period.end}`
}
</script>

<template>
  <div class="schedule-grid-shell">
    <div class="desktop-schedule" role="grid" aria-label="Thời khóa biểu tự học">
      <div class="corner" role="columnheader">Tiết học</div>
      <div v-for="day in days" :key="day" class="day-head" role="columnheader">{{ day }}</div>
      <template v-for="period in periods" :key="period.n">
        <div class="period-head" role="rowheader">
          <b>Tiết {{ period.n }}</b>
          <span>{{ period.start }}–{{ period.end }}</span>
        </div>
        <button
          v-for="(_, dow) in days"
          :key="`${dow}-${period.n}`"
          type="button"
          class="slot-button"
          :class="{ selected: isSelected(dow, period.n) }"
          :aria-label="slotLabel(dow, period)"
          :aria-pressed="isSelected(dow, period.n)"
          :disabled="disabled"
          role="gridcell"
          @click="toggle(dow, period.n)"
        >
          <Check v-if="isSelected(dow, period.n)" aria-hidden="true" />
          <span>{{ isSelected(dow, period.n) ? 'Tự học' : '' }}</span>
        </button>
      </template>
    </div>

    <div class="mobile-schedule">
      <div class="mobile-day-tabs" role="tablist" aria-label="Chọn ngày học">
        <button
          v-for="(day, dow) in days"
          :key="day"
          type="button"
          role="tab"
          :aria-selected="activeDay === dow"
          :class="{ active: activeDay === dow }"
          @click="activeDay = dow"
        >{{ day }}</button>
      </div>
      <div class="mobile-periods" role="tabpanel" :aria-label="days[activeDay]">
        <button
          v-for="period in periods"
          :key="period.n"
          type="button"
          class="mobile-period"
          :class="{ selected: isSelected(activeDay, period.n) }"
          :aria-label="slotLabel(activeDay, period)"
          :aria-pressed="isSelected(activeDay, period.n)"
          :disabled="disabled"
          @click="toggle(activeDay, period.n)"
        >
          <span><b>Tiết {{ period.n }}</b><small>{{ period.start }}–{{ period.end }}</small></span>
          <span class="mobile-state"><Check v-if="isSelected(activeDay, period.n)" aria-hidden="true" />{{ isSelected(activeDay, period.n) ? 'Tự học' : '' }}</span>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.desktop-schedule{display:grid;grid-template-columns:minmax(116px,.75fr) repeat(5,minmax(105px,1fr));gap:8px;min-width:720px}.corner,.day-head,.period-head{display:flex;align-items:center;justify-content:center;min-height:48px;border-radius:12px;background:var(--surface-soft);color:var(--text-muted);font-weight:800}.period-head{align-items:flex-start;flex-direction:column;padding:8px 12px}.period-head span{font-size:.75rem;font-weight:600}.slot-button{min-height:58px;display:flex;align-items:center;justify-content:center;gap:8px;border:1px solid var(--border);border-radius:12px;background:var(--surface);color:var(--text-muted);font-weight:750;transition:background var(--transition-fast),border-color var(--transition-fast)}.slot-button:hover:not(:disabled){border-color:color-mix(in srgb,var(--color-primary) 45%,var(--border))}.slot-button:active:not(:disabled){background:var(--surface-soft)}.slot-button.selected{border-color:color-mix(in srgb,var(--color-mint) 72%,var(--color-primary));background:linear-gradient(145deg,var(--wash-mint),color-mix(in srgb,var(--wash-sky) 55%,var(--surface)));color:var(--color-success);box-shadow:0 8px 20px color-mix(in srgb,var(--color-mint) 14%,transparent)}.slot-button:disabled{opacity:.55;cursor:not-allowed}.slot-button svg{width:17px}.mobile-schedule{display:none}.mobile-day-tabs{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:4px;padding:4px;border-radius:12px;background:var(--surface-soft)}.mobile-day-tabs button{min-width:0;min-height:44px;border:0;border-radius:9px;padding:8px 4px;background:transparent;color:var(--text-muted);font-size:.77rem;font-weight:800;white-space:nowrap}.mobile-day-tabs button.active{background:var(--surface);color:var(--color-primary);box-shadow:var(--shadow-sm)}.mobile-periods{display:grid;gap:8px;margin-top:12px}.mobile-period{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:44px;padding:12px;border:1px solid var(--border);border-radius:12px;background:var(--surface);color:var(--text);text-align:left}.mobile-period>span:first-child{display:grid}.mobile-period small{color:var(--text-muted)}.mobile-period.selected{border-color:color-mix(in srgb,var(--color-mint) 72%,var(--color-primary));background:linear-gradient(145deg,var(--wash-mint),color-mix(in srgb,var(--wash-sky) 48%,var(--surface)));box-shadow:0 8px 20px color-mix(in srgb,var(--color-mint) 12%,transparent)}.mobile-period:disabled{opacity:.55;cursor:not-allowed}.mobile-state{display:flex;align-items:center;gap:4px;color:var(--text-muted);font-weight:800;white-space:nowrap}.mobile-period.selected .mobile-state{color:var(--color-success)}.mobile-state svg{width:17px}@media(max-width:900px){.desktop-schedule{display:none}.mobile-schedule{display:block}}
</style>
