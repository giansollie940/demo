<script setup lang="ts">
import { AlertTriangle, BrainCircuit, Check, Clock3, Laptop2, MessageSquareText, PencilLine, ShieldAlert, Trash2, Undo2, UserRoundX } from 'lucide-vue-next'
import AppButton from '../ui/AppButton.vue'
import RemoteUserAvatar from '../profile/RemoteUserAvatar.vue'
import type { TrackingRow } from '../../features/tracking/tracking-model'
import { computed } from 'vue'
import { aiOutcomeMismatch, aiReviewHistoryLabel, type RegistrationManagerActions } from '../../features/registrations/registration-model'
import { deviceDisplay } from '../../features/registrations/device-policy'
import type { LateRegistrationRecord, StudentLateSummary } from '../../features/tracking/late-model'
// FEAT-LATE-001: trạng thái ghi trễ của học sinh này (null = không hiển thị).
export interface RowLateState {summary:StudentLateSummary;sessionLate:LateRegistrationRecord|null;canRecord:boolean;canRevoke:boolean}
const props=withDefaults(defineProps<{row:TrackingRow;actions?:RegistrationManagerActions|null;busy?:boolean;canAiRereview?:boolean;late?:RowLateState|null;lateBusy?:boolean}>(),{canAiRereview:false,late:null,lateBusy:false})
const emit=defineEmits<{approve:[];revision:[];comment:[];delete:[];aiRereview:[];recordLate:[];revokeLate:[lateId:string]}>()
const lateTime=(iso:string)=>new Intl.DateTimeFormat('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',hour:'2-digit',minute:'2-digit',day:'2-digit',month:'2-digit'}).format(new Date(iso))
const device=computed(()=>deviceDisplay(props.row.registration))
const statusText=()=>props.row.bucket==='missing'?'Chưa đăng ký':props.row.registration?.revisionOverdueAt?'Báo cáo lỗi':props.row.registration?.status==='approved'?'Đã duyệt':props.row.registration?.status==='needs_revision'?'Cần chỉnh sửa':props.actions?.started&&props.row.registration?.status==='submitted'?'Không duyệt':'Chờ duyệt'
const aiText=()=>aiReviewHistoryLabel(props.row.registration)
const aiMismatch=()=>aiOutcomeMismatch(props.row.registration)
// Buổi đã bắt đầu mà đăng ký vẫn "chờ duyệt" thì nó đã sang Báo cáo lỗi và GV
// không còn nút nào để bấm — nói "cần giáo viên kiểm tra" ở đây là sai, GV sẽ
// đi tìm một việc không tồn tại.
const notApproved=()=>Boolean(props.actions?.started&&props.row.registration?.status==='submitted')
const attentionNote=()=>aiMismatch()
  ?'Kết quả AI chưa được áp dụng vào trạng thái đăng ký.'
  :notApproved()
    ?'Đăng ký không được duyệt trước giờ bắt đầu tiết nên đã chuyển sang Báo cáo lỗi; không còn chờ giáo viên xử lý.'
    :'Đăng ký cần giáo viên kiểm tra.'
</script>
<template>
  <article class="tracking-row" :class="{busy}" :data-bucket="row.bucket">
    <header><div class="identity"><RemoteUserAvatar :user-id="row.user.id" :name="row.user.name" :code="row.user.code" size="md"/><div><h4>{{ row.user.name }}</h4><small>{{ row.user.code }}</small></div></div><div class="badges"><span v-if="late&&late.summary.openCases.length" class="conduct-chip" :title="`Có ${late.summary.openCases.length} lần cải thiện ý thức chưa chấp hành`"><ShieldAlert aria-hidden="true"/>Cải thiện ý thức · {{ late.summary.openCases.length }}</span><span v-if="late&&late.summary.pending" class="late-chip" :title="`Đã trễ ${late.summary.pending} lần; đủ ${late.summary.threshold} lần thành 1 lần cải thiện ý thức`"><Clock3 aria-hidden="true"/>Trễ {{ late.summary.pending }}/{{ late.summary.threshold }}</span><span class="status">{{ statusText() }}</span></div></header>
    <div class="facts">
      <span><small>Thiết bị điện tử</small><b :class="{yes:device.tone==='yes',locked:device.tone==='locked'}"><Laptop2 v-if="row.registration" aria-hidden="true"/>{{ device.short }}</b></span>
      <span><small>AI</small><b>{{ aiText() }}</b></span>
      <span><small>Phản hồi GV</small><b><MessageSquareText v-if="row.registration?.teacherComment" aria-hidden="true"/>{{ row.registration?.teacherComment?'Có':'—' }}</b></span>
    </div>
    <div class="content"><small>Nội dung đăng ký</small><p>{{ row.registration?.content || 'Chưa có nội dung đăng ký' }}</p><p v-if="row.registration?.note" class="note">{{ row.registration.note }}</p></div>
    <div v-if="row.registration?.teacherComment" class="teacher-comment"><b>GV:</b> {{ row.registration.teacherComment }}</div>
    <div v-if="busy" class="busy-indicator" role="status"><span class="diamond" aria-hidden="true"></span>Đang xử lý và đồng bộ…</div>
    <div v-if="actions&&row.registration" class="actions">
      <AppButton v-if="canAiRereview" variant="secondary" :disabled="busy" @click="emit('aiRereview')"><BrainCircuit aria-hidden="true"/>AI duyệt lại</AppButton>
      <AppButton v-if="actions.canApprove" variant="success" :disabled="busy" @click="emit('approve')"><Check aria-hidden="true"/>Duyệt</AppButton>
      <AppButton v-if="actions.canRequestRevision" variant="warning" :disabled="busy" @click="emit('revision')"><PencilLine aria-hidden="true"/>Yêu cầu sửa</AppButton>
      <AppButton v-if="actions.canComment" variant="info" :disabled="busy" @click="emit('comment')"><MessageSquareText aria-hidden="true"/>Nhận xét</AppButton>
      <AppButton v-if="actions.canDelete" variant="danger" :disabled="busy" @click="emit('delete')"><Trash2 aria-hidden="true"/>Xóa</AppButton>
    </div>
    <div v-if="row.bucket==='missing'&&late?.sessionLate" class="late-note"><Clock3 aria-hidden="true"/><span>Đã ghi trễ · đăng ký miệng lúc {{ lateTime(late.sessionLate.recordedAt) }}<template v-if="late.sessionLate.conductCaseId"> · đã tính vào lần cải thiện ý thức</template></span><AppButton v-if="late.canRevoke" variant="secondary" :loading="lateBusy" @click="emit('revokeLate',late.sessionLate.id)"><Undo2 aria-hidden="true"/>Hủy ghi trễ</AppButton></div>
    <div v-else-if="row.bucket==='missing'" class="missing-note"><UserRoundX aria-hidden="true"/><span>Học sinh chưa có đăng ký cho buổi này.</span><AppButton v-if="late?.canRecord" variant="warning" :loading="lateBusy" @click="emit('recordLate')"><Clock3 aria-hidden="true"/>Ghi trễ · đăng ký miệng</AppButton></div>
    <div v-else-if="row.bucket==='attention'" class="attention-note"><AlertTriangle aria-hidden="true"/>{{ attentionNote() }}</div>
  </article>
