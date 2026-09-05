<script setup lang="ts">
import { computed, ref } from 'vue'
import { NotebookPen, RefreshCw } from 'lucide-vue-next'
import AppCard from '../components/ui/AppCard.vue'
import InlineStatus, { type InlineStatusState } from '../components/ui/InlineStatus.vue'
import StudySessionCard from '../components/registrations/StudySessionCard.vue'
import RegistrationDialog from '../components/registrations/RegistrationDialog.vue'
import { useAuthStore } from '../stores/auth'
import { useContextStore } from '../stores/context'
import { useWeekData } from '../features/weeks/queries'
import { getWeekLifecycle } from '../features/weeks/week-lifecycle'
import { deriveRegistrationEligibility, type RegistrationEligibility } from '../features/registrations/registration-model'
import { cancelEmergencyRegistration, createEmergencyRegistrationWithAi, saveRegistrationMutation, submitRegistrationWithAi, type RegistrationMutationRuntime } from '../features/registrations/registration-mutations'
import { useLegacyMutationRuntime } from '../features/shared/useLegacyMutationRuntime'
import { useDirtyEditor } from '../features/shared/dirty-registry'
import { useNowTicker } from '../features/shared/useNowTicker'
import type { PeriodRecord, RegistrationRecord, ScheduleSlot } from '../types/legacy'
import { appDialog } from '../features/shared/app-dialog'

const auth=useAuthStore(),context=useContextStore(),createRuntime=useLegacyMutationRuntime(),dirtyEditor=useDirtyEditor('registration-dialog'),nowMs=useNowTicker(30_000)
const classId=computed(()=>context.selectedClassId),weekId=computed(()=>context.selectedWeekId),week=computed(()=>context.selectedWeek)
const weekQuery=useWeekData(classId,weekId)
const studentRole=computed(()=>['student','monitor'].includes(auth.currentUser?.role??''))
const slots=computed<ScheduleSlot[]>(()=>{const rows=weekQuery.data.value?.overrides??[];return rows.length?rows.filter(row=>row.active!==false).map(row=>({dow:row.dow,period:row.period})):auth.legacyState?.schedule??[]})
const registrations=computed(()=>weekQuery.data.value?.registrations??auth.legacyState?.registrations.filter(row=>row.weekId===weekId.value)??[])
const lifecycleStatus=computed(()=>{const state=auth.legacyState;if(!state||!weekId.value)return'upcoming';return getWeekLifecycle({weeks:state.weeks,periods:state.periods,getSlots:id=>id===weekId.value?slots.value:state.schedule}).statuses[weekId.value]??'upcoming'})
const deadlineTime=computed(()=>String(auth.legacyState?.settings.registrationDeadlineTime||'20:00'))
const dialogOpen=ref(false),dialogMode=ref<'regular'|'emergency'>('regular'),selected=ref<{slot:ScheduleSlot;period:PeriodRecord}|null>(null)
const saving=ref(false),error=ref(''),status=ref<InlineStatusState>('idle'),statusMessage=ref('')
function registrationFor(slot:ScheduleSlot){return registrations.value.find(row=>row.studentId===auth.currentUser?.id&&row.weekId===weekId.value&&row.dow===slot.dow&&row.period===slot.period)??null}
function periodFor(slot:ScheduleSlot){return auth.legacyState?.periods.find(item=>Number(item.n)===Number(slot.period))??null}
function eligibilityFor(slot:ScheduleSlot,registration:RegistrationRecord|null){const currentWeek=week.value,period=periodFor(slot);if(!currentWeek||!period)return null;const result=deriveRegistrationEligibility({week:currentWeek,dow:slot.dow,period:slot.period,periods:auth.legacyState?.periods??[],deadlineTime:deadlineTime.value,registration,effectiveWeekStatus:lifecycleStatus.value,nowMs:nowMs.value});return studentRole.value?result:{...result,regularNewAllowed:false,editable:false,emergencyAllowed:false}}
const selectedRegistration=computed(()=>selected.value?registrationFor(selected.value.slot):null)
const selectedEligibility=computed<RegistrationEligibility|null>(()=>selected.value?eligibilityFor(selected.value.slot,selectedRegistration.value):null)
function open(slot:ScheduleSlot,mode:'regular'|'emergency'){const period=periodFor(slot),eligibility=eligibilityFor(slot,registrationFor(slot));if(!period||!eligibility)return;selected.value={slot,period};dialogMode.value=mode;error.value='';dialogOpen.value=true}
function close(){dialogOpen.value=false;selected.value=null;dirtyEditor.markClean()}
function runtime(){return createRuntime() as RegistrationMutationRuntime}
function messageOf(value:unknown){return value instanceof Error?value.message:'Không hoàn tất được đăng ký.'}
async function saveDraft(payload:{content:string;note:string;usesElectronicDevice:boolean}){if(!selected.value||!classId.value||!weekId.value)return;saving.value=true;error.value='';try{await saveRegistrationMutation(runtime(),{classId:classId.value,weekId:weekId.value,dow:selected.value.slot.dow,period:selected.value.slot.period,...payload,status:'draft'});close();status.value='success';statusMessage.value='Đã lưu bản nháp.'}catch(value){error.value=messageOf(value)}finally{saving.value=false}}
async function submit(payload:{content:string;note:string;usesElectronicDevice:boolean;reason:string}){if(!selected.value||!classId.value||!weekId.value)return;saving.value=true;error.value='';try{const base={classId:classId.value,weekId:weekId.value,dow:selected.value.slot.dow,period:selected.value.slot.period,content:payload.content,note:payload.note,usesElectronicDevice:payload.usesElectronicDevice};const result=dialogMode.value==='emergency'?await createEmergencyRegistrationWithAi(runtime(),{...base,reason:payload.reason}):await submitRegistrationWithAi(runtime(),base);close();status.value=result.aiError?'error':'success';statusMessage.value=result.aiError?'Đã lưu; AI chưa phản hồi nên giáo viên sẽ duyệt.':result.registration.status==='approved'&&result.registration.approvalSource==='ai'?'AI đã duyệt đăng ký.':'Đã gửi đăng ký.'}catch(value){error.value=messageOf(value)}finally{saving.value=false}}
async function cancelEmergency(id:string){if(!classId.value)return;if(!await appDialog.confirm({title:'Hủy đăng ký bổ sung',body:'Hủy đăng ký bổ sung này?',confirmLabel:'Hủy đăng ký',danger:true}))return;try{await cancelEmergencyRegistration(runtime(),classId.value,id);status.value='success';statusMessage.value='Đã hủy đăng ký bổ sung.'}catch(value){status.value='error';statusMessage.value=messageOf(value)}}
</script>

