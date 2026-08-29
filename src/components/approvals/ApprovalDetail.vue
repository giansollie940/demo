<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { AlertTriangle, Bot, Check, Laptop2, MessageSquareText, PencilLine, Trash2, UserRound, XCircle } from 'lucide-vue-next'
import AppButton from '../ui/AppButton.vue'
import InlineStatus from '../ui/InlineStatus.vue'
import type { CurrentUser, RegistrationRecord } from '../../types/legacy'
import { aiCategoryLabel, aiDecisionLabel, aiOutcomeMismatch, aiReviewHistoryLabel, aiReviewInProgress, needsTeacherAction, type RegistrationManagerActions } from '../../features/registrations/registration-model'

const props = defineProps<{
  registration: RegistrationRecord
  user?: CurrentUser | null
  actions: RegistrationManagerActions
  saving: boolean
  error: string
}>()
const emit = defineEmits<{
  approve: []
  comment: [value:string]
  revision: [value:string]
  aiWrong: [value:string]
  delete: []
  dirty: [value:boolean]
}>()
const comment = ref(String(props.registration.teacherComment ?? ''))
watch(()=>props.registration.id,()=>{comment.value=String(props.registration.teacherComment??'');emit('dirty',false)})
watch(comment,(value)=>emit('dirty',value.trim()!==String(props.registration.teacherComment??'').trim()))
const confidence = computed(()=>typeof props.registration.aiConfidence==='number'?`${Math.round(props.registration.aiConfidence*100)}%`:'–')
const dayName = computed(()=>['Thứ 2','Thứ 3','Thứ 4','Thứ 5','Thứ 6','Thứ 7','Chủ nhật'][Number(props.registration.dow)] ?? `Ngày ${Number(props.registration.dow)+1}`)
const statusLabel = computed(()=>props.registration.status==='approved'?'Đã duyệt':props.registration.status==='needs_revision'?'Cần chỉnh sửa':props.registration.status==='draft'?'Bản nháp':'Chờ duyệt')
const aiHistoryLabel = computed(()=>aiReviewHistoryLabel(props.registration))
const decisionLabel = computed(()=>aiDecisionLabel(props.registration))
const categoryLabel = computed(()=>aiCategoryLabel(props.registration))
const outcomeMismatch = computed(()=>aiOutcomeMismatch(props.registration))
const approvalLabel = computed(()=>{if(props.registration.status==='approved')return props.registration.approvalSource==='ai'?'AI duyệt':'GV duyệt';if(props.registration.status==='needs_revision')return 'Chờ HS sửa';if(aiReviewInProgress(props.registration))return 'Chờ AI';if(needsTeacherAction(props.registration))return 'Chờ GV';return '—'})
</script>

