<script setup lang="ts">
import { CalendarClock, Eye, Palmtree } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'
import AppButton from '../ui/AppButton.vue'
import WeekStatusBadge, { type WeekDisplayStatus } from './WeekStatusBadge.vue'
import type { WeekEditorDraft } from '../../features/weeks/week-editor-model'

const props = withDefaults(defineProps<{
  modelValue: WeekEditorDraft
  operationalStatus: WeekDisplayStatus
  current?: boolean
  viewing?: boolean
  deadlineTime?: string
  disabled?: boolean
}>(), { current: false, viewing: false, deadlineTime: '20:00', disabled: false })

const emit = defineEmits<{
  'update:modelValue': [value: WeekEditorDraft]
  view: []
  'open-schedule': []
}>()

const deadlineOpen=ref(false)
const deadlineDraft=ref('')
const deadlinePreviousMode=ref<WeekEditorDraft['deadlineMode']>('per_session_20')
const validDeadline=(value:string)=>/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)
const deadlineInvalid = computed(() => props.modelValue.deadlineMode === 'specific' && !validDeadline(props.modelValue.deadline))
const deadlineDraftInvalid=computed(()=>!validDeadline(deadlineDraft.value))
const deadlineSummaryHelpId = computed(() => `week-${props.modelValue.id}-deadline-summary-help`)
const deadlineDraftHelpId = computed(() => `week-${props.modelValue.id}-deadline-draft-help`)
const operationMode = computed(() => props.modelValue.manualStatus ?? 'auto')
const specificDeadlineLabel=computed(()=>validDeadline(props.modelValue.deadline)?formatDateTime(props.modelValue.deadline):'Hạn cụ thể cho cả tuần')
const deadlineSummaryText=computed(()=>{
  if(props.modelValue.deadlineMode!=='specific')return 'Deadline được tính riêng cho từng buổi.'
  if(deadlineInvalid.value)return 'Hãy chọn ngày và giờ hết hạn.'
  return `Hạn cụ thể cho cả tuần · ${specificDeadlineLabel.value}`
})

watch(()=>props.modelValue.id,()=>{deadlineOpen.value=false;deadlineDraft.value=props.modelValue.deadline})
watch(()=>props.modelValue.deadline,value=>{if(!deadlineOpen.value)deadlineDraft.value=value})

function update(patch: Partial<WeekEditorDraft>) { emit('update:modelValue', { ...props.modelValue, ...patch }) }
function updateOperationMode(value:string){update({manualStatus:value==='open'||value==='locked'?value:null})}
function defaultSpecificDeadline(){return validDeadline(props.modelValue.deadline)?props.modelValue.deadline:`${props.modelValue.startDate}T${props.deadlineTime}`}
function openSpecificDeadline(){deadlinePreviousMode.value=props.modelValue.deadlineMode;deadlineDraft.value=defaultSpecificDeadline();if(props.modelValue.deadlineMode!=='specific')update({deadlineMode:'specific'});deadlineOpen.value=true}
function updateDeadlineMode(value:WeekEditorDraft['deadlineMode']){if(value==='specific')openSpecificDeadline();else{deadlineOpen.value=false;update({deadlineMode:value})}}
function cancelSpecificDeadline(){deadlineOpen.value=false;deadlineDraft.value=props.modelValue.deadline;if(deadlinePreviousMode.value!=='specific')update({deadlineMode:deadlinePreviousMode.value})}
function applySpecificDeadline(){if(deadlineDraftInvalid.value)return;update({deadlineMode:'specific',deadline:deadlineDraft.value});deadlineOpen.value=false}
function formatDate(value: string) { const [year, month, day] = value.split('-');return year && month && day ? `${day}/${month}/${year}` : value }
function formatDateTime(value:string){if(!validDeadline(value))return value;const [date,time]=value.split('T');return `${formatDate(date)} · ${time}`}
</script>

