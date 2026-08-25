<script setup lang="ts">
import { AlertTriangle, BrainCircuit, Check, Laptop2, MessageSquareText, PencilLine, Trash2, UserRoundX } from 'lucide-vue-next'
import AppButton from '../ui/AppButton.vue'
import type { TrackingRow } from '../../features/tracking/tracking-model'
import { aiOutcomeMismatch, aiReviewHistoryLabel, type RegistrationManagerActions } from '../../features/registrations/registration-model'
const props=withDefaults(defineProps<{row:TrackingRow;actions?:RegistrationManagerActions|null;busy?:boolean;canAiRereview?:boolean}>(),{canAiRereview:false})
const emit=defineEmits<{approve:[];revision:[];comment:[];delete:[];aiRereview:[]}>()
const statusText=()=>props.row.bucket==='missing'?'Chưa đăng ký':props.row.registration?.revisionOverdueAt?'Báo cáo lỗi':props.row.registration?.status==='approved'?'Đã duyệt':props.row.registration?.status==='needs_revision'?'Cần chỉnh sửa':'Chờ duyệt'
const aiText=()=>aiReviewHistoryLabel(props.row.registration)
const aiMismatch=()=>aiOutcomeMismatch(props.row.registration)
</script>
<template>
  <article class="tracking-row" :data-bucket="row.bucket">
    <header><div class="identity"><span class="avatar">{{ row.user.name.split(' ').slice(-2).map(part=>part[0]).join('').toUpperCase() }}</span><div><h4>{{ row.user.name }}</h4><small>{{ row.user.code }}</small></div></div><span class="status">{{ statusText() }}</span></header>
    <div class="facts">
      <span><small>Thiết bị điện tử</small><b :class="{yes:row.registration?.usesElectronicDevice}"><Laptop2 v-if="row.registration" aria-hidden="true"/>{{ !row.registration?'Chưa có đăng ký':row.registration.usesElectronicDevice?'Có đăng ký':'Không đăng ký' }}</b></span>
      <span><small>AI</small><b>{{ aiText() }}</b></span>
      <span><small>Phản hồi GV</small><b><MessageSquareText v-if="row.registration?.teacherComment" aria-hidden="true"/>{{ row.registration?.teacherComment?'Có':'—' }}</b></span>
    </div>
    <div class="content"><small>Nội dung đăng ký</small><p>{{ row.registration?.content || 'Chưa có nội dung đăng ký' }}</p><p v-if="row.registration?.note" class="note">{{ row.registration.note }}</p></div>
    <div v-if="row.registration?.teacherComment" class="teacher-comment"><b>GV:</b> {{ row.registration.teacherComment }}</div>
    <div v-if="actions&&row.registration" class="actions">
      <AppButton v-if="canAiRereview" variant="secondary" :disabled="busy" @click="emit('aiRereview')"><BrainCircuit aria-hidden="true"/>AI duyệt lại</AppButton>
      <AppButton v-if="actions.canApprove" variant="success" :disabled="busy" @click="emit('approve')"><Check aria-hidden="true"/>Duyệt</AppButton>
      <AppButton v-if="actions.canRequestRevision" variant="warning" :disabled="busy" @click="emit('revision')"><PencilLine aria-hidden="true"/>Yêu cầu sửa</AppButton>
      <AppButton v-if="actions.canComment" variant="info" :disabled="busy" @click="emit('comment')"><MessageSquareText aria-hidden="true"/>Nhận xét</AppButton>
      <AppButton v-if="actions.canDelete" variant="danger" :disabled="busy" @click="emit('delete')"><Trash2 aria-hidden="true"/>Xóa</AppButton>
    </div>
    <div v-if="row.bucket==='missing'" class="missing-note"><UserRoundX aria-hidden="true"/>Học sinh chưa có đăng ký cho buổi này.</div>
    <div v-else-if="row.bucket==='attention'" class="attention-note"><AlertTriangle aria-hidden="true"/>{{ aiMismatch()?'Kết quả AI chưa được áp dụng vào trạng thái đăng ký.':'Đăng ký cần giáo viên kiểm tra.' }}</div>
  </article>
</template>
<style scoped>
.tracking-row{display:grid;gap:12px;border:1px solid var(--border);border-radius:16px;background:var(--surface-raised);padding:15px}.tracking-row[data-bucket="attention"]{border-color:color-mix(in srgb,var(--color-warning) 35%,var(--border))}.tracking-row header{display:flex;justify-content:space-between;gap:12px}.identity{display:flex;align-items:center;gap:10px}.avatar{width:42px;height:42px;border-radius:13px;background:var(--surface-soft);display:grid;place-items:center;color:var(--color-primary);font-weight:900}.identity h4{margin:0}.identity small{color:var(--text-muted)}.status{align-self:flex-start;border-radius:999px;padding:5px 9px;background:var(--surface-soft);color:var(--text-muted);font-size:.74rem;font-weight:900}.facts{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px}.facts>span{display:grid;gap:3px;border-radius:12px;background:var(--surface-soft);padding:9px}.facts small,.content>small{color:var(--text-muted);font-size:.72rem}.facts b{display:flex;align-items:center;gap:5px;font-size:.84rem}.facts svg{width:14px}.facts .yes{color:var(--color-info)}.content p{margin:4px 0 0;white-space:pre-wrap}.content .note{color:var(--text-muted);font-size:.86rem}.teacher-comment,.missing-note,.attention-note{border-radius:11px;padding:9px 11px;background:var(--surface-soft);font-size:.83rem}.missing-note,.attention-note{display:flex;align-items:center;gap:7px;color:var(--text-muted)}.attention-note{color:var(--color-warning)}.missing-note svg,.attention-note svg{width:16px}.actions{display:flex;gap:7px;flex-wrap:wrap}.actions :deep(.app-button){min-height:40px;padding:8px 11px;font-size:.8rem}.actions :deep(svg){width:15px}@media(max-width:680px){.facts{grid-template-columns:1fr}.actions :deep(.app-button){flex:1 1 calc(50% - 7px)}}
</style>
