<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RefreshCw, UsersRound } from 'lucide-vue-next'
import AppCard from '../components/ui/AppCard.vue'
import InlineStatus, { type InlineStatusState } from '../components/ui/InlineStatus.vue'
import SessionSummaryCard from '../components/tracking/SessionSummaryCard.vue'
import TrackingFilters from '../components/tracking/TrackingFilters.vue'
import StudentTrackingRow from '../components/tracking/StudentTrackingRow.vue'
import { filterTrackingRows, summarizeTrackingSession, trackingFilterCounts, type TrackingFilter, type TrackingSort } from '../features/tracking/tracking-model'
import { registrationManagerActions } from '../features/registrations/registration-model'
import { approveRegistrationsMutation, deleteManagedRegistration, requestManagedRevision, saveTeacherCommentMutation, type ApprovalMutationRuntime } from '../features/approvals/approval-mutations'
import { useLegacyMutationRuntime } from '../features/shared/useLegacyMutationRuntime'
import { useWeekData } from '../features/weeks/queries'
import { useAuthStore } from '../stores/auth'
import { useContextStore } from '../stores/context'
import type { ScheduleSlot } from '../types/legacy'

const auth=useAuthStore(),context=useContextStore(),createRuntime=useLegacyMutationRuntime()
const classId=computed(()=>context.selectedClassId),weekId=computed(()=>context.selectedWeekId),week=computed(()=>context.selectedWeek)
const weekQuery=useWeekData(classId,weekId)
const slots=computed<ScheduleSlot[]>(()=>{const overrides=weekQuery.data.value?.overrides??[];return overrides.length?overrides.filter(row=>row.active!==false).map(row=>({dow:row.dow,period:row.period})):auth.legacyState?.schedule??[]})
const registrations=computed(()=>weekQuery.data.value?.registrations??auth.legacyState?.registrations.filter(row=>row.weekId===weekId.value)??[])
const users=computed(()=>auth.legacyState?.users??[])
const summaries=computed(()=>slots.value.map(session=>summarizeTrackingSession({users:users.value,registrations:registrations.value,session})))
const selectedKey=ref(''),filter=ref<TrackingFilter>('all'),query=ref(''),sort=ref<TrackingSort>('name'),busyId=ref<string|null>(null),status=ref<InlineStatusState>('idle'),statusMessage=ref('')
watch(summaries,(items)=>{if(!items.some(item=>key(item.session)===selectedKey.value))selectedKey.value=items[0]?key(items[0].session):''},{immediate:true})
watch([classId,weekId],()=>{filter.value='all';query.value='';selectedKey.value=''})
const selectedSummary=computed(()=>summaries.value.find(item=>key(item.session)===selectedKey.value)??null)
const counts=computed(()=>trackingFilterCounts(selectedSummary.value?.rows??[]))
const visibleRows=computed(()=>filterTrackingRows(selectedSummary.value?.rows??[],filter.value,query.value,sort.value))
const manager=computed(()=>['teacher','admin'].includes(auth.currentUser?.role??''))
const dayName=(dow:number)=>['Thứ 2','Thứ 3','Thứ 4','Thứ 5','Thứ 6','Thứ 7','Chủ nhật'][Number(dow)]??`Ngày ${Number(dow)+1}`
const label=(slot:ScheduleSlot)=>`${dayName(slot.dow)} · Tiết ${slot.period}`
const key=(slot:ScheduleSlot)=>`${slot.dow}-${slot.period}`
function runtime(){return createRuntime() as ApprovalMutationRuntime}
function actionsFor(row:(typeof visibleRows.value)[number]){if(!manager.value||!row.registration||!week.value)return null;return registrationManagerActions({registration:row.registration,week:week.value,periods:auth.legacyState?.periods??[],nowMs:Date.now()})}
async function run(id:string,task:()=>Promise<unknown>,message:string){if(!classId.value)return;busyId.value=id;try{await task();status.value='success';statusMessage.value=message}catch(error){status.value='error';statusMessage.value=error instanceof Error?error.message:'Không hoàn tất được thao tác.'}finally{busyId.value=null}}
async function approve(id:string){await run(id,()=>approveRegistrationsMutation(runtime(),classId.value!,[id]),'Đã duyệt đăng ký.')}
async function revise(id:string){const comment=window.prompt('Nhập hướng dẫn cần chỉnh sửa:')?.trim();if(!comment)return;await run(id,()=>requestManagedRevision(runtime(),classId.value!,id,comment),'Đã yêu cầu chỉnh sửa.')}
async function comment(id:string){const row=registrations.value.find(item=>item.id===id);const value=window.prompt('Nhận xét giáo viên:',String(row?.teacherComment??''))?.trim();if(!value)return;await run(id,()=>saveTeacherCommentMutation(runtime(),classId.value!,id,value),'Đã lưu nhận xét.')}
async function remove(id:string){if(!window.confirm('Xóa đăng ký này?'))return;await run(id,()=>deleteManagedRegistration(runtime(),classId.value!,id),'Đã xóa đăng ký.')}
</script>
<template>
  <div class="page-stack tracking-page">
    <header class="tracking-header"><div><span class="page-context"><UsersRound aria-hidden="true"/>Theo dõi lớp</span><h1>Theo dõi cả lớp</h1><p>Tuần {{ week?.number??'–' }} · chọn một buổi rồi lọc đúng nhóm học sinh cần xem.</p></div><span v-if="weekQuery.isFetching.value" class="syncing"><RefreshCw aria-hidden="true"/>Đang đồng bộ</span></header>
    <InlineStatus :state="status" :message="statusMessage"/>
    <section v-if="summaries.length" class="session-grid"><SessionSummaryCard v-for="item in summaries" :key="key(item.session)" :summary="item" :label="label(item.session)" :active="selectedKey===key(item.session)" @select="selectedKey=key(item.session)"/></section>
    <AppCard v-else padding="lg" class="empty"><h2>Tuần này chưa có tiết tự học</h2><p>Thời khóa biểu cần được cấu hình trước khi theo dõi lớp.</p></AppCard>
    <AppCard v-if="selectedSummary" padding="lg" class="session-detail">
      <header class="detail-head"><div><span class="page-context">CHI TIẾT BUỔI</span><h2>{{ label(selectedSummary.session) }}</h2><p>{{ selectedSummary.total }} học sinh · {{ selectedSummary.completion }}% đã có đăng ký.</p></div><div class="summary-numbers"><span><small>Sĩ số</small><b>{{ selectedSummary.total }}</b></span><span><small>Đã ĐK</small><b>{{ selectedSummary.registered }}</b></span><span><small>Chưa ĐK</small><b>{{ selectedSummary.missing }}</b></span><span><small>Cần xử lý</small><b>{{ selectedSummary.attention }}</b></span></div></header>
      <TrackingFilters v-model="filter" v-model:query="query" v-model:sort="sort" :counts="counts"/>
      <div class="student-list"><StudentTrackingRow v-for="row in visibleRows" :key="row.user.id" :row="row" :actions="actionsFor(row)" :busy="busyId===row.registration?.id" @approve="row.registration&&approve(row.registration.id)" @revision="row.registration&&revise(row.registration.id)" @comment="row.registration&&comment(row.registration.id)" @delete="row.registration&&remove(row.registration.id)"/><div v-if="!visibleRows.length" class="empty-list">Không có học sinh phù hợp bộ lọc.</div></div>
    </AppCard>
  </div>
