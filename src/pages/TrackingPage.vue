<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { BrainCircuit, RefreshCw, UsersRound } from 'lucide-vue-next'
import AppButton from '../components/ui/AppButton.vue'
import AppCard from '../components/ui/AppCard.vue'
import InlineStatus, { type InlineStatusState } from '../components/ui/InlineStatus.vue'
import SessionSummaryCard from '../components/tracking/SessionSummaryCard.vue'
import TrackingFilters from '../components/tracking/TrackingFilters.vue'
import StudentTrackingRow from '../components/tracking/StudentTrackingRow.vue'
import { filterTrackingRows, summarizeTrackingSession, trackingFilterCounts, type TrackingFilter, type TrackingSort } from '../features/tracking/tracking-model'
import { aiOutcomeMismatch, aiReviewHistoryLabel, needsTeacherAction, registrationManagerActions } from '../features/registrations/registration-model'
import { approveRegistrationsMutation, deleteManagedRegistration, markHandledRegistrationNotificationsRead, requestManagedRevision, saveTeacherCommentMutation, type ApprovalMutationRuntime } from '../features/approvals/approval-mutations'
import { useLegacyMutationRuntime } from '../features/shared/useLegacyMutationRuntime'
import { useWeekData } from '../features/weeks/queries'
import { legacyApi } from '../services/legacy-supabase'
import { useAuthStore } from '../stores/auth'
import { useContextStore } from '../stores/context'
import type { RegistrationRecord, ScheduleSlot } from '../types/legacy'

