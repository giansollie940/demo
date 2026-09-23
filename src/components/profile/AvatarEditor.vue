<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Check, Move, X, ZoomIn } from 'lucide-vue-next'
import AppButton from '../ui/AppButton.vue'
import { AVATAR_OUTPUT_SIZE, avatarSourceRect, normalizeAvatarTransform } from '../../features/profile/avatar-image.js'

const props=defineProps<{file:File}>()
const emit=defineEmits<{save:[blob:Blob];cancel:[]}>()

const viewport=ref<HTMLElement|null>(null)
const image=ref<HTMLImageElement|null>(null)
const imageUrl=ref('')
const naturalWidth=ref(1)
const naturalHeight=ref(1)
const viewportSize=ref(300)
const zoom=ref(1)
const panX=ref(0)
const panY=ref(0)
const busy=ref(false)
const error=ref('')
let resizeObserver:ResizeObserver|null=null
let dragStart:{x:number;y:number;panX:number;panY:number}|null=null

const transform=computed(()=>normalizeAvatarTransform({naturalWidth:naturalWidth.value,naturalHeight:naturalHeight.value,viewportSize:viewportSize.value,zoom:zoom.value,panX:panX.value,panY:panY.value}))
const imageStyle=computed(()=>({
  width:`${transform.value.renderedWidth}px`,
  height:`${transform.value.renderedHeight}px`,
  transform:`translate(calc(-50% + ${transform.value.panX}px), calc(-50% + ${transform.value.panY}px))`,
}))

function syncViewport(){const size=viewport.value?.clientWidth||300;viewportSize.value=size;applyTransform()}
function applyTransform(){const next=normalizeAvatarTransform({naturalWidth:naturalWidth.value,naturalHeight:naturalHeight.value,viewportSize:viewportSize.value,zoom:zoom.value,panX:panX.value,panY:panY.value});panX.value=next.panX;panY.value=next.panY}
function releaseUrl(){if(imageUrl.value){URL.revokeObjectURL(imageUrl.value);imageUrl.value=''}}
function loadFile(file:File){releaseUrl();error.value='';zoom.value=1;panX.value=0;panY.value=0;imageUrl.value=URL.createObjectURL(file)}
function onImageLoad(event:Event){const element=event.target as HTMLImageElement;image.value=element;naturalWidth.value=element.naturalWidth||1;naturalHeight.value=element.naturalHeight||1;nextTick(syncViewport)}
function onZoom(){applyTransform()}
function pointerDown(event:PointerEvent){if(busy.value)return;(event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);dragStart={x:event.clientX,y:event.clientY,panX:panX.value,panY:panY.value}}
function pointerMove(event:PointerEvent){if(!dragStart)return;panX.value=dragStart.panX+(event.clientX-dragStart.x);panY.value=dragStart.panY+(event.clientY-dragStart.y);applyTransform()}
function pointerUp(){dragStart=null}
async function save(){if(!image.value)return;busy.value=true;error.value='';try{const rect=avatarSourceRect({naturalWidth:naturalWidth.value,naturalHeight:naturalHeight.value,viewportSize:viewportSize.value,zoom:zoom.value,panX:panX.value,panY:panY.value});const canvas=document.createElement('canvas');canvas.width=AVATAR_OUTPUT_SIZE;canvas.height=AVATAR_OUTPUT_SIZE;const context=canvas.getContext('2d',{alpha:false});if(!context)throw new Error('Trình duyệt không hỗ trợ xử lý ảnh.');context.drawImage(image.value,rect.sx,rect.sy,rect.sWidth,rect.sHeight,0,0,AVATAR_OUTPUT_SIZE,AVATAR_OUTPUT_SIZE);const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(new Error('Không thể tạo ảnh WEBP.')),'image/webp',.9));emit('save',blob)}catch(err){error.value=err instanceof Error?err.message:'Không xử lý được ảnh.'}finally{busy.value=false}}

watch(()=>props.file,file=>loadFile(file),{immediate:true})
onMounted(()=>{resizeObserver=new ResizeObserver(syncViewport);if(viewport.value)resizeObserver.observe(viewport.value);window.addEventListener('resize',syncViewport,{passive:true})})
onBeforeUnmount(()=>{resizeObserver?.disconnect();window.removeEventListener('resize',syncViewport);releaseUrl()})
</script>

