<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Bot, CheckCheck, RefreshCw, ShieldCheck, TriangleAlert } from 'lucide-vue-next'
import AppButton from '../components/ui/AppButton.vue'
import AppCard from '../components/ui/AppCard.vue'
import InlineStatus, { type InlineStatusState } from '../components/ui/InlineStatus.vue'
import ApprovalFilters from '../components/approvals/ApprovalFilters.vue'
import ApprovalList from '../components/approvals/ApprovalList.vue'
import ApprovalDetail from '../components/approvals/ApprovalDetail.vue'
import { buildApprovalModel, filterApprovals } from '../features/approvals/approval-model'
import { approveRegistrationsMutation, deleteManagedRegistration, rejectOverdueRegistration, requestManagedRevision, saveTeacherCommentMutation, type ApprovalMutationRuntime } from '../features/approvals/approval-mutations'
import { registrationManagerActions, type ApprovalFilter } from '../features/registrations/registration-model'
import { useLegacyMutationRuntime } from '../features/shared/useLegacyMutationRuntime'
import { useDirtyEditor } from '../features/shared/dirty-registry'
import { useWeekData } from '../features/weeks/queries'
import { useAuthStore } from '../stores/auth'
import { useContextStore } from '../stores/context'
import type { RegistrationRecord } from '../types/legacy'

const auth=useAuthStore(),context=useContextStore(),createRuntime=useLegacyMutationRuntime(),dirtyEditor=useDirtyEditor('approval-detail')
const classId=computed(()=>context.selectedClassId),weekId=computed(()=>context.selectedWeekId),week=computed(()=>context.selectedWeek)
const weekQuery=useWeekData(classId,weekId)
const registrations=computed(()=>weekQuery.data.value?.registrations??auth.legacyState?.registrations.filter(row=>row.weekId===weekId.value)??[])
const users=computed(()=>auth.legacyState?.users??[])
const filter=ref<ApprovalFilter>('attention'),selectedId=ref<string|null>(null),saving=ref(false),error=ref(''),status=ref<InlineStatusState>('idle'),statusMessage=ref('')
const nowMs=ref(Date.now())
const options=computed(()=>({week:week.value!,periods:auth.legacyState?.periods??[],nowMs:nowMs.value}))
const model=computed(()=>week.value?buildApprovalModel(registrations.value,options.value):{counts:{attention:0,approved:0,revision:0,all:0},aiWaiting:0,emergency:0})
const filtered=computed(()=>week.value?filterApprovals(registrations.value,filter.value,options.value):[])
watch(filtered,(rows)=>{if(!rows.some(row=>row.id===selectedId.value))selectedId.value=rows[0]?.id??null},{immediate:true})
const selected=computed<RegistrationRecord|null>(()=>registrations.value.find(row=>row.id===selectedId.value)??null)
const selectedUser=computed(()=>selected.value?users.value.find(user=>user.id===selected.value!.studentId)??null:null)
const selectedActions=computed(()=>selected.value&&week.value?registrationManagerActions({registration:selected.value,week:week.value,periods:auth.legacyState?.periods??[],nowMs:Date.now()}):{canApprove:false,canRequestRevision:false,canRejectOverdue:false,canComment:false,canDelete:false,started:false,reported:false})
const eligibleVisibleIds=computed(()=>filtered.value.filter(row=>week.value&&registrationManagerActions({registration:row,week:week.value,periods:auth.legacyState?.periods??[],nowMs:Date.now()}).canApprove).map(row=>row.id))
function runtime(){return createRuntime() as ApprovalMutationRuntime}
function messageOf(value:unknown){return value instanceof Error?value.message:'Không hoàn tất được thao tác duyệt.'}
function succeed(message:string){status.value='success';statusMessage.value=message;error.value='';dirtyEditor.markClean()}
async function run(task:()=>Promise<unknown>,message:string){if(!classId.value)return;saving.value=true;error.value='';try{await task();succeed(message)}catch(value){error.value=messageOf(value);status.value='error';statusMessage.value=error.value}finally{saving.value=false}}
async function approveSelected(){if(!selected.value||!classId.value)return;await run(()=>approveRegistrationsMutation(runtime(),classId.value!,[selected.value!.id]),'Đã duyệt đăng ký.')}
async function approveVisible(){if(!classId.value||!eligibleVisibleIds.value.length)return;await run(()=>approveRegistrationsMutation(runtime(),classId.value!,eligibleVisibleIds.value),'Đã duyệt các đăng ký đủ điều kiện.')}
async function saveComment(value:string){if(!selected.value||!classId.value)return;await run(()=>saveTeacherCommentMutation(runtime(),classId.value!,selected.value!.id,value),'Đã lưu nhận xét giáo viên.')}
async function requestRevision(value:string){if(!selected.value||!classId.value)return;await run(()=>requestManagedRevision(runtime(),classId.value!,selected.value!.id,value),'Đã yêu cầu học sinh chỉnh sửa.')}
async function markAiWrong(value:string){if(!selected.value||!classId.value)return;await run(()=>requestManagedRevision(runtime(),classId.value!,selected.value!.id,value),'Đã ghi nhận AI chưa đúng và chuyển yêu cầu sửa.')}
async function rejectOverdue(value:string){if(!selected.value||!classId.value)return;await run(()=>rejectOverdueRegistration(runtime(),classId.value!,selected.value!.id,value),'Đã từ chối đăng ký quá hạn xử lý.')}
async function remove(){if(!selected.value||!classId.value)return;if(!window.confirm('Xóa đăng ký này? Hành động dùng cơ chế xóa an toàn hiện có.'))return;const id=selected.value.id;await run(()=>deleteManagedRegistration(runtime(),classId.value!,id),'Đã xóa đăng ký.');selectedId.value=null}
</script>

