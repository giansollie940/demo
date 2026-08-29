<script setup lang="ts">
import { computed } from 'vue'
import { Clock3, MessageSquareText, TriangleAlert, UserRound } from 'lucide-vue-next'
import AppCard from '../components/ui/AppCard.vue'
import RegistrationStatusBadge from '../components/registrations/RegistrationStatusBadge.vue'
import { useAuthStore } from '../stores/auth'
import { useContextStore } from '../stores/context'
import { useWeekData } from '../features/weeks/queries'
import { dateForDow, isRevisionOverdue, sessionStartMs } from '../features/registrations/registration-model'
import { useNowTicker } from '../features/shared/useNowTicker'
import type { RegistrationRecord } from '../types/legacy'

const auth=useAuthStore(),context=useContextStore(),nowMs=useNowTicker(30_000)
const classId=computed(()=>context.selectedClassId),weekId=computed(()=>context.selectedWeekId),week=computed(()=>context.selectedWeek)
const weekQuery=useWeekData(classId,weekId)
const periods=computed(()=>auth.legacyState?.periods??[])
const registrations=computed(()=>weekQuery.data.value?.registrations??auth.legacyState?.registrations.filter(row=>row.weekId===weekId.value)??[])
const canViewClass=computed(()=>['monitor','teacher','admin'].includes(auth.currentUser?.role??''))
const reports=computed(()=>{
  const selectedWeek=week.value
  if(!selectedWeek)return[]
  return registrations.value
    .filter(row=>row.isDeleted!==true&&isRevisionOverdue(row,{week:selectedWeek,periods:periods.value,nowMs:nowMs.value}))
    .filter(row=>canViewClass.value||row.studentId===auth.currentUser?.id)
    .slice()
    .sort((a,b)=>reportTime(b)-reportTime(a))
})
function student(row:RegistrationRecord){return auth.legacyState?.users.find(user=>user.id===row.studentId)??null}
function period(row:RegistrationRecord){return periods.value.find(item=>Number(item.n)===Number(row.period))??null}
function reportTime(row:RegistrationRecord){
  if(row.revisionOverdueAt){const parsed=new Date(row.revisionOverdueAt).getTime();if(Number.isFinite(parsed))return parsed}
  const selectedWeek=week.value
  if(!selectedWeek)return 0
  const start=sessionStartMs({week:selectedWeek,dow:row.dow,period:row.period,periods:periods.value})
  return Number.isFinite(start)?start:0
}
function formatDateTime(ms:number){return ms?new Date(ms).toLocaleString('vi-VN'):'—'}
function formatDate(value:string){const [y,m,d]=value.split('-');return`${d}/${m}/${y}`}
const days=['Thứ 2','Thứ 3','Thứ 4','Thứ 5','Thứ 6']
</script>

<template>
  <div class="page-stack issues-page">
    <header class="issues-header">
      <div><span class="page-context"><TriangleAlert aria-hidden="true"/> Theo dõi quá hạn chỉnh sửa</span><h1>Báo cáo lỗi</h1><p>Tuần {{ week?.number??'–' }} · các yêu cầu sửa chưa được hoàn tất trước giờ bắt đầu tiết.</p></div>
      <span class="issue-count">{{ reports.length }} mục</span>
    </header>

    <AppCard padding="md" class="explain"><TriangleAlert aria-hidden="true"/><div><b>Đây không còn là yêu cầu chỉnh sửa đang chờ.</b><p>Khi buổi tự học đã bắt đầu, đăng ký chưa sửa được chuyển sang Báo cáo lỗi và chỉ giữ lại để theo dõi.</p></div></AppCard>

    <section v-if="reports.length" class="issue-grid">
      <AppCard v-for="row in reports" :key="row.id" padding="lg" class="issue-card">
        <header><div><span class="slot">{{ days[row.dow] }} · {{ week?formatDate(dateForDow(week,row.dow)):'' }} · Tiết {{ row.period }}</span><h2>{{ canViewClass ? (student(row)?.name||student(row)?.code||'Học sinh') : 'Đăng ký của bạn' }}</h2><small v-if="canViewClass">{{ student(row)?.code||'' }}</small></div><RegistrationStatusBadge status="revision_overdue"/></header>
        <div class="content-block"><small>Nội dung đăng ký</small><b>{{ row.content }}</b><p v-if="row.note">{{ row.note }}</p></div>
        <div v-if="row.teacherComment" class="feedback teacher"><MessageSquareText aria-hidden="true"/><div><small>Yêu cầu sửa của giáo viên</small><p>{{ row.teacherComment }}</p></div></div>
        <div v-if="row.aiReason" class="feedback ai"><span>AI</span><div><small>Phản hồi / lý do của AI</small><p>{{ row.aiReason }}</p></div></div>
        <footer><span><Clock3 aria-hidden="true"/> Ghi nhận: {{ formatDateTime(reportTime(row)) }}</span><span v-if="canViewClass"><UserRound aria-hidden="true"/> {{ student(row)?.name||'Học sinh' }}</span></footer>
      </AppCard>
    </section>

    <AppCard v-else padding="lg" class="empty"><TriangleAlert aria-hidden="true"/><h2>Chưa có Báo cáo lỗi</h2><p>Không có đăng ký nào bị quá hạn chỉnh sửa trong tuần đang xem.</p></AppCard>
  </div>
