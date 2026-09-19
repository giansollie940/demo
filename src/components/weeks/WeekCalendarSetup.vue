<script setup lang="ts">
import { CalendarRange } from 'lucide-vue-next'
import AppButton from '../ui/AppButton.vue'

withDefaults(defineProps<{
  modelValue: string
  deadlineTime: string
  admin: boolean
  disabled?: boolean
}>(), { disabled: false })
const emit = defineEmits<{
  'update:modelValue': [value: string]
  apply: []
}>()
</script>

<template>
  <section class="calendar-setup">
    <div class="calendar-copy">
      <CalendarRange aria-hidden="true" />
      <div><span>Mốc năm học</span><h2>Tuần 1 bắt đầu ngày nào?</h2><p>Deadline mặc định hiện là {{ deadlineTime }} tối hôm trước từng buổi.</p></div>
    </div>
    <div v-if="admin" class="calendar-actions">
      <label><span>Ngày bắt đầu Tuần 1</span><input type="date" :value="modelValue" :disabled="disabled" @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)" /><small>Ngày được chọn phải là Thứ Hai.</small></label>
      <AppButton :disabled="disabled" @click="emit('apply')">Xếp lại lịch tuần</AppButton>
    </div>
    <div v-else class="manager-note">Mốc Tuần 1 do quản trị viên thiết lập.</div>
  </section>
</template>

<style scoped>
.calendar-setup{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(300px,.7fr);align-items:center;gap:24px;padding:24px;border:1px solid var(--border);border-radius:18px;background:linear-gradient(135deg,color-mix(in srgb,var(--color-info) 9%,var(--surface)),var(--surface));box-shadow:var(--shadow-sm)}.calendar-copy{display:flex;gap:16px;align-items:flex-start}.calendar-copy>svg{width:32px;color:var(--color-info)}.calendar-copy span{color:var(--color-info);font-size:.82rem;font-weight:850}.calendar-copy h2{margin:4px 0}.calendar-copy p{margin:0;color:var(--text-muted)}.calendar-actions{display:grid;gap:8px}.calendar-actions label{display:grid;gap:4px}.calendar-actions label>span{font-size:.82rem;font-weight:850}.calendar-actions input{min-height:44px;border:1px solid var(--border);border-radius:10px;padding:8px 12px;background:var(--input);color:var(--text)}.calendar-actions input:disabled{opacity:.55;cursor:not-allowed}.calendar-actions small,.manager-note{color:var(--text-muted)}.manager-note{padding:16px;border-radius:12px;background:var(--surface-soft);font-weight:700}@media(max-width:820px){.calendar-setup{grid-template-columns:1fr}}
</style>
