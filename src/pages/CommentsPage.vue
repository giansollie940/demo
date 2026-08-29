<script setup lang="ts">
import { computed } from 'vue'
import { MessageSquareText } from 'lucide-vue-next'
import AppBadge from '../components/ui/AppBadge.vue'
import AppCard from '../components/ui/AppCard.vue'
import { useAuthStore } from '../stores/auth'
const auth=useAuthStore();const days=['Thứ 2','Thứ 3','Thứ 4','Thứ 5','Thứ 6','Thứ 7','Chủ nhật']
const items=computed(()=>(auth.legacyState?.registrations??[]).filter(row=>row.studentId===auth.currentUser?.id&&Boolean(row.teacherComment)&&row.isDeleted!==true).sort((a,b)=>Number(b.updatedAt??0)-Number(a.updatedAt??0)))
function label(status:string){return status==='approved'?'Đã duyệt':status==='needs_revision'?'Cần chỉnh sửa':status==='draft'?'Bản nháp':'Chờ duyệt'}
function tone(status:string){return status==='approved'?'success':status==='needs_revision'?'warning':status==='draft'?'neutral':'info'}
</script>
<template><div class="page-stack comments-page"><header><span>HỘP THƯ PHẢN HỒI</span><h1>Nhận xét của giáo viên</h1><p>Các phản hồi dành cho đăng ký tự học của bạn.</p></header><div v-if="items.length" class="comment-list"><AppCard v-for="row in items" :key="row.id" padding="lg"><div class="meta"><span>{{ days[row.dow] }} · Tiết {{ row.period }}</span><AppBadge :tone="tone(row.status)">{{ label(row.status) }}</AppBadge></div><h2>{{ row.content }}</h2><div class="message"><span class="avatar"><MessageSquareText/></span><div><b>Nhận xét của giáo viên</b><p>{{ row.teacherComment }}</p></div></div></AppCard></div><AppCard v-else padding="lg" class="empty"><h2>Chưa có nhận xét nào</h2><p>Phản hồi của giáo viên về đăng ký tự học sẽ được lưu tại đây.</p></AppCard></div></template>
<style scoped>.comments-page{max-width:1100px;margin:0 auto}.comments-page>header span{color:var(--color-primary);font-size:.78rem;font-weight:850;letter-spacing:.08em}.comments-page>header h1{margin:7px 0;font-size:clamp(2rem,4vw,3rem)}.comments-page>header p,.empty p{color:var(--text-muted)}.comment-list{display:grid;gap:14px}.meta{display:flex;justify-content:space-between;gap:12px;color:var(--text-muted);font-size:.85rem}.comment-list h2{font-size:1.05rem;margin:14px 0}.message{display:flex;gap:12px;padding:14px;border-radius:14px;background:var(--surface-soft)}.message .avatar{width:38px;height:38px;border-radius:12px;display:grid;place-items:center;background:color-mix(in srgb,var(--color-info) 13%,var(--surface));color:var(--color-info);flex:none}.message svg{width:20px}.message p{margin:5px 0 0;color:var(--text-muted);line-height:1.55}.empty{text-align:center}</style>