<template>
  <div class="avatar-editor-backdrop" role="presentation" @pointerup="pointerUp">
    <section class="avatar-editor" role="dialog" aria-modal="true" aria-labelledby="avatar-editor-title">
      <header><div><span>ẢNH ĐẠI DIỆN</span><h2 id="avatar-editor-title">Cắt và căn ảnh</h2></div><button type="button" class="close" aria-label="Đóng" @click="emit('cancel')"><X/></button></header>
      <div ref="viewport" class="crop-viewport" @pointerdown="pointerDown" @pointermove="pointerMove" @pointerup="pointerUp" @pointercancel="pointerUp">
        <img v-if="imageUrl" :src="imageUrl" :style="imageStyle" class="crop-image" alt="Ảnh đang chỉnh" draggable="false" @load="onImageLoad">
        <span class="crop-ring" aria-hidden="true"></span>
        <span class="drag-hint"><Move/>Kéo để căn</span>
      </div>
      <label class="zoom-row"><ZoomIn/><span>Thu phóng</span><input v-model.number="zoom" type="range" min="1" max="3" step="0.01" @input="onZoom"></label>
      <p class="preview-note">Ảnh sẽ được lưu ở kích thước 512 × 512 px, định dạng WEBP.</p>
      <p v-if="error" class="editor-error">{{ error }}</p>
      <footer><AppButton type="button" variant="secondary" @click="emit('cancel')">Hủy</AppButton><AppButton type="button" :loading="busy" @click="save"><Check/>Lưu ảnh</AppButton></footer>
    </section>
  </div>
</template>

<style scoped>
.avatar-editor-backdrop{position:fixed;z-index:400;inset:0;display:grid;place-items:center;padding:18px;background:rgb(19 16 28/.62);backdrop-filter:blur(8px)}.avatar-editor{width:min(520px,calc(100dvw - 24px));max-height:calc(100dvh - 24px);overflow:auto;padding:18px;border:1px solid var(--border);border-radius:24px;background:var(--surface-raised);color:var(--text);box-shadow:0 28px 80px rgb(0 0 0/.28)}header{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;margin-bottom:16px}header span{color:var(--color-primary);font-size:var(--font-size-ui-min);font-weight:850;letter-spacing:.08em}header h2{margin:4px 0 0}.close{width:40px;height:40px;display:grid;place-items:center;border:1px solid var(--border);border-radius:999px;background:var(--surface);color:var(--text);cursor:pointer}.close svg{width:19px}.crop-viewport{position:relative;width:min(300px,72dvw);aspect-ratio:1;margin:0 auto;overflow:hidden;touch-action:none;cursor:grab;border-radius:22px;background:var(--surface-soft);box-shadow:inset 0 0 0 1px var(--border)}.crop-viewport:active{cursor:grabbing}.crop-image{position:absolute;left:50%;top:50%;max-width:none;object-fit:fill;user-select:none;pointer-events:none}.crop-ring{position:absolute;inset:9%;border:2px solid rgb(255 255 255/.9);border-radius:999px;box-shadow:0 0 0 999px rgb(0 0 0/.18);pointer-events:none}.drag-hint{position:absolute;left:50%;bottom:12px;transform:translateX(-50%);display:flex;align-items:center;gap:6px;padding:6px 9px;border-radius:999px;background:rgb(20 18 30/.62);color:white;font-size:var(--font-size-ui-min);font-weight:800;white-space:nowrap;pointer-events:none}.drag-hint svg,.zoom-row svg{width:17px}.zoom-row{display:grid;grid-template-columns:auto auto 1fr;align-items:center;gap:8px;margin-top:17px;font-weight:800}.zoom-row input{width:100%}.preview-note{margin:10px 0 0;color:var(--text-muted);font-size:var(--font-size-ui-min)}.editor-error{margin:10px 0 0;color:var(--color-danger);font-weight:750}footer{display:flex;justify-content:flex-end;gap:9px;margin-top:18px}@media(max-width:520px){.avatar-editor-backdrop{padding:10px}.avatar-editor{width:calc(100dvw - 20px);padding:15px;border-radius:20px}footer{display:grid;grid-template-columns:1fr 1fr}footer :deep(.app-button){width:100%}}
</style>