</template>
<style scoped>
.tracking-row{display:grid;gap:12px;border:1px solid var(--border);border-radius:16px;background:var(--surface-raised);padding:15px}.tracking-row.busy{border-color:color-mix(in srgb,var(--color-primary) 32%,var(--border));box-shadow:0 0 0 3px color-mix(in srgb,var(--color-primary) 7%,transparent)}.tracking-row[data-bucket="attention"]{border-color:color-mix(in srgb,var(--color-warning) 35%,var(--border))}.tracking-row header{display:flex;justify-content:space-between;gap:12px}.identity{display:flex;align-items:center;gap:10px}.identity h4{margin:0}.identity small{color:var(--text-muted)}.status{align-self:flex-start;border-radius:999px;padding:5px 9px;background:var(--surface-soft);color:var(--text-muted);font-size:var(--font-size-ui-min);font-weight:900}.facts{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px}.facts>span{display:grid;gap:3px;border-radius:12px;background:var(--surface-soft);padding:9px}.facts small,.content>small{color:var(--text-muted);font-size:var(--font-size-ui-min)}.facts b{display:flex;align-items:center;gap:5px;font-size:.84rem}.facts svg{width:14px}.facts .yes{color:var(--color-info)}.facts .locked{color:var(--color-warning)}.content p{margin:4px 0 0;white-space:pre-wrap}.content .note{color:var(--text-muted);font-size:.86rem}.teacher-comment,.missing-note,.attention-note{border-radius:11px;padding:9px 11px;background:var(--surface-soft);font-size:.83rem}.missing-note,.attention-note,.late-note{display:flex;align-items:center;gap:7px;color:var(--text-muted)}.missing-note>span,.late-note>span{flex:1}.late-note{border-radius:11px;padding:9px 11px;background:var(--wash-sun);color:var(--color-warning);font-size:.83rem;font-weight:750}.late-note svg{width:16px}.missing-note :deep(.app-button),.late-note :deep(.app-button){min-height:36px;padding:6px 11px;font-size:var(--font-size-ui-min)}.badges{display:flex;align-items:flex-start;gap:6px;flex-wrap:wrap;justify-content:flex-end}.late-chip,.conduct-chip{display:inline-flex;align-items:center;gap:4px;border-radius:999px;padding:5px 9px;font-size:var(--font-size-ui-min);font-weight:900}.late-chip{background:var(--wash-sun);color:var(--color-warning)}.conduct-chip{background:var(--wash-coral);color:var(--color-danger)}.late-chip svg,.conduct-chip svg{width:14px}.attention-note{color:var(--color-warning)}.missing-note svg,.attention-note svg{width:16px}.busy-indicator{display:flex;align-items:center;gap:8px;color:var(--color-primary);font-size:var(--font-size-ui-min);font-weight:850}.diamond{width:10px;height:10px;border-radius:2px;background:currentColor;transform:rotate(45deg);animation:busy-diamond .8s ease-in-out infinite}@keyframes busy-diamond{50%{transform:rotate(135deg) scale(.72);opacity:.55}}.actions{display:flex;gap:7px;flex-wrap:wrap}.actions :deep(.app-button){min-height:40px;padding:8px 11px;font-size:var(--font-size-ui-min)}.actions :deep(svg){width:15px}@media(max-width:680px){.facts{grid-template-columns:1fr}.missing-note,.late-note{flex-wrap:wrap}.missing-note :deep(.app-button),.late-note :deep(.app-button){width:100%}.actions :deep(.app-button){flex:1 1 calc(50% - 7px)}}
</style>
