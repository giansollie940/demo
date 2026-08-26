<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { X } from 'lucide-vue-next'
import { useAuthStore } from '../../stores/auth'
import { useContextStore } from '../../stores/context'
import { usePreferencesStore } from '../../stores/preferences'
import { buildOwlContextMessages, createQuoteRotator, messageFromQuote, type OwlMessage } from '../../features/owl/owl-model'
import { useDailyQuote } from '../../features/owl/daily-quote'
import { useNowTicker } from '../../features/shared/useNowTicker'

const MAX_PUPIL_OFFSET = 3
const MAX_HEAD_TILT = 5
const FOLLOW_EASE = .18
const auth=useAuthStore(),context=useContextStore(),preferences=usePreferencesStore(),route=useRoute(),dailyQuoteQuery=useDailyQuote(),nowMs=useNowTicker(30_000)
const stage=ref<HTMLElement|null>(null),speechOpen=ref(false),cursor=ref(0),message=ref<OwlMessage|null>(null)
const quoteRotator=createQuoteRotator(undefined,{recentLimit:4})
let raf=0,currentX=0,currentY=0,targetX=0,targetY=0,currentTilt=0,targetTilt=0
const assets=(name:string)=>`${import.meta.env.BASE_URL}assets/images/owl/${name}`
const contextual=computed(()=>auth.legacyState&&auth.currentUser?buildOwlContextMessages({state:auth.legacyState,user:auth.currentUser,path:route.path,weekId:context.selectedWeekId,nowMs:nowMs.value}):[])
const urgent=computed(()=>contextual.value.some(item=>item.urgent))
const mandatoryLearnerAlerts=computed(()=>['student','monitor'].includes(auth.currentUser?.role??''))

