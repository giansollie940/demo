<script setup lang="ts">
import { computed } from 'vue'
import { Clock3, MessageSquareText, Siren } from 'lucide-vue-next'
import AppBadge from '../components/ui/AppBadge.vue'
import AppCard from '../components/ui/AppCard.vue'
import { useAuthStore } from '../stores/auth'

const auth = useAuthStore()
const days = ['Thứ 2','Thứ 3','Thứ 4','Thứ 5','Thứ 6','Thứ 7','Chủ nhật']
const rows = computed(() => (auth.legacyState?.registrations ?? [])
  .filter(row => row.studentId === auth.currentUser?.id && row.isDeleted !== true)
  .sort((a,b) => Number(b.updatedAt ?? 0) - Number(a.updatedAt ?? 0)))
function weekNumber(id:string){return auth.legacyState?.weeks.find(item=>item.id===id)?.number ?? '?'}
function statusLabel(status:string){return status==='approved'?'Đã duyệt':status==='needs_revision'?'Cần chỉnh sửa':status==='draft'?'Bản nháp':'Chờ duyệt'}
function tone(status:string){return status==='approved'?'success':status==='needs_revision'?'warning':status==='draft'?'neutral':'info'}
</script>
<template>
  <div class="page-stack history-page">
    <header><span>LỊCH SỬ CỦA TÔI</span><h1>Hoạt động đăng ký</h1><p>Xem lại đăng ký và phản hồi ở các tuần trước, mới nhất ở trên.</p></header>
    <div v-if="rows.length" class="timeline">
      <AppCard v-for="row in rows" :key="row.id" class="event" padding="lg">
        <div class="dot" aria-hidden="true"/><div class="event-main">
          <div class="event-head"><div><span>Tuần {{ weekNumber(row.weekId) }}</span><b>{{ days[row.dow] ?? `Ngày ${row.dow}` }} · Tiết {{ row.period }}</b></div><AppBadge :tone="tone(row.status)">{{ statusLabel(row.status) }}</AppBadge></div>
          <h2>{{ row.content || 'Chưa có nội dung' }}</h2><p v-if="row.note">{{ row.note }}</p>
          <div class="tags"><span v-if="row.isEmergency" class="emergency"><Siren/>Đăng ký bổ sung</span><span><Clock3/>{{ row.updatedAt ? new Date(row.updatedAt).toLocaleString('vi-VN') : 'Không rõ thời gian' }}</span></div>
          <div v-if="row.teacherComment" class="teacher-comment"><MessageSquareText/><div><b>Nhận xét giáo viên</b><p>{{ row.teacherComment }}</p></div></div>
        </div>
      </AppCard>
    </div>
    <AppCard v-else padding="lg" class="empty"><h2>Chưa có lịch sử đăng ký</h2><p>Những lần đăng ký và thay đổi trạng thái sẽ xuất hiện tại đây.</p></AppCard>
  </div>
</template>
<style scoped>
.history-page{max-width:1100px;margin:0 auto}.history-page>header span{color:var(--color-primary);font-size:.78rem;font-weight:850;letter-spacing:.08em}.history-page>header h1{margin:7px 0;font-size:clamp(2rem,4vw,3rem)}.history-page>header p,.event-main>p,.empty p{color:var(--text-muted)}.timeline{display:grid;gap:14px}.event{position:relative;display:grid;grid-template-columns:18px 1fr;gap:14px}.dot{width:12px;height:12px;margin-top:8px;border-radius:50%;background:var(--color-primary);box-shadow:0 0 0 5px color-mix(in srgb,var(--color-primary) 13%,transparent)}.event-main{min-width:0}.event-head{display:flex;justify-content:space-between;gap:16px}.event-head>div{display:grid;gap:3px}.event-head span{color:var(--text-muted);font-size:.8rem}.event-main h2{margin:14px 0 6px;font-size:1.05rem}.tags{display:flex;flex-wrap:wrap;gap:10px;margin-top:12px}.tags span{display:inline-flex;align-items:center;gap:5px;color:var(--text-muted);font-size:.82rem}.tags svg{width:15px}.tags .emergency{color:var(--color-warning);font-weight:800}.teacher-comment{display:flex;gap:10px;margin-top:14px;padding:12px;border-radius:12px;background:var(--surface-soft)}.teacher-comment>svg{width:20px;color:var(--color-info);flex:none}.teacher-comment p{margin:4px 0 0;color:var(--text-muted)}.empty{text-align:center}@media(max-width:600px){.event{grid-template-columns:10px 1fr}.event-head{align-items:flex-start;flex-direction:column}}
</style>