<template>
  <div class="page-stack approval-page">
    <header class="approval-header">
      <div><span class="page-context"><ShieldCheck aria-hidden="true" />Duyệt đăng ký</span><h1>Hàng chờ giáo viên</h1><p>Tuần {{ week?.number ?? '–' }} · chọn học sinh để xem và xử lý chi tiết.</p></div>
      <span v-if="weekQuery.isFetching.value" class="syncing"><RefreshCw aria-hidden="true" />Đang đồng bộ</span>
    </header>

    <InlineStatus :state="status" :message="statusMessage" />
    <InlineStatus v-if="dirtyEditor.state.serverChanged" state="server-changed" message="Dữ liệu đăng ký vừa thay đổi trên máy chủ. Nhận xét đang nhập được giữ nguyên; lưu sẽ áp dụng trên dữ liệu mới nhất." />

    <section class="approval-summary" aria-label="Tóm tắt hàng chờ">
      <AppCard padding="sm"><span><TriangleAlert aria-hidden="true" />Cần xử lý</span><strong>{{ model.counts.attention }}</strong></AppCard>
      <AppCard padding="sm"><span><Bot aria-hidden="true" />AI đang chờ</span><strong>{{ model.aiWaiting }}</strong></AppCard>
      <AppCard padding="sm"><span><RefreshCw aria-hidden="true" />Đăng ký bổ sung</span><strong>{{ model.emergency }}</strong></AppCard>
    </section>

    <AppCard padding="md" class="filter-card">
      <div class="filter-top"><ApprovalFilters v-model="filter" :counts="model.counts" /><AppButton v-if="eligibleVisibleIds.length" variant="success" :loading="saving" @click="approveVisible"><CheckCheck aria-hidden="true" />Duyệt {{ eligibleVisibleIds.length }} mục</AppButton></div>
    </AppCard>

    <section class="approval-workspace">
      <AppCard padding="sm" class="list-pane"><ApprovalList :registrations="filtered" :users="users" :selected-id="selectedId" @select="selectedId=$event" /></AppCard>
      <AppCard padding="lg" class="detail-pane">
        <ApprovalDetail v-if="selected" :registration="selected" :user="selectedUser" :actions="selectedActions" :saving="saving" :error="error" @approve="approveSelected" @comment="saveComment" @revision="requestRevision" @ai-wrong="markAiWrong" @reject-overdue="rejectOverdue" @delete="remove" @dirty="dirtyEditor.setDirty" />
        <div v-else class="empty-detail"><ShieldCheck aria-hidden="true" /><h2>Chọn một đăng ký</h2><p>Thông tin AI, nội dung và thao tác duyệt sẽ xuất hiện tại đây.</p></div>
      </AppCard>
    </section>
  </div>
</template>

<style scoped>
.approval-page{max-width:1560px;margin:0 auto}.approval-header{display:flex;align-items:flex-start;justify-content:space-between;gap:20px}.approval-header h1{margin:8px 0;font-size:clamp(2rem,4vw,3rem)}.approval-header p{margin:0;color:var(--text-muted)}.page-context,.syncing{display:flex;align-items:center;gap:8px;color:var(--color-primary);font-size:.86rem;font-weight:900}.page-context svg,.syncing svg{width:18px}.approval-summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.approval-summary :deep(.app-card){display:flex;align-items:center;justify-content:space-between;gap:12px}.approval-summary span{display:flex;align-items:center;gap:7px;color:var(--text-muted);font-size:.82rem;font-weight:800}.approval-summary svg{width:17px}.approval-summary strong{font-size:1.55rem}.filter-top{display:flex;align-items:center;justify-content:space-between;gap:12px}.filter-top :deep(svg){width:17px}.approval-workspace{display:grid;grid-template-columns:minmax(300px,.78fr) minmax(0,1.5fr);gap:16px;align-items:start}.list-pane{max-height:68vh;overflow:auto;position:sticky;top:84px}.detail-pane{min-width:0}.empty-detail{min-height:320px;display:grid;place-items:center;align-content:center;text-align:center;color:var(--text-muted)}.empty-detail svg{width:40px;color:var(--color-primary)}.empty-detail h2{margin:12px 0 4px;color:var(--text)}.empty-detail p{margin:0;max-width:420px}
@media(max-width:960px){.approval-workspace{grid-template-columns:1fr}.list-pane{position:static;max-height:none}.approval-summary{grid-template-columns:repeat(3,minmax(0,1fr))}}@media(max-width:680px){.approval-header,.filter-top{flex-direction:column;align-items:stretch}.approval-summary{grid-template-columns:1fr}.filter-top :deep(.app-button){width:100%}}
</style>