<template>
  <article class="week-editor-card" :class="{ current, viewing }">
    <header>
      <div class="week-identity"><div class="week-number">Tuần {{ modelValue.number }}</div><div class="week-dates">{{ formatDate(modelValue.startDate) }} – {{ formatDate(modelValue.endDate) }}</div></div>
      <div class="week-labels"><WeekStatusBadge :status="modelValue.holiday ? 'holiday' : operationalStatus" /><span v-if="current" class="context-label">Hiện hành</span><span v-if="viewing" class="context-label is-viewing">Đang xem</span></div>
    </header>

    <div class="week-controls">
      <label class="holiday-control"><input type="checkbox" :checked="modelValue.holiday" :disabled="disabled" @change="update({ holiday: ($event.target as HTMLInputElement).checked })"/><Palmtree aria-hidden="true"/><span><b>Tuần nghỉ</b><small>Không dùng TKB riêng rỗng để biểu thị nghỉ học.</small></span></label>

      <label class="field-control operation-control"><span>Chế độ vận hành</span><select :value="operationMode" :disabled="disabled||modelValue.holiday" @change="updateOperationMode(($event.target as HTMLSelectElement).value)"><option value="auto">Tự động</option><option value="open">Mở thủ công</option><option value="locked">Đóng thủ công</option></select><small class="field-helper">Tự động sẽ đóng sau buổi tự học cuối và chuyển sang tuần kế tiếp.</small></label>

      <div class="field-control deadline-control">
        <span>Deadline</span>
        <select :value="modelValue.deadlineMode" :disabled="disabled" :aria-invalid="deadlineInvalid ? 'true' : undefined" :aria-describedby="deadlineSummaryHelpId" @change="updateDeadlineMode(($event.target as HTMLSelectElement).value as WeekEditorDraft['deadlineMode'])">
          <option value="per_session_20">{{ deadlineTime }} tối hôm trước từng buổi</option>
          <option value="specific">{{ specificDeadlineLabel }}</option>
        </select>
        <small :id="deadlineSummaryHelpId" class="field-helper" :class="{error:deadlineInvalid}">{{ deadlineSummaryText }}</small>
        <div v-if="deadlineOpen" class="deadline-popover" role="dialog" aria-modal="false" aria-label="Chọn hạn cụ thể">
          <b>Chọn ngày và giờ hết hạn</b>
          <input v-model="deadlineDraft" type="datetime-local" :disabled="disabled" :aria-invalid="deadlineDraftInvalid" :aria-describedby="deadlineDraftHelpId"/>
          <small :id="deadlineDraftHelpId" class="field-helper" :class="{ error: deadlineDraftInvalid }">{{ deadlineDraftInvalid ? 'Hãy chọn ngày và giờ hết hạn.' : `Sẽ hiển thị: ${formatDateTime(deadlineDraft)}` }}</small>
          <div class="deadline-popover-actions"><AppButton size="sm" variant="secondary" :disabled="disabled" @click="cancelSpecificDeadline">Hủy</AppButton><AppButton size="sm" :disabled="disabled||deadlineDraftInvalid" @click="applySpecificDeadline">Áp dụng hạn</AppButton></div>
        </div>
      </div>

      <label class="field-control note-field"><span>Ghi chú tuần</span><input type="text" :value="modelValue.note" :disabled="disabled" placeholder="Không bắt buộc" @input="update({ note: ($event.target as HTMLInputElement).value })"/><small class="field-helper">Không bắt buộc.</small></label>
    </div>

    <footer><AppButton variant="secondary" :disabled="disabled" @click="emit('view')"><Eye aria-hidden="true" /> Xem tuần</AppButton><AppButton variant="secondary" :disabled="disabled" @click="emit('open-schedule')"><CalendarClock aria-hidden="true" /> Mở TKB tuần này</AppButton></footer>
  </article>
</template>

<style scoped>
.week-editor-card{border:1px solid var(--border);border-radius:18px;padding:20px;background:var(--surface);box-shadow:var(--shadow-sm);transition:border-color var(--transition-fast),background var(--transition-fast)}.week-editor-card.current{border-color:color-mix(in srgb,var(--color-success) 45%,var(--border))}.week-editor-card.viewing{background:color-mix(in srgb,var(--color-primary) 5%,var(--surface));box-shadow:0 0 0 2px color-mix(in srgb,var(--color-primary) 18%,transparent)}header{display:flex;justify-content:space-between;gap:16px;align-items:flex-start}.week-number{font-size:1.15rem;font-weight:900}.week-dates{margin-top:4px;color:var(--text-muted);font-size:.87rem;font-variant-numeric:tabular-nums}.week-labels{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}.context-label{display:inline-flex;align-items:center;padding:8px 12px;border-radius:999px;background:color-mix(in srgb,var(--color-success) 12%,var(--surface));color:var(--color-success);font-size:.76rem;font-weight:850}.context-label.is-viewing{background:color-mix(in srgb,var(--color-primary) 12%,var(--surface));color:var(--color-primary)}.week-controls{display:grid;grid-template-columns:minmax(220px,.9fr) minmax(220px,1fr) minmax(240px,1.1fr);gap:12px;margin-top:20px}.holiday-control,.field-control{display:flex;gap:8px;border:1px solid var(--border);border-radius:12px;padding:12px;background:var(--surface-soft)}.holiday-control{align-items:center}.holiday-control input{width:20px;height:20px;accent-color:var(--color-primary)}.holiday-control svg{width:20px;color:var(--color-warning)}.holiday-control span{display:grid}.holiday-control small{color:var(--text-muted)}.field-control{flex-direction:column}.deadline-control{position:relative}.deadline-popover{position:absolute;z-index:115;top:calc(100% + 8px);left:0;right:0;display:grid;gap:8px;padding:12px;border:1px solid color-mix(in srgb,var(--color-primary) 24%,var(--border));border-radius:14px;background:var(--surface-raised);box-shadow:0 18px 42px rgb(54 44 70 / .18)}.deadline-popover b{font-size:.82rem}.deadline-popover::before{content:"";position:absolute;top:-6px;left:24px;width:12px;height:12px;transform:rotate(45deg);background:var(--surface-raised);border-left:1px solid color-mix(in srgb,var(--color-primary) 24%,var(--border));border-top:1px solid color-mix(in srgb,var(--color-primary) 24%,var(--border))}.deadline-popover-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:2px}.field-control>span{font-size:.78rem;font-weight:850;color:var(--text-muted)}.field-control input,.field-control select{width:100%;min-height:44px;border:1px solid var(--border);border-radius:9px;padding:8px 12px;background:var(--input);color:var(--text)}.field-control input:disabled,.field-control select:disabled{opacity:.55;cursor:not-allowed}.field-helper{min-height:1lh;color:var(--text-muted);font-size:.76rem}.field-helper.error{color:var(--color-danger);font-weight:800}.field-control input[aria-invalid="true"]{border-color:var(--color-danger)}.note-field{grid-column:1/-1}footer{display:flex;justify-content:flex-end;gap:8px;margin-top:16px}footer :deep(svg){width:16px}@media(max-width:900px){.week-controls{grid-template-columns:1fr 1fr}.note-field{grid-column:1/-1}}@media(max-width:620px){.deadline-popover{position:fixed;z-index:125;left:10px;right:10px;top:auto;bottom:10px}.deadline-popover::before{display:none}header{flex-direction:column}.week-labels{justify-content:flex-start}.week-controls{grid-template-columns:1fr}.note-field{grid-column:auto}footer{display:grid;grid-template-columns:1fr}footer :deep(button){width:100%}}
</style>