</template>
<style scoped>
.tracking-page{max-width:1560px;margin:0 auto}.tracking-header{display:flex;align-items:flex-start;justify-content:space-between;gap:20px}.tracking-header h1{margin:8px 0;font-size:clamp(2rem,4vw,3rem)}.tracking-header p,.detail-head p,.empty p{margin:0;color:var(--text-muted)}.page-context,.syncing{display:flex;align-items:center;gap:8px;color:var(--color-primary);font-size:.78rem;font-weight:900;letter-spacing:.04em}.page-context svg,.syncing svg{width:18px}.session-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:13px}.session-detail{display:grid;gap:18px}.detail-head{display:flex;justify-content:space-between;gap:18px}.detail-head h2{margin:5px 0}.summary-numbers{display:grid;grid-template-columns:repeat(4,minmax(72px,1fr));gap:7px}.summary-numbers span{display:grid;gap:2px;padding:8px 10px;border-radius:12px;background:var(--surface-soft);text-align:center}.summary-numbers small{font-size:.7rem;color:var(--text-muted)}.summary-numbers b{font-size:1.15rem}.student-list{display:grid;gap:10px}.empty-list,.empty{text-align:center;color:var(--text-muted);padding:28px}.empty h2{color:var(--text)}@media(max-width:1100px){.session-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.detail-head{flex-direction:column}.summary-numbers{max-width:520px}}@media(max-width:700px){.tracking-header{flex-direction:column}.session-grid{grid-template-columns:1fr}.summary-numbers{grid-template-columns:repeat(2,1fr)}}
</style>
