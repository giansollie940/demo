<script setup lang="ts">
import { computed, ref } from 'vue';
import { dateLabel,type Correction,type Notice,type Subject,type EnglishGroup } from '../../features/homework/api';
import { correctionLabels,correctionPayload,issueLabels,moderationEventLabels } from '../../features/homework/moderation';
const props=withDefaults(defineProps<{ correction:Correction; notice?:Notice; role:string; userId:string; busy:boolean; now:number; subjects?:Subject[]; groups?:EnglishGroup[] }>(),{subjects:()=>[],groups:()=>[]});
const emit=defineEmits<{ edit:[n:Notice]; decide:[payload:Record<string,unknown>]; withdraw:[n:Notice] }>();
const reason=ref('');const current=computed(()=>props.correction.rounds.find(r=>r.round===props.correction.round));
const open=computed(()=>['awaiting_author','awaiting_teacher'].includes(props.correction.status));
const expired=computed(()=>props.correction.status==='awaiting_author'&&!!current.value&&new Date(current.value.due_at).getTime()<=props.now);
function decide(decision:string){if(props.busy||!props.notice)return;emit('decide',{...correctionPayload(props.notice.id,props.correction),decision,reason:reason.value});}
// Lookups come only from the current class payload; keep inactive entries for history.
function subjectName(id:string){return props.subjects.find(s=>s.id===id)?.name||(props.notice?.subject_id===id?props.notice.subject:null)||'Môn không còn trong danh mục lớp';}
function groupName(id:string|null){return id ? props.groups.find(g=>g.id===id)?.name||(props.notice?.english_group_id===id?props.notice.english_group:null)||'Nhóm không còn trong danh mục lớp' : 'Không áp dụng';}
</script>
<template>
 <article class="correction-panel">
  <h3>{{notice?.title||'Báo bài'}}</h3><p><strong>{{correctionLabels[correction.status]}}</strong> · Vòng {{correction.round}} / 2 <strong v-if="correction.round===2">— Lần chỉnh sửa cuối</strong></p>
  <p v-if="current && correction.status==='awaiting_author'">Hạn gửi lại: <time :datetime="current.due_at">{{dateLabel(current.due_at)}}</time> (72 giờ từ yêu cầu).</p>
  <p v-if="correction.status==='awaiting_teacher'">Đã gửi lại đúng hạn. Đồng hồ đã dừng trong khi chờ giáo viên.</p>
  <p v-if="expired" role="status">Đã hết hạn phản hồi. Hệ thống xử lý gỡ bài; hãy làm mới để xem trạng thái.</p>
  <div v-for="r in correction.rounds" :key="r.round" class="round">
   <h4>Vòng {{r.round}} · {{r.issue_types.map(x=>issueLabels[x]).join(', ')}}</h4><p class="text">{{r.reason}}</p>
   <details v-if="r.draft"><summary>{{r.submitted_at?'Revision đã gửi lại':'Bản nháp riêng tư'}}</summary>
    <div class="revision-comparison">
     <section v-if="notice" aria-label="Bản hiện tại"><h4>{{open?'Bản đang công khai':'Bản hiện tại'}}</h4>
      <dl><dt>Môn học</dt><dd>{{subjectName(notice.subject_id)}}</dd><dt>Nhóm Tiếng Anh</dt><dd>{{groupName(notice.english_group_id)}}</dd><dt>Hạn bài tập</dt><dd>{{dateLabel(notice.due_at)}}</dd></dl>
      <h4>{{notice.title}}</h4><p class="text">{{notice.content}}</p>
     </section>
     <section :aria-label="r.submitted_at?'Bản gửi lại':'Bản nháp'"><h4>{{r.submitted_at?'Bản gửi lại':'Bản nháp'}}</h4>
      <dl><dt>Môn học</dt><dd>{{subjectName(r.draft.subject_id)}}</dd><dt>Nhóm Tiếng Anh</dt><dd>{{groupName(r.draft.english_group_id)}}</dd><dt>Hạn bài tập</dt><dd>{{dateLabel(r.draft.due_at)}}</dd></dl>
      <h4>{{r.draft.title}}</h4><p class="text">{{r.draft.content}}</p>
     </section>
    </div>
   </details>
   <p v-if="r.decision">{{r.decision==='approved'?'Đạt':'Chưa đạt'}}: {{r.decision_reason}}</p>
  </div>
  <div v-if="notice && open && notice.author_id===userId && role!=='admin'" class="actions">
   <button v-if="correction.status==='awaiting_author'" :disabled="busy||expired" @click="emit('edit',notice)">Sửa và gửi lại GV</button>
   <button :disabled="busy||expired" @click="emit('withdraw',notice)">Xin rút bài</button>
  </div>
  <form v-if="role==='teacher' && correction.status==='awaiting_teacher' && notice" @submit.prevent="decide('rejected')">
   <label>Lý do nếu chưa đạt<textarea v-model="reason" maxlength="2000" :disabled="busy" /></label><div class="actions"><button type="button" :disabled="busy" @click="decide('approved')">Đạt</button><button :disabled="busy||!reason.trim()">{{correction.round===2?'Chưa đạt — System gỡ bài':'Chưa đạt — mở vòng 2'}}</button></div>
  </form>
  <details><summary>Lịch sử xử lý</summary><ul><li v-for="e in correction.events" :key="e.id">{{dateLabel(e.created_at)}} · {{moderationEventLabels[e.event_type]||e.event_type}} · {{e.actor_type==='system'?'System':e.actor_name||'Người dùng'}}<p v-if="e.reason" class="text">{{e.reason}}</p></li></ul></details>
 </article>
</template>
<style scoped>
.revision-comparison{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;margin-top:12px}.revision-comparison section{display:grid;align-content:start;gap:10px;min-width:0;padding:16px;border:1px solid var(--border);border-radius:12px;background:var(--surface)}.revision-comparison dl{display:grid;gap:4px;margin:0}.revision-comparison dt{font-size:.82rem;color:var(--text-secondary)}.revision-comparison dd{margin:0 0 8px;overflow-wrap:anywhere;font-weight:600}@media(max-width:600px){.revision-comparison{grid-template-columns:1fr}}
.correction-panel{display:grid;gap:16px;border:1px solid var(--border);border-radius:var(--radius-lg,18px);background:var(--surface);padding:20px;min-width:0}.correction-panel p,.correction-panel h3,.correction-panel h4{margin:0}.round{display:grid;gap:10px;padding:16px;background:var(--surface-raised);border-radius:12px}.text{white-space:pre-wrap;overflow-wrap:anywhere}.actions{display:flex;gap:12px;flex-wrap:wrap}form,label{display:grid;gap:12px}textarea{font:inherit;max-width:100%;padding:10px;border:1px solid var(--border);background:var(--surface);color:var(--text)}button{min-height:44px;padding:10px 16px;border:1px solid var(--border);border-radius:10px;background:var(--surface);color:var(--text);cursor:pointer}button:disabled{opacity:.5}summary{cursor:pointer;padding:8px 0}li{overflow-wrap:anywhere}button:focus-visible,summary:focus-visible,textarea:focus-visible{outline:3px solid var(--color-primary);outline-offset:2px}
</style>