const auth=useAuthStore(),context=useContextStore(),createRuntime=useLegacyMutationRuntime()
const classId=computed(()=>context.selectedClassId),weekId=computed(()=>context.selectedWeekId),week=computed(()=>context.selectedWeek)
const weekQuery=useWeekData(classId,weekId)
const slots=computed<ScheduleSlot[]>(()=>{const overrides=weekQuery.data.value?.overrides??[];return overrides.length?overrides.filter(row=>row.active!==false).map(row=>({dow:row.dow,period:row.period})):auth.legacyState?.schedule??[]})
const registrations=computed(()=>weekQuery.data.value?.registrations??auth.legacyState?.registrations.filter(row=>row.weekId===weekId.value)??[])
const users=computed(()=>auth.legacyState?.users??[])
const summaries=computed(()=>slots.value.map(session=>summarizeTrackingSession({users:users.value,registrations:registrations.value,session})))
const selectedKey=ref(''),filter=ref<TrackingFilter>('all'),query=ref(''),sort=ref<TrackingSort>('name'),busyId=ref<string|null>(null),status=ref<InlineStatusState>('idle'),statusMessage=ref('')
const aiBusy=ref(false),aiProgress=ref('')
watch(summaries,(items)=>{if(!items.some(item=>key(item.session)===selectedKey.value))selectedKey.value=items[0]?key(items[0].session):''},{immediate:true})
watch([classId,weekId],()=>{filter.value='all';query.value='';selectedKey.value='';aiProgress.value=''})
const selectedSummary=computed(()=>summaries.value.find(item=>key(item.session)===selectedKey.value)??null)
const counts=computed(()=>trackingFilterCounts(selectedSummary.value?.rows??[]))
const visibleRows=computed(()=>filterTrackingRows(selectedSummary.value?.rows??[],filter.value,query.value,sort.value))
const manager=computed(()=>['teacher','admin'].includes(auth.currentUser?.role??''))
const aiEnabled=computed(()=>Boolean(auth.legacyState?.settings?.aiAutomationEnabled??auth.legacyState?.settings?.smartApprovalEnabled??auth.legacyState?.settings?.aiReviewEnabled??true))
const dayName=(dow:number)=>['Thứ 2','Thứ 3','Thứ 4','Thứ 5','Thứ 6','Thứ 7','Chủ nhật'][Number(dow)]??`Ngày ${Number(dow)+1}`
const label=(slot:ScheduleSlot)=>`${dayName(slot.dow)} · Tiết ${slot.period}`
function key(slot:ScheduleSlot){return `${slot.dow}-${slot.period}`}
function runtime(){return createRuntime() as ApprovalMutationRuntime}
function actionsFor(row:(typeof visibleRows.value)[number]){if(!manager.value||!row.registration||!week.value)return null;return registrationManagerActions({registration:row.registration,week:week.value,periods:auth.legacyState?.periods??[],nowMs:Date.now()})}
function aiCandidate(registration:RegistrationRecord|undefined|null){if(!registration||registration.isDeleted===true||registration.revisionOverdueAt)return false;const ai=String(registration.aiReviewStatus??'').toLowerCase();return registration.status==='approved'||(registration.status==='submitted'&&!['pending','processing'].includes(ai))}
const sessionAiCandidates=computed(()=>selectedSummary.value?.rows.map(row=>row.registration).filter((row):row is RegistrationRecord=>Boolean(row)&&aiCandidate(row))??[])
function canAiRereview(row:(typeof visibleRows.value)[number]){return manager.value&&aiEnabled.value&&aiCandidate(row.registration)}
async function run(id:string,task:()=>Promise<unknown>,message:string){if(!classId.value)return;busyId.value=id;try{await task();status.value='success';statusMessage.value=message}catch(error){status.value='error';statusMessage.value=error instanceof Error?error.message:'Không hoàn tất được thao tác.'}finally{busyId.value=null}}
async function approve(id:string){await run(id,()=>approveRegistrationsMutation(runtime(),classId.value!,[id]),'Đã duyệt đăng ký.')}
async function revise(id:string){const comment=window.prompt('Nhập hướng dẫn cần chỉnh sửa:')?.trim();if(!comment)return;await run(id,()=>requestManagedRevision(runtime(),classId.value!,id,comment),'Đã yêu cầu chỉnh sửa.')}
async function comment(id:string){const row=registrations.value.find(item=>item.id===id);const value=window.prompt('Nhận xét giáo viên:',String(row?.teacherComment??''))?.trim();if(!value)return;await run(id,()=>saveTeacherCommentMutation(runtime(),classId.value!,id,value),'Đã lưu nhận xét.')}
async function remove(id:string){if(!window.confirm('Xóa đăng ký này?'))return;await run(id,()=>deleteManagedRegistration(runtime(),classId.value!,id),'Đã xóa đăng ký.')}
async function refreshAfterAi(){if(!classId.value)return;await auth.reload(classId.value,context.selectedSchoolYearId);context.hydrate(auth.legacyState);await weekQuery.refetch()}
function refreshedRegistration(id:string){return registrations.value.find(item=>item.id===id)??auth.legacyState?.registrations.find(item=>item.id===id)??null}
function aiOutcomeMessage(row:RegistrationRecord|null){if(!row)return{state:'server-changed' as InlineStatusState,message:'AI đã phản hồi nhưng chưa đọc được trạng thái đăng ký mới.'};if(aiOutcomeMismatch(row))return{state:'error' as InlineStatusState,message:`${aiReviewHistoryLabel(row)}. Kết quả AI chưa được backend áp dụng vào trạng thái đăng ký; đăng ký được giữ trong hàng GV để không bỏ sót.`};if(row.status==='approved'&&row.approvalSource==='ai')return{state:'success' as InlineStatusState,message:'AI đã duyệt đăng ký.'};if(row.status==='needs_revision')return{state:'server-changed' as InlineStatusState,message:'AI yêu cầu học sinh chỉnh sửa đăng ký.'};if(needsTeacherAction(row))return{state:'server-changed' as InlineStatusState,message:'AI đã chuyển đăng ký cho giáo viên xử lý.'};return{state:'success' as InlineStatusState,message:'AI đã xử lý đăng ký.'}}
async function markOldNotificationRead(ids:string[]){if(!ids.length)return;await markHandledRegistrationNotificationsRead(runtime(),ids)}
async function rerunRegistrationAi(id:string){
  if(!aiEnabled.value||!classId.value)return
  if(!window.confirm('Gọi AI duyệt lại đăng ký này? Trạng thái hiện tại có thể chuyển về chờ AI xử lý.'))return
  busyId.value=id;status.value='saving';statusMessage.value='Đang chuẩn bị AI duyệt lại...'
  try{
    await markOldNotificationRead([id])
    await legacyApi.prepareRegistrationAiRereview(id)
    await legacyApi.requestAiReview(id)
    await refreshAfterAi()
    const outcome=aiOutcomeMessage(refreshedRegistration(id))
    status.value=outcome.state
    statusMessage.value=outcome.message
  }catch(error){status.value='error';statusMessage.value=error instanceof Error?error.message:'Không gọi được AI duyệt lại.';try{await refreshAfterAi()}catch{}}
  finally{busyId.value=null}
}
async function rerunSessionAi(){
  if(!selectedSummary.value||!classId.value||!weekId.value||!aiEnabled.value||aiBusy.value)return
  const candidates=sessionAiCandidates.value
  if(!candidates.length){status.value='error';statusMessage.value='Buổi này không có đăng ký phù hợp để AI duyệt lại.';return}
  const approvedCount=candidates.filter(row=>row.status==='approved').length
  if(!window.confirm(`Gọi AI duyệt lại ${candidates.length} đăng ký của ${label(selectedSummary.value.session)}?${approvedCount?`\n${approvedCount} đăng ký đã duyệt sẽ tạm chuyển về chờ AI.`:''}\nBản nháp, Cần chỉnh sửa và Báo cáo lỗi được giữ nguyên.`))return
  aiBusy.value=true;aiProgress.value='Đang chuẩn bị hàng đợi AI...';status.value='idle';statusMessage.value=''
  let success=0,manualFallback=0,skipped=0,failed=0,ids:string[]=[]
  try{
    ids=await legacyApi.prepareSessionAiRereview({classId:classId.value,weekId:weekId.value,dow:selectedSummary.value.session.dow,period:selectedSummary.value.session.period})
    if(!ids.length){aiProgress.value='Không có đăng ký nào được đưa vào hàng đợi AI.';return}
    await markOldNotificationRead(ids)
    for(let i=0;i<ids.length;i++){
      aiProgress.value=`AI đang xử lý ${i+1}/${ids.length} đăng ký...`
      try{
        await legacyApi.prepareRegistrationAiRereview(ids[i])
        const result=await legacyApi.requestAiReview(ids[i]) as Record<string,unknown>|undefined
        if(result?.fallbackToManual)manualFallback++
        else if(result?.skipped)skipped++
        else success++
      }catch(error){failed++;console.error('Session AI re-review',ids[i],error)}
      if(i<ids.length-1)await new Promise(resolve=>setTimeout(resolve,350))
    }
    await refreshAfterAi()
    aiProgress.value=`Hoàn tất ${ids.length}: ${success} AI phản hồi${manualFallback?` · ${manualFallback} chuyển GV`:''}${skipped?` · ${skipped} bỏ qua`:''}${failed?` · ${failed} lỗi`:''}.`
    status.value=manualFallback+failed?'server-changed':'success';statusMessage.value=manualFallback+failed?'Một số đăng ký đã/chờ chuyển GV xử lý.':'AI đã duyệt lại buổi này.'
  }catch(error){aiProgress.value='Không khởi động được lượt AI duyệt lại.';status.value='error';statusMessage.value=error instanceof Error?error.message:'Không gọi được AI duyệt lại theo buổi.';try{await refreshAfterAi()}catch{}}
  finally{aiBusy.value=false}
}
</script>
<template>
  <div class="page-stack tracking-page">
    <header class="tracking-header"><div><span class="page-context"><UsersRound aria-hidden="true"/>Theo dõi lớp</span><h1>Theo dõi cả lớp</h1><p>Tuần {{ week?.number??'–' }} · chọn một buổi rồi lọc đúng nhóm học sinh cần xem.</p></div><span v-if="weekQuery.isFetching.value" class="syncing"><RefreshCw aria-hidden="true"/>Đang đồng bộ</span></header>
    <InlineStatus :state="status" :message="statusMessage"/>
    <div v-if="weekQuery.isLoading.value&&!summaries.length" class="tracking-skeleton" aria-label="Đang tải dữ liệu"><span v-for="n in 3" :key="n" class="skeleton-shimmer"></span></div>
    <section v-else-if="summaries.length" class="session-grid"><SessionSummaryCard v-for="item in summaries" :key="key(item.session)" :summary="item" :label="label(item.session)" :active="selectedKey===key(item.session)" @select="selectedKey=key(item.session)"/></section>
    <AppCard v-else padding="lg" class="empty"><h2>Tuần này chưa có tiết tự học</h2><p>Thời khóa biểu cần được cấu hình trước khi theo dõi lớp.</p></AppCard>
    <AppCard v-if="selectedSummary" padding="lg" class="session-detail">
      <header class="detail-head"><div><span class="page-context">CHI TIẾT BUỔI</span><h2>{{ label(selectedSummary.session) }}</h2><p>{{ selectedSummary.total }} học sinh · {{ selectedSummary.completion }}% đã có đăng ký.</p></div><div class="summary-numbers"><span><small>Sĩ số</small><b>{{ selectedSummary.total }}</b></span><span><small>Đã ĐK</small><b>{{ selectedSummary.registered }}</b></span><span><small>Chưa ĐK</small><b>{{ selectedSummary.missing }}</b></span><span><small>Cần xử lý</small><b>{{ selectedSummary.attention }}</b></span></div></header>
      <div v-if="manager" class="ai-rereview-bar"><div><span><BrainCircuit/>AI DUYỆT LẠI THEO BUỔI</span><b>{{ aiEnabled?`${sessionAiCandidates.length} đăng ký phù hợp`:'AI đang tắt trong Cài đặt' }}</b><small>Bỏ qua bản nháp, yêu cầu sửa, báo cáo lỗi và đăng ký AI đang chờ/đang xử lý.</small><small v-if="aiProgress" class="ai-progress">{{ aiProgress }}</small></div><AppButton variant="secondary" :loading="aiBusy" :disabled="!aiEnabled||!sessionAiCandidates.length" @click="rerunSessionAi"><BrainCircuit/>AI duyệt lại buổi này</AppButton></div>
      <TrackingFilters v-model="filter" v-model:query="query" v-model:sort="sort" :counts="counts"/>
      <div class="student-list"><StudentTrackingRow v-for="row in visibleRows" :key="row.user.id" :row="row" :actions="actionsFor(row)" :can-ai-rereview="canAiRereview(row)" :busy="busyId===row.registration?.id" @ai-rereview="row.registration&&rerunRegistrationAi(row.registration.id)" @approve="row.registration&&approve(row.registration.id)" @revision="row.registration&&revise(row.registration.id)" @comment="row.registration&&comment(row.registration.id)" @delete="row.registration&&remove(row.registration.id)"/><div v-if="!visibleRows.length" class="empty-list">Không có học sinh phù hợp bộ lọc.</div></div>
    </AppCard>
  </div>