<template>
  <div class="page-stack registration-page">
    <header class="registration-header"><div><span class="page-context"><NotebookPen /> Kế hoạch cá nhân</span><h1>Đăng ký tự học</h1><p>Tuần {{ week?.number??'–' }} · hoàn thiện nội dung trước từng deadline.</p></div><span v-if="weekQuery.isFetching.value" class="syncing"><RefreshCw />Đang đồng bộ</span></header>
    <InlineStatus :state="status" :message="statusMessage" />
    <AppCard v-if="!studentRole" padding="lg"><h2>Chế độ xem dành cho giáo viên</h2><p class="muted">Giáo viên có thể xem lịch nhưng không tạo đăng ký thay học sinh tại trang này.</p></AppCard>
    <section v-if="slots.length" class="session-grid">
      <StudySessionCard v-for="slot in slots" :key="`${slot.dow}-${slot.period}`" :week="week!" :period="periodFor(slot)!" :dow="slot.dow" :registration="registrationFor(slot)" :eligibility="eligibilityFor(slot,registrationFor(slot))!" @open="open(slot,$event)" @cancel-emergency="cancelEmergency" />
    </section>
    <AppCard v-else padding="lg" class="empty-registration"><h2>Tuần này chưa có tiết tự học</h2><p>Giáo viên cần cấu hình thời khóa biểu trước khi học sinh đăng ký.</p></AppCard>
    <RegistrationDialog v-if="selected&&selectedEligibility&&week" :open="dialogOpen" :mode="dialogMode" :week="week" :period="selected.period" :dow="selected.slot.dow" :registration="selectedRegistration" :eligibility="selectedEligibility" :saving="saving" :error="error" @close="close" @dirty="dirtyEditor.setDirty" @save-draft="saveDraft" @submit="submit" />
  </div>
</template>

<style scoped>
.registration-page{max-width:1500px;margin:0 auto}.registration-header{display:flex;align-items:flex-start;justify-content:space-between;gap:20px;background:linear-gradient(135deg,var(--wash-mint),color-mix(in srgb,var(--wash-sun) 66%,var(--surface)))}.registration-header h1{margin:8px 0;font-size:clamp(2rem,4vw,3rem)}.registration-header p{margin:0;color:var(--text-muted)}.page-context,.syncing{display:flex;align-items:center;gap:8px;color:var(--color-mint);font-size:.86rem;font-weight:850}.page-context svg,.syncing svg{width:18px}.syncing{padding:7px 10px;border-radius:999px;background:var(--wash-sky);color:var(--color-info)}.session-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.empty-registration{text-align:center;background:linear-gradient(145deg,var(--surface),var(--wash-sky))}.empty-registration h2{margin-top:0}.empty-registration p{margin-bottom:0;color:var(--text-muted)}@media(max-width:820px){.session-grid{grid-template-columns:1fr}.registration-header{flex-direction:column}}
</style>
