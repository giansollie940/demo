import {ref,watch,onUnmounted} from 'vue';
import {homeworkMedia,type Notice,type Correction} from './api';
import {compressImage} from './image';
import {ensureUploaded,type UploadImage} from './media-upload';
import {draftStore,type MediaDraft} from './media-draft';
export function useMediaComposer(form:Record<string,unknown>,scope:()=>{ownerId:string;classId:string},isOpen:()=>boolean){
 const image=ref<UploadImage|null>(null),attachmentId=ref<string|null>(null),changed=ref(false),preview=ref('');
 const compressing=ref(false),note=ref(''),failure=ref(''),recoverable=ref<MediaDraft|null>(null);
 let key='',baseVersion='',operationId:string=crypto.randomUUID(),generation=0,hydrating=false,stopped=false,timer:ReturnType<typeof setTimeout>|undefined;
 const snapshot=():MediaDraft=>({form:JSON.parse(JSON.stringify(form)),image:image.value?{...image.value}:null,attachmentId:attachmentId.value,changed:changed.value,operationId,baseVersion,savedAt:Date.now()});
 async function persist(){if(!key||stopped)return;try{await draftStore('put',key,snapshot());}catch{note.value='Không lưu được bản nháp trên thiết bị này. Giữ trang mở cho đến khi gửi xong.';}}
 function setPreview(){if(preview.value)URL.revokeObjectURL(preview.value);preview.value=image.value?URL.createObjectURL(image.value.blob):'';}
 function open(n:Notice|undefined,c:Correction|null){
  generation++;compressing.value=false;hydrating=true;stopped=false;clearTimeout(timer);image.value=null;changed.value=false;failure.value='';note.value='';recoverable.value=null;operationId=crypto.randomUUID();
  const round=c?.rounds.find(r=>r.round===c.round);
  attachmentId.value=round?.media_set?round.attachment_id||null:n?.attachment_id||null;
  baseVersion=c?`${c.id}:${c.round}:${c.version}`:String(n?.revision||0);
  key=[scope().ownerId,scope().classId,n?.id||'new',c?`${c.id}:${c.round}`:'notice'].join(':');setPreview();
  const request=generation,savedKey=key;
  void draftStore('get',savedKey).then(saved=>{
   if(request!==generation||!saved)return;
   if(saved.baseVersion===baseVersion){recoverable.value=saved;note.value='Có bản nháp trên thiết bị. Bạn có thể khôi phục trước khi sửa tiếp.';}
   else note.value='Bài đã có phiên bản mới; bản nháp cũ không được tự áp dụng.';
  }).catch(()=>{if(request===generation)note.value='Thiết bị không hỗ trợ lưu bản nháp; hãy giữ trang mở khi gửi.';});
  // Suppress the queued watcher from compose() initialization.
  queueMicrotask(()=>{hydrating=false;});
 }
 function restore(){const saved=recoverable.value;if(!saved||saved.baseVersion!==baseVersion)return;
  hydrating=true;Object.assign(form,saved.form);image.value=saved.image;attachmentId.value=saved.attachmentId;changed.value=saved.changed;operationId=saved.operationId;recoverable.value=null;setPreview();note.value='Đã khôi phục bản nháp.';queueMicrotask(()=>hydrating=false);
 }
 async function choose(file:File){
  if(compressing.value)return;
  const request=++generation;compressing.value=true;failure.value='';
  try{const converted=await compressImage(file);if(request!==generation)return;
   if(image.value?.pendingId)await cancelPending();
   if(request!==generation)return;
   image.value={...converted,pendingId:'',uploaded:false,verified:false};changed.value=true;operationId=crypto.randomUUID();recoverable.value=null;setPreview();await persist();
  }catch(e){if(request===generation)failure.value=e instanceof Error?e.message:'Chưa xử lý được ảnh.';}finally{if(request===generation)compressing.value=false;}
 }
 async function cancelPending(){if(image.value?.pendingId)await homeworkMedia('cancel',{class_id:scope().classId,attachment_id:image.value.pendingId});}
 async function remove(){
  if(compressing.value)return;
  const request=++generation;compressing.value=true;failure.value='';
  try{
   try{await cancelPending();}catch{if(request===generation)note.value='Chưa kết nối được để dọn ảnh chờ; ảnh sẽ hết hạn sau 24 giờ và hệ thống sẽ thử dọn lại. Bạn vẫn có thể gửi nội dung chữ.';}
   if(request!==generation)return;
   image.value=null;attachmentId.value=null;changed.value=true;operationId=crypto.randomUUID();recoverable.value=null;setPreview();await persist();
  }finally{if(request===generation)compressing.value=false;}
 }
 async function payload(binding:Record<string,unknown>){
  if(compressing.value)throw new Error('Ảnh đang được xử lý.');
  failure.value='';
  if(image.value){try{
   const id=await ensureUploaded(image.value,binding,{call:homeworkMedia,persist,put:async(url,blob)=>{
    const response=await fetch(url,{method:'PUT',headers:{'Content-Type':'image/webp'},body:blob,signal:AbortSignal.timeout(45000)});
    if(!response.ok)throw new Error('Kho ảnh tạm thời không nhận được ảnh.');
   }});return {attachment_id:id,media_operation_id:operationId};
  }catch(e){failure.value='Chưa gửi được ảnh. Thử gửi lại để tiếp tục lượt tải, hoặc bỏ ảnh và gửi nội dung chữ.';throw e;}}
  return changed.value?{attachment_id:attachmentId.value,media_operation_id:operationId}:{};
 }
 async function committed(c?:Correction){
  clearTimeout(timer);stopped=true;
  if(image.value?.pendingId)attachmentId.value=image.value.pendingId;
  image.value=null;changed.value=false;recoverable.value=null;failure.value='';setPreview();
  try{await draftStore('delete',key);}catch{}
  if(c){baseVersion=`${c.id}:${c.round}:${c.version}`;operationId=crypto.randomUUID();stopped=false;}
 }
 watch(()=>JSON.stringify(form),()=>{if(hydrating||!isOpen()||stopped)return;operationId=crypto.randomUUID();clearTimeout(timer);timer=setTimeout(()=>void persist(),300);});
 function close(){clearTimeout(timer);generation++;compressing.value=false;if(!stopped)void persist();}
 onUnmounted(()=>{close();if(preview.value)URL.revokeObjectURL(preview.value);});
 return {image,attachmentId,changed,preview,compressing,note,failure,recoverable,open,restore,choose,remove,payload,committed,persist,close};
}
