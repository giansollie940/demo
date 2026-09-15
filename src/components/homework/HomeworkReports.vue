<script setup lang="ts">
import { reactive } from 'vue';
import { dateLabel,type NoticeReport,type ReportStatistic } from '../../features/homework/api';
import { reportLabels,issueLabels,moderationEventLabels } from '../../features/homework/moderation';
defineProps<{ reports:NoticeReport[]; statistics:ReportStatistic[]; busy:boolean }>();
const emit=defineEmits<{ process:[payload:Record<string,unknown>]; view:[id:string] }>();
const notes=reactive<Record<string,string>>({});
</script>
<template>
 <section class="reports"><h2>Báo sai thông tin — nội bộ giáo viên</h2><p>Thống kê chỉ hỗ trợ giáo viên xem xét. Hệ thống không tự khóa quyền Cán sự.</p>
  <div class="stats"><article v-for="s in statistics" :key="s.reporter_id"><h3>{{s.full_name}}</h3><p>Tổng: {{s.total}} · Hợp lệ: {{s.valid}} · Không hợp lệ: {{s.invalid}} · Dấu hiệu lạm dụng: {{s.suspected_abuse}}</p><p v-if="s.suspected_abuse>1">Có nhiều report bị đánh dấu lạm dụng; giáo viên cần xem xét.</p></article></div>
  <p v-if="!reports.length">Chưa có báo sai thông tin trong lớp này.</p>
  <article v-for="r in reports" :key="r.id" class="report"><h3>{{r.reporter_name}} <span v-if="r.reporter_code">· {{r.reporter_code}}</span></h3>
   <p>{{r.class_name}} · {{dateLabel(r.created_at)}} · {{issueLabels[r.category]}} · {{reportLabels[r.status]}}</p><p class="text">{{r.note}}</p>
   <button :disabled="busy" @click="emit('view',r.notice_id)">Xem bài và yêu cầu chỉnh sửa</button>
   <template v-if="r.status==='open'"><label>Ghi chú xử lý (không bắt buộc)<textarea v-model="notes[r.id]" :disabled="busy" maxlength="2000" /></label><div class="actions"><button v-for="outcome in ['valid','invalid','suspected_abuse']" :key="outcome" :disabled="busy" @click="emit('process',{id:r.notice_id,report_id:r.id,outcome,note:notes[r.id]||''})">{{reportLabels[outcome]}}</button></div></template>
   <p v-else class="text">{{r.teacher_note}}</p><details><summary>Lịch sử report</summary><p v-for="e in r.events" :key="e.id">{{dateLabel(e.created_at)}} · {{moderationEventLabels[e.event_type]||e.event_type}} · {{e.actor_name||'Người dùng'}}</p></details>
  </article>
 </section>
</template>
<style scoped>
.reports{display:grid;gap:18px}.report,.stats article{padding:20px;border:1px solid var(--border);border-radius:var(--radius-lg,18px);background:var(--surface);display:grid;gap:12px}.reports h3,.reports p{margin:0}.stats{display:grid;gap:12px}.text{white-space:pre-wrap;overflow-wrap:anywhere}label{display:grid;gap:8px}textarea{font:inherit;padding:10px;max-width:100%;background:var(--surface);color:var(--text);border:1px solid var(--border)}.actions{display:flex;flex-wrap:wrap;gap:10px}button{min-height:44px;padding:8px 14px;background:var(--surface-raised);color:var(--text);border:1px solid var(--border);border-radius:10px;cursor:pointer}button:disabled{opacity:.5}summary{cursor:pointer;padding:8px 0}button:focus-visible,textarea:focus-visible,summary:focus-visible{outline:3px solid var(--color-primary);outline-offset:2px}
</style>
