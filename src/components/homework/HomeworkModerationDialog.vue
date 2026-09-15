<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import type { Notice } from '../../features/homework/api';
import { correctionPayload, issueLabels } from '../../features/homework/moderation';
const props=defineProps<{ notice:Notice; mode:'report'|'correction_request'|'emergency_remove'|'withdraw'; busy:boolean; error:string }>();
const emit=defineEmits<{ close:[]; submit:[action:string,payload:Record<string,unknown>] }>();
const dialog=ref<HTMLDialogElement>();const reason=ref('');const category=ref('content');const issues=ref<string[]>(['content']);
const emergencyLabels:Record<string,string>={inappropriate_content:'Nội dung không phù hợp',posted_by_mistake:'Đăng nhầm',seriously_incorrect_information:'Thông tin sai nghiêm trọng',other:'Khác'};
const titles={report:'Báo sai thông tin',correction_request:'Yêu cầu chỉnh sửa Báo bài',emergency_remove:'Gỡ bài khẩn cấp',withdraw:'Xin rút bài'};
const categories=computed(()=>props.mode==='emergency_remove'?emergencyLabels:issueLabels);
const valid=computed(()=>props.mode==='report'||(reason.value.trim().length>0&&(props.mode!=='correction_request'||issues.value.length>0)));
let previous:HTMLElement|null=null;
onMounted(()=>{previous=document.activeElement as HTMLElement; if(props.mode==='emergency_remove')category.value='inappropriate_content';dialog.value?.showModal();});
onUnmounted(()=>previous?.focus());
function submit(){if(props.busy||!valid.value)return;const p:Record<string,unknown>={id:props.notice.id};
 if(props.mode==='report'){p.category=category.value;p.note=reason.value;}
 else {p.reason=reason.value;if(props.mode==='correction_request')p.issue_types=issues.value;if(props.mode==='emergency_remove')p.category=category.value;
  if(props.mode==='withdraw'&&props.notice.correction)Object.assign(p,correctionPayload(props.notice.id,props.notice.correction));}
 emit('submit',props.mode,p);
}
</script>
<template>
 <dialog ref="dialog" class="moderation-dialog" aria-labelledby="moderation-title" @cancel.prevent="!busy && emit('close')">
  <form @submit.prevent="submit">
   <h2 id="moderation-title">{{titles[mode]}}</h2><p>{{notice.title}}</p>
   <p v-if="mode==='report'">Chỉ giáo viên phụ trách lớp được xem danh tính người báo.</p>
   <p v-if="mode==='emergency_remove'">Chỉ dùng khi cần can thiệp ngay. Với lỗi thông thường, hãy gửi yêu cầu chỉnh sửa.</p>
   <p v-if="mode==='withdraw'">Bài sẽ được chuyển vào thùng rác; yêu cầu chỉnh sửa được đóng và giáo viên thấy lý do rút bài.</p>
   <fieldset v-if="mode==='correction_request'" :disabled="busy"><legend>Nội dung cần chỉnh sửa</legend><label v-for="key in ['deadline','subject','content','other']" :key="key"><input v-model="issues" type="checkbox" :value="key"> {{issueLabels[key]}}</label></fieldset>
   <label v-else-if="mode!=='withdraw'">Phân loại<select v-model="category" :disabled="busy"><option v-for="(label,key) in categories" :key="key" :value="key">{{label}}</option></select></label>
   <label>{{mode==='report'?'Ghi chú (không bắt buộc)':'Lý do / hướng dẫn bắt buộc'}}<textarea v-model="reason" :required="mode!=='report'" :disabled="busy" maxlength="2000" rows="4" /></label>
   <p v-if="error" role="alert">{{error}}</p>
   <footer><button type="button" :disabled="busy" @click="emit('close')">Hủy</button><button :disabled="busy||!valid">{{busy?'Đang lưu…':titles[mode]}}</button></footer>
  </form>
 </dialog>
</template>
<style scoped>
.moderation-dialog{width:min(560px,calc(100vw - 32px));max-height:90vh;overflow:auto;box-sizing:border-box;border:1px solid var(--border);border-radius:var(--radius-lg,18px);padding:24px;color:var(--text);background:var(--surface)}.moderation-dialog::backdrop{background:#15213180}form{display:grid;gap:16px}h2,p{margin:0}label{display:grid;gap:8px}fieldset label{display:flex;align-items:center;margin:8px 0}textarea,select{font:inherit;box-sizing:border-box;max-width:100%;width:100%;background:var(--surface);color:var(--text);border:1px solid var(--border);border-radius:8px;padding:10px}footer{display:flex;justify-content:flex-end;gap:12px}button{min-height:44px;padding:8px 16px;cursor:pointer;border:1px solid var(--border);border-radius:10px;color:var(--text);background:var(--surface-raised)}button:disabled{opacity:.5;cursor:default}[role=alert]{color:var(--color-danger)}button:focus-visible,input:focus-visible,textarea:focus-visible,select:focus-visible{outline:3px solid var(--color-primary);outline-offset:2px}
</style>