function reduceMotion(){return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches===true}
function apply(){if(!stage.value)return;stage.value.style.setProperty('--eye-x',`${currentX.toFixed(2)}px`);stage.value.style.setProperty('--eye-y',`${currentY.toFixed(2)}px`);stage.value.style.setProperty('--head-tilt',`${currentTilt.toFixed(2)}deg`)}
function animate(){raf=0;currentX+=(targetX-currentX)*FOLLOW_EASE;currentY+=(targetY-currentY)*FOLLOW_EASE;currentTilt+=(targetTilt-currentTilt)*FOLLOW_EASE;apply();if(Math.abs(targetX-currentX)>.04||Math.abs(targetY-currentY)>.04||Math.abs(targetTilt-currentTilt)>.04)raf=requestAnimationFrame(animate)}
function schedule(){if(!raf)raf=requestAnimationFrame(animate)}
function pointer(event:PointerEvent){
  if(!stage.value||reduceMotion()||!preferences.owlFollowPointer){targetX=targetY=targetTilt=0;schedule();return}
  const rect=stage.value.getBoundingClientRect(),dx=event.clientX-(rect.left+rect.width/2),dy=event.clientY-(rect.top+rect.height/2),radius=Math.max(rect.width,rect.height)*.7,length=Math.hypot(dx,dy)||1,magnitude=Math.min(1,length/radius)
  targetX=dx/length*MAX_PUPIL_OFFSET*magnitude;targetY=dy/length*MAX_PUPIL_OFFSET*magnitude
  targetTilt=preferences.owlHeadTilt?Math.max(-MAX_HEAD_TILT,Math.min(MAX_HEAD_TILT,dx/(rect.width*.75)*MAX_HEAD_TILT)):0
  schedule()
}
function reset(){targetX=targetY=targetTilt=0;schedule()}
function nextMessage(){
  const contexts=contextual.value
  if(contexts.length&&cursor.value<Math.max(2,contexts.length)){message.value=contexts[cursor.value%contexts.length];cursor.value+=1}
  else if(preferences.owlQuotesEnabled){const online=dailyQuoteQuery.data.value;message.value=messageFromQuote(quoteRotator.next(online?[online]:[]));cursor.value=0}
  else{message.value=contexts[0]??{kind:'tip',text:'Hãy chọn một mục tiêu rõ ràng cho buổi tự học này.'};cursor.value=0}
  speechOpen.value=true
}
function close(){speechOpen.value=false}
function resetContext(){cursor.value=0;message.value=contextual.value[0]??null;if(message.value?.urgent&&(mandatoryLearnerAlerts.value||preferences.owlAutoOpenUrgent))speechOpen.value=true;else if(!message.value?.urgent)speechOpen.value=false}
watch([()=>route.path,()=>context.selectedClassId,()=>context.selectedWeekId,contextual],resetContext)
watch(()=>preferences.owlEnabled,enabled=>{if(!enabled){speechOpen.value=false;reset()}})
watch([()=>preferences.owlFollowPointer,()=>preferences.owlHeadTilt],reset)
onMounted(()=>{window.addEventListener('pointermove',pointer,{passive:true});window.addEventListener('blur',reset);resetContext()})
onBeforeUnmount(()=>{window.removeEventListener('pointermove',pointer);window.removeEventListener('blur',reset);if(raf)cancelAnimationFrame(raf)})
</script>
<template><aside v-if="preferences.owlEnabled" class="wise-owl" :class="{alert:urgent}" aria-label="Cú Thông Thái"><div v-if="speechOpen&&message" class="speech" role="status"><button type="button" aria-label="Đóng lời nhắc" @click="close"><X/></button><b>{{ message.kind==='quote'?'Danh ngôn':'Cú Thông Thái' }}</b><p>{{ message.text }}</p></div><button class="owl-button" type="button" :aria-label="urgent?'Cú Thông Thái có cảnh báo':'Mở Cú Thông Thái'" @click="nextMessage"><span v-if="urgent" class="alert-dot"/><span ref="stage" class="owl-stage"><img class="layer body" :src="assets('body.webp')" alt=""><img class="layer wing left" :src="assets('left-wing.webp')" alt=""><img class="layer wing right" :src="assets('right-wing.webp')" alt=""><span class="head-group"><img class="layer head" :src="assets('head.webp')" alt=""><img class="layer pupil left-pupil" :src="assets('left-pupil.webp')" alt=""><img class="layer pupil right-pupil" :src="assets('right-pupil.webp')" alt=""></span></span></button></aside></template>
<style scoped>
.wise-owl{position:fixed;right:18px;bottom:18px;z-index:55;display:grid;justify-items:end;gap:8px}.owl-button{position:relative;width:112px;height:112px;border:0;background:transparent;padding:0;cursor:pointer;filter:drop-shadow(0 10px 16px color-mix(in srgb,#000 20%,transparent))}.owl-stage{--eye-x:0px;--eye-y:0px;--head-tilt:0deg;position:absolute;inset:0;display:block}.layer{position:absolute;object-fit:contain;pointer-events:none;user-select:none}.body{left:7.5%;top:9.5%;width:85%;height:85%;z-index:10}.wing{top:36.15%;width:38%;height:38%;z-index:20;transform-origin:50% 55%;transition:transform .2s ease}.wing.left{left:12%}.wing.right{left:50%}.head-group{position:absolute;left:24%;top:3.15%;width:52%;height:52%;z-index:25;transform:translateY(0) rotate(var(--head-tilt));transform-origin:50% 65%;will-change:transform}.head{inset:0;width:100%;height:100%}.pupil{width:20.2%;height:20.2%;z-index:31;transform:translate(var(--eye-x),var(--eye-y));will-change:transform}.left-pupil{left:19.33%;top:49.62%}.right-pupil{left:60.29%;top:49.62%}.owl-button:hover .wing.left{transform:rotate(5deg)}.owl-button:hover .wing.right{transform:rotate(-5deg)}.alert-dot{position:absolute;right:8px;top:8px;width:13px;height:13px;border-radius:50%;background:var(--color-danger);box-shadow:0 0 0 5px color-mix(in srgb,var(--color-danger) 18%,transparent);z-index:50;animation:alertPulse 1.8s ease-in-out infinite}.speech{position:relative;width:min(340px,calc(100vw - 32px));padding:14px 38px 14px 15px;border:1px solid var(--border);border-radius:16px;background:var(--surface-raised);box-shadow:var(--shadow-md);color:var(--text)}.speech:after{content:"";position:absolute;right:38px;bottom:-8px;width:14px;height:14px;border-right:1px solid var(--border);border-bottom:1px solid var(--border);background:var(--surface-raised);transform:rotate(45deg)}.speech b{color:var(--color-primary);font-size:.82rem}.speech p{margin:5px 0 0;line-height:1.5;font-size:.9rem}.speech button{position:absolute;right:8px;top:8px;width:28px;height:28px;display:grid;place-items:center;border:0;border-radius:8px;background:transparent;color:var(--text-muted)}.speech button:hover{background:var(--surface-soft);color:var(--text)}.speech svg{width:16px}@keyframes alertPulse{50%{transform:scale(1.12);box-shadow:0 0 0 8px color-mix(in srgb,var(--color-danger) 9%,transparent)}}@media(max-width:760px){.wise-owl{right:10px;bottom:10px}.owl-button{width:88px;height:88px}.speech{width:min(310px,calc(100vw - 20px))}}@media(prefers-reduced-motion:reduce){.head-group,.pupil,.wing,.alert-dot{transition:none!important;animation:none!important;transform:none!important}.owl-button:hover .wing{transform:none!important}}
</style>