</template>
<style scoped>
.tracking-page{max-width:1560px;margin:0 auto}.tracking-header{display:flex;align-items:flex-start;justify-content:space-between;gap:20px}.tracking-header h1{margin:8px 0;font-size:clamp(2rem,4vw,3rem)}.tracking-header p,.detail-head p,.empty p{margin:0;color:var(--text-muted)}.page-context,.syncing{display:flex;align-items:center;gap:8px;color:var(--color-primary);font-size:.78rem;font-weight:900;letter-spacing:.04em}.page-context svg,.syncing svg{width:18px}.session-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:13px}.tracking-skeleton{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:13px}.tracking-skeleton span{min-height:128px}.session-detail{display:grid;gap:18px}.detail-head{display:flex;justify-content:space-between;gap:18px}.detail-head h2{margin:5px 0}.summary-numbers{display:grid;grid-template-columns:repeat(4,minmax(72px,1fr));gap:7px}.summary-numbers span{display:grid;gap:2px;padding:8px 10px;border-radius:12px;background:var(--surface-soft);text-align:center}.summary-numbers small{font-size:.7rem;color:var(--text-muted)}.summary-numbers b{font-size:1.15rem}.ai-rereview-bar{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:14px 16px;border:1px solid color-mix(in srgb,var(--color-lilac) 32%,var(--border));border-radius:16px;background:linear-gradient(135deg,var(--wash-violet),color-mix(in srgb,var(--wash-sky) 55%,var(--surface)))}.ai-rereview-bar>div{display:grid;gap:3px}.ai-rereview-bar span{display:flex;align-items:center;gap:7px;color:var(--color-primary);font-size:.74rem;font-weight:900;letter-spacing:.05em}.ai-rereview-bar span svg{width:17px}.ai-rereview-bar small{color:var(--text-muted)}.ai-progress{margin-top:5px;color:var(--color-info)!important;font-weight:750}.student-list{display:grid;gap:10px}.empty-list,.empty{text-align:center;color:var(--text-muted);padding:28px}.empty h2{color:var(--text)}@media(max-width:1100px){.session-grid,.tracking-skeleton{grid-template-columns:repeat(2,minmax(0,1fr))}.detail-head{flex-direction:column}.summary-numbers{max-width:520px}}@media(max-width:760px){.ai-rereview-bar{align-items:stretch;flex-direction:column}.ai-rereview-bar :deep(.app-button){width:100%}}@media(max-width:700px){.tracking-header{flex-direction:column}.session-grid,.tracking-skeleton{grid-template-columns:1fr}.summary-numbers{grid-template-columns:repeat(2,1fr)}}
</style>
