<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import AppButton from '../ui/AppButton.vue'
import InlineStatus from '../ui/InlineStatus.vue'
import type { PeriodRecord, RegistrationRecord, WeekRecord } from '../../types/legacy'
import type { RegistrationEligibility } from '../../features/registrations/registration-model'

const props = defineProps<{
  open: boolean
  mode: 'regular' | 'emergency'
  week: WeekRecord
  period: PeriodRecord
  dow: number
  registration: RegistrationRecord | null
  eligibility: RegistrationEligibility
  saving: boolean
  error: string
}>()
const emit = defineEmits<{
  close: []
  dirty: [value: boolean]
  'save-draft': [payload: { content:string;note:string;usesElectronicDevice:boolean }]
  submit: [payload: { content:string;note:string;usesElectronicDevice:boolean;reason:string }]
}>()
const dialog = ref<HTMLDialogElement|null>(null)
const content = ref(''), note = ref(''), reason = ref(''), device = ref(false), touched = ref(false)
const days=['Thứ 2','Thứ 3','Thứ 4','Thứ 5','Thứ 6']
const editable = computed(() => props.mode==='emergency' ? props.eligibility.emergencyAllowed : props.eligibility.regularNewAllowed || props.eligibility.editable)
const contentInvalid = computed(() => touched.value && !content.value.trim())
const reasonInvalid = computed(() => props.mode==='emergency' && touched.value && reason.value.trim().length<5)
const canSaveDraft = computed(() => props.mode==='regular' && editable.value && props.registration?.status!=='needs_revision')
const dirty = computed(() => content.value!==(props.registration?.content??'')||note.value!==(props.registration?.note??'')||device.value!==(props.registration?.usesElectronicDevice===true)||reason.value!=='')
watch(dirty,value=>emit('dirty',value),{immediate:true})
watch(()=>props.open,async open=>{if(open){content.value=props.registration?.content??'';note.value=props.registration?.note??'';device.value=props.registration?.usesElectronicDevice===true;reason.value='';touched.value=false;await nextTick();dialog.value?.showModal?.()}else if(dialog.value?.open)dialog.value.close()},{immediate:true})
function payload(){touched.value=true;if(contentInvalid.value||reasonInvalid.value)return null;return{content:content.value.trim(),note:note.value.trim(),usesElectronicDevice:device.value,reason:reason.value.trim()}}
function submit(){const value=payload();if(value)emit('submit',value)}
function saveDraft(){const value=payload();if(value)emit('save-draft',value)}
</script>

<template>
  <dialog ref="dialog" :open="open" class="registration-dialog" @close="emit('close')" @cancel.prevent="emit('close')">
    <form method="dialog" class="dialog-shell" @submit.prevent="submit">
      <header><div><span>{{ mode==='emergency'?'Đăng ký bổ sung':'Đăng ký tự học' }}</span><h2>{{ days[dow] }} · Tiết {{ period.n }}</h2><p>Tuần {{ week.number }} · {{ period.start }}–{{ period.end }}</p></div><button type="button" class="close-button" aria-label="Đóng" @click="emit('close')">×</button></header>
      <InlineStatus v-if="error" state="error" :message="error" />
      <p v-if="registration?.teacherComment" class="teacher-guidance"><b>Phản hồi giáo viên:</b> {{ registration.teacherComment }}</p>
      <label class="field"><span>Nội dung tự học *</span><input v-model="content" maxlength="180" :disabled="!editable||saving" :aria-invalid="contentInvalid" aria-describedby="registration-content-help" placeholder="Ôn tập phương trình bậc hai" /><small id="registration-content-help" :class="{error:contentInvalid}">{{ contentInvalid?'Bạn cần nhập nội dung tự học.':'Ghi rõ môn, bài hoặc nhiệm vụ.' }}</small></label>
      <label class="field"><span>Ghi chú / mục tiêu</span><textarea v-model="note" maxlength="500" :disabled="!editable||saving" placeholder="Nêu bài, trang hoặc mục tiêu cụ thể"></textarea><small>Không bắt buộc.</small></label>
      <label class="device-choice"><input v-model="device" type="checkbox" :disabled="!editable||saving" /><span>Sử dụng thiết bị điện tử</span></label>
      <label v-if="mode==='emergency'" class="field"><span>Lý do đăng ký bổ sung *</span><textarea v-model="reason" maxlength="300" :disabled="saving" :aria-invalid="reasonInvalid" aria-describedby="emergency-reason-help"></textarea><small id="emergency-reason-help" :class="{error:reasonInvalid}">{{ reasonInvalid?'Hãy ghi lý do cần đăng ký bổ sung.':'Lý do này sẽ được gửi cho giáo viên.' }}</small></label>
      <p v-if="!editable" class="read-only">Đăng ký này hiện chỉ được xem.</p>
      <footer v-if="editable"><AppButton v-if="canSaveDraft" type="button" variant="secondary" :disabled="saving" @click="saveDraft">Lưu nháp</AppButton><AppButton type="submit" :loading="saving">{{ mode==='emergency'?'Gửi đăng ký bổ sung':registration?.status==='needs_revision'?'Gửi lại để duyệt':registration?.status==='approved'?'Lưu và gửi duyệt lại':'Gửi đăng ký' }}</AppButton></footer>
    </form>
  </dialog>
</template>

<style scoped>
.registration-dialog{position:fixed;inset:0;width:min(680px,calc(100% - 24px));max-height:min(88dvh,760px);margin:auto;padding:0;border:1px solid var(--border);border-radius:20px;background:var(--surface-raised);color:var(--text);box-shadow:var(--shadow-md)}.registration-dialog::backdrop{background:var(--overlay)}.dialog-shell{display:grid;gap:16px;padding:24px;overflow:auto}header{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}header span{color:var(--color-primary);font-size:.82rem;font-weight:850}header h2{margin:4px 0}header p{margin:0;color:var(--text-muted)}.close-button{width:44px;height:44px;border:1px solid var(--border);border-radius:12px;background:var(--surface);color:var(--text);font-size:1.5rem}.field{display:grid;gap:4px}.field>span{font-weight:850}.field input,.field textarea{width:100%;min-height:44px;border:1px solid var(--border);border-radius:10px;padding:12px;background:var(--input);color:var(--text)}.field textarea{min-height:96px;resize:vertical}.field small{min-height:1lh;color:var(--text-muted)}.field small.error{color:var(--color-danger);font-weight:800}.field [aria-invalid="true"]{border-color:var(--color-danger)}.field input:disabled,.field textarea:disabled{opacity:.55;cursor:not-allowed}.device-choice{display:flex;align-items:center;gap:8px;min-height:44px;padding:12px;border-radius:12px;background:var(--surface-soft);font-weight:800}.device-choice input{width:20px;height:20px;accent-color:var(--color-primary)}.teacher-guidance,.read-only{margin:0;padding:12px;border-radius:12px;background:var(--surface-soft);color:var(--text-muted)}footer{display:flex;justify-content:flex-end;gap:8px}@media(max-width:520px){.dialog-shell{padding:16px}footer{display:grid;grid-template-columns:1fr}footer :deep(button){width:100%}}
</style>
