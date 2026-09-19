<script setup lang="ts">
import {ref,watch,onUnmounted} from 'vue';
import {homeworkMedia} from '../../features/homework/api';
const props=defineProps<{classId:string;attachmentId:string;alt?:string}>();
const url=ref(''),loading=ref(false),failed=ref(false),expanded=ref(false);
let generation=0,timer:ReturnType<typeof setTimeout>|undefined;
async function load(){
 const request=++generation;clearTimeout(timer);url.value='';failed.value=false;loading.value=true;
 try{const result=await homeworkMedia('read',{class_id:props.classId,attachment_id:props.attachmentId});
  if(request!==generation)return;
  if(!result.url)throw new Error('Missing image');url.value=result.url;
  timer=setTimeout(()=>void load(),50000);
 }catch{if(request===generation)failed.value=true;}finally{if(request===generation)loading.value=false;}
}
watch(()=>[props.classId,props.attachmentId],()=>{expanded.value=false;void load();},{immediate:true});
onUnmounted(()=>{generation++;clearTimeout(timer);url.value='';});
</script>
<template>
 <figure class="homework-image">
  <p v-if="loading" role="status">Đang tải ảnh…</p>
  <template v-else-if="url && !failed">
   <img :src="url" :alt="alt||'Ảnh đính kèm Báo bài'" :class="{expanded}" referrerpolicy="no-referrer" @error="failed=true">
   <button type="button" :aria-expanded="expanded" @click="expanded=!expanded">{{expanded?'Thu gọn ảnh':'Xem ảnh đầy đủ'}}</button>
  </template>
  <div v-if="failed" role="status"><p>Chưa tải được ảnh hoặc quyền xem đã thay đổi.</p><button type="button" @click="load">Tải lại ảnh</button></div>
 </figure>
</template>
<style scoped>
.homework-image{margin:8px 0;min-width:0;display:grid;gap:8px}.homework-image img{width:100%;max-height:300px;object-fit:contain;border-radius:12px;background:var(--surface-raised);display:block}.homework-image img.expanded{max-height:none}button{justify-self:start;min-height:44px;padding:8px 12px;border:1px solid var(--border);border-radius:10px;color:var(--text);background:var(--surface);cursor:pointer}button:focus-visible{outline:3px solid var(--color-primary);outline-offset:2px}p{margin:0;overflow-wrap:anywhere}
</style>