<template>
  <article class="approval-detail">
    <header class="detail-header">
      <div class="identity"><span class="avatar"><UserRound aria-hidden="true" /></span><div><span class="eyebrow">{{ user?.code ?? 'Học sinh' }}</span><h2>{{ user?.name ?? 'Chi tiết đăng ký' }}</h2><p>{{ dayName }} · Tiết {{ registration.period }}</p></div></div>
      <span class="status-pill" :data-status="registration.status">{{ statusLabel }}</span>
    </header>

    <InlineStatus v-if="error" state="error" :message="error" />
    <InlineStatus v-if="outcomeMismatch" state="error" message="Kết quả AI đã hoàn tất nhưng trạng thái nghiệp vụ chưa được áp dụng. Đây là lỗi đồng bộ backend; đăng ký được giữ trong hàng GV để không bỏ sót." />

    <section class="detail-grid">
      <div class="detail-block wide"><h3>Nội dung tự học</h3><p>{{ registration.content || 'Chưa nhập nội dung.' }}</p><small v-if="registration.note">{{ registration.note }}</small></div>
      <div class="detail-block"><h3><Laptop2 aria-hidden="true" />Thiết bị điện tử</h3><p>{{ registration.usesElectronicDevice ? 'Có đăng ký sử dụng' : 'Không đăng ký' }}</p></div>
      <div v-if="registration.isEmergency" class="detail-block emergency"><h3><AlertTriangle aria-hidden="true" />Đăng ký bổ sung</h3><p>{{ registration.emergencyReason || 'Không có lý do.' }}</p></div>
      <div class="detail-block ai-block"><h3><Bot aria-hidden="true" />Kết quả AI</h3><div class="ai-meta"><span>Lịch sử AI: <b>{{ aiHistoryLabel }}</b></span><span>Quyết định AI: <b>{{ decisionLabel }}</b></span><span>Nhóm AI: <b>{{ categoryLabel }}</b></span><span>Nguồn duyệt hiện tại: <b>{{ approvalLabel }}</b></span><span>Độ tin cậy mô hình: <b>{{ confidence }}</b></span></div><p>{{ registration.aiReason || registration.autoReviewReason || 'AI chưa có nhận xét.' }}</p><small>Độ tin cậy mô hình thể hiện mức chắc chắn của kết quả phân loại; quyết định cuối cùng phải được backend áp dụng vào trạng thái đăng ký.</small></div>
    </section>

    <section class="teacher-note">
      <label for="approvalTeacherComment"><MessageSquareText aria-hidden="true" />Nhận xét giáo viên</label>
      <textarea id="approvalTeacherComment" v-model="comment" rows="4" :disabled="saving" placeholder="Nhập nhận xét hoặc hướng dẫn cụ thể cho học sinh"></textarea>
      <div class="note-actions">
        <AppButton variant="info" :disabled="!actions.canComment || !comment.trim()" :loading="saving" @click="emit('comment',comment)"><Check aria-hidden="true" />Lưu nhận xét</AppButton>
      </div>
    </section>

    <footer class="action-bar">
      <AppButton v-if="actions.canApprove" variant="success" :loading="saving" @click="emit('approve')"><Check aria-hidden="true" />Duyệt</AppButton>
      <AppButton v-if="actions.canRequestRevision" variant="warning" :disabled="!comment.trim()" :loading="saving" @click="emit('revision',comment)"><PencilLine aria-hidden="true" />Yêu cầu sửa</AppButton>
      <AppButton v-if="actions.canRequestRevision" variant="secondary" :disabled="!comment.trim()" :loading="saving" @click="emit('aiWrong',comment)"><XCircle aria-hidden="true" />AI chưa đúng</AppButton>
      <AppButton v-if="actions.canDelete" variant="danger" :loading="saving" @click="emit('delete')"><Trash2 aria-hidden="true" />Xóa đăng ký</AppButton>
    </footer>
  </article>
</template>

<style scoped>
.approval-detail{display:grid;gap:18px}.detail-header{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}.identity{display:flex;gap:12px;align-items:center}.avatar{width:48px;height:48px;border-radius:14px;display:grid;place-items:center;background:color-mix(in srgb,var(--color-primary) 12%,var(--surface-soft));color:var(--color-primary)}.avatar svg{width:22px}.identity h2{margin:2px 0;font-size:1.28rem}.identity p,.eyebrow{margin:0;color:var(--text-muted);font-size:.82rem}.eyebrow{font-weight:900;text-transform:uppercase;letter-spacing:.05em}.status-pill{font-size:.76rem;font-weight:900;padding:7px 10px;border-radius:999px;background:var(--surface-soft);color:var(--text-muted)}.status-pill[data-status="approved"]{color:var(--color-success)}.status-pill[data-status="needs_revision"]{color:var(--color-warning)}.detail-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.detail-block{border:1px solid var(--border);border-radius:14px;padding:14px;background:var(--surface-soft)}.detail-block.wide,.ai-block{grid-column:1/-1}.detail-block h3{display:flex;align-items:center;gap:7px;margin:0 0 8px;font-size:.86rem}.detail-block h3 svg{width:17px;color:var(--color-primary)}.detail-block p{margin:0;line-height:1.55;white-space:pre-wrap}.detail-block small{display:block;margin-top:8px;color:var(--text-muted);line-height:1.45}.emergency{border-color:color-mix(in srgb,var(--color-warning) 35%,var(--border))}.ai-meta{display:flex;gap:16px;flex-wrap:wrap;color:var(--text-muted);font-size:.8rem;margin-bottom:8px}.teacher-note{display:grid;gap:8px}.teacher-note label{display:flex;align-items:center;gap:8px;font-weight:900}.teacher-note label svg{width:18px;color:var(--color-primary)}.teacher-note textarea{width:100%;resize:vertical;min-height:104px;border:1px solid var(--border);border-radius:13px;padding:12px;background:var(--surface-raised);color:var(--text);font:inherit}.teacher-note textarea:focus{outline:3px solid var(--focus-ring);border-color:var(--color-primary)}.note-actions,.action-bar{display:flex;gap:8px;flex-wrap:wrap}.action-bar{padding-top:4px;border-top:1px solid var(--border)}.action-bar :deep(svg),.note-actions :deep(svg){width:17px}
@media(max-width:640px){.detail-header{align-items:stretch;flex-direction:column}.status-pill{align-self:flex-start}.detail-grid{grid-template-columns:1fr}.detail-block.wide,.ai-block{grid-column:auto}.action-bar :deep(.app-button){width:100%}}
</style>