</template>

<style scoped>
.issues-page{max-width:1450px;margin:0 auto}.issues-header{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;padding:24px;border-radius:22px;background:linear-gradient(135deg,var(--wash-sun),color-mix(in srgb,var(--wash-coral) 52%,var(--surface)));border:1px solid color-mix(in srgb,var(--color-warning) 20%,var(--border))}.issues-header h1{margin:8px 0;font-size:clamp(2rem,4vw,3rem)}.issues-header p{margin:0;color:var(--text-muted)}.page-context{display:flex;align-items:center;gap:8px;color:var(--color-warning);font-size:.82rem;font-weight:900}.page-context svg{width:18px}.issue-count{padding:8px 12px;border-radius:999px;background:var(--surface);color:var(--color-warning);font-weight:900;border:1px solid color-mix(in srgb,var(--color-warning) 20%,var(--border))}.explain{display:flex;gap:12px;align-items:flex-start;background:linear-gradient(145deg,var(--surface),var(--wash-sun));border-color:color-mix(in srgb,var(--color-warning) 24%,var(--border))}.explain>svg{width:22px;flex:none;color:var(--color-warning)}.explain p{margin:4px 0 0;color:var(--text-muted)}.issue-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.issue-card{display:grid;gap:14px;border-color:color-mix(in srgb,var(--color-warning) 22%,var(--border));background:linear-gradient(145deg,var(--surface),color-mix(in srgb,var(--wash-sun) 50%,var(--surface)))}.issue-card header{display:flex;justify-content:space-between;gap:12px}.issue-card h2{margin:4px 0 0;font-size:1.15rem}.issue-card header small{color:var(--text-muted)}.slot{color:var(--color-warning);font-size:.78rem;font-weight:900}.content-block,.feedback{padding:13px;border-radius:14px;background:color-mix(in srgb,var(--surface) 82%,transparent);border:1px solid var(--border)}.content-block small,.feedback small{display:block;color:var(--text-muted);font-size:.72rem;font-weight:850;text-transform:uppercase;letter-spacing:.05em}.content-block b{display:block;margin-top:5px}.content-block p,.feedback p{margin:5px 0 0}.feedback{display:flex;gap:10px}.feedback>svg{width:19px;flex:none;color:var(--color-info)}.feedback.ai>span{align-self:flex-start;padding:4px 7px;border-radius:999px;background:var(--wash-violet);color:var(--color-primary);font-size:.7rem;font-weight:900}.issue-card footer{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;color:var(--text-muted);font-size:.8rem}.issue-card footer span{display:flex;align-items:center;gap:6px}.issue-card footer svg{width:15px}.empty{text-align:center}.empty>svg{width:38px;color:var(--color-warning)}.empty h2{margin:10px 0 4px}.empty p{margin:0;color:var(--text-muted)}@media(max-width:820px){.issue-grid{grid-template-columns:1fr}.issues-header{flex-direction:column}}
</style>
