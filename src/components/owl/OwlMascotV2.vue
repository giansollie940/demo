<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { X } from 'lucide-vue-next'
import { useAuthStore } from '../../stores/auth'
import { useContextStore } from '../../stores/context'
import { usePreferencesStore } from '../../stores/preferences'
import { buildOwlContextMessages } from '../../features/owl/owl-model'
import { createOwlMascotController } from '../../features/owl/mascot-v2'
import { useHomeworkViewStore } from '../../features/homework/view-context'

const auth = useAuthStore(), context = useContextStore(), preferences = usePreferencesStore(), route = useRoute(), homework = useHomeworkViewStore()
const controller = createOwlMascotController()
const view = ref({ ...controller.state })
const stage = ref<HTMLElement | null>(null)
const failed = ref(false)
const reduced = ref(false)
const waving = ref(false)
const paused = ref(false)
const deviceTab = computed(() => route.path === '/admin' && (route.query.tab === 'device' || route.query.tab === 'schedule' && route.query.scheduleTab === 'device'))
const messages = computed(() => auth.currentUser ? buildOwlContextMessages({ state: auth.legacyState, user: auth.currentUser, path: route.path, homeworkTab: homework.selectedTab, weekId: context.selectedWeekId, deviceTab: deviceTab.value }) : [])
const assets = (name: string) => `${import.meta.env.BASE_URL}assets/images/owl/${name}`
const direction = computed(() => view.value.direction)
const reaction = computed(() => view.value.reaction)
let frame = 0
let waveTimer: ReturnType<typeof setTimeout> | undefined
let motionQuery: MediaQueryList | undefined
function motionChanged() { reduced.value = motionQuery?.matches ?? false }
function visibilityChanged() { paused.value = document.visibilityState === 'hidden' }
let lastPoint: { x: number; y: number } | null = null
function sync() { view.value = { ...controller.state } }
function close() { controller.dispatch({ type: 'close' }); sync() }
function click() {
  waving.value = true
  if (waveTimer) clearTimeout(waveTimer)
  waveTimer = setTimeout(() => { waving.value = false }, 900)
  controller.dispatch({ type: 'click' })
  const next = messages.value.find(message => message.kind === 'urgent') ?? (deviceTab.value ? messages.value.find(message => message.kind === 'page') : null) ?? messages.value[0]
  if (next) controller.dispatch({ type: 'message', message: next })
  sync()
}
function point(event: PointerEvent) {
  if (event.pointerType === 'touch' || reduced.value || !preferences.owlFollowPointer || !stage.value) return
  lastPoint = { x: event.clientX, y: event.clientY }
  if (frame) return
  frame = requestAnimationFrame(() => {
    frame = 0
    if (!stage.value || !lastPoint) return
    const rect = stage.value.getBoundingClientRect()
    controller.pointAt(lastPoint.x - rect.left - rect.width / 2, lastPoint.y - rect.top - rect.height / 2)
    sync()
  })
}
function lookAt(target: HTMLElement | null) {
  if (!target || !stage.value) return
  const rect = stage.value.getBoundingClientRect()
  controller.lookAt(target, { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 })
  sync()
}
watch([() => route.fullPath, () => context.selectedClassId, () => context.selectedWeekId], () => {
  controller.reset()
  const next = messages.value.find(message => message.kind === 'urgent')
  if (next) controller.dispatch({ type: 'message', message: next })
  sync()
})
onMounted(() => {
  motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
  motionChanged()
  motionQuery.addEventListener('change', motionChanged)
  visibilityChanged()
  document.addEventListener('visibilitychange', visibilityChanged)
  window.addEventListener('pointermove', point, { passive: true })
  const next = messages.value.find(message => message.kind === 'urgent')
  if (next) controller.dispatch({ type: 'message', message: next })
  sync()
})
onBeforeUnmount(() => {
  window.removeEventListener('pointermove', point)
  document.removeEventListener('visibilitychange', visibilityChanged)
  motionQuery?.removeEventListener('change', motionChanged)
  if (frame) cancelAnimationFrame(frame)
  if (waveTimer) clearTimeout(waveTimer)
})
defineExpose({ lookAt })
</script>
<template>
  <aside v-if="preferences.owlEnabled && !failed" class="mascot-v2" :class="{ waving, paused, 'no-motion': reduced, 'no-tilt': !preferences.owlHeadTilt }" aria-label="Cú Thông Thái">
    <div v-if="view.bubble" class="bubble" role="status"><button type="button" aria-label="Đóng lời nhắc" @click="close"><X/></button><b>Cú Thông Thái</b><p>{{ view.bubble.text }}</p></div>
    <button type="button" class="mascot-button" :data-direction="direction" :data-reaction="reaction" aria-label="Mở Cú Thông Thái" @click="click">
      <span ref="stage" class="mascot-stage"><img :src="assets('body.webp')" alt="" class="body" @error="failed=true"><img :src="assets('left-wing.webp')" alt="" class="wing left" @error="failed=true"><img :src="assets('right-wing.webp')" alt="" class="wing right" @error="failed=true"><span class="head"><img :src="assets('head.webp')" alt="" class="face" @error="failed=true"><img :src="assets('left-pupil.webp')" alt="" class="pupil left" @error="failed=true"><img :src="assets('right-pupil.webp')" alt="" class="pupil right" @error="failed=true"></span></span>
    </button>
  </aside>
</template>
<style scoped>
.mascot-v2{position:fixed;right:18px;bottom:18px;z-index:80;display:grid;justify-items:end;gap:8px;pointer-events:none}.mascot-v2>*{pointer-events:auto}.mascot-button{position:relative;width:150px;height:150px;border:0;background:transparent;cursor:pointer;filter:drop-shadow(0 10px 16px color-mix(in srgb,#000 20%,transparent))}.mascot-stage{position:absolute;inset:0}.mascot-stage img{position:absolute;object-fit:contain;pointer-events:none}.body{left:7.5%;top:9.5%;width:85%;height:85%}.wing{top:36%;width:38%;height:38%}.wing.left{left:12%}.wing.right{left:50%}.head{position:absolute;left:24%;top:3%;width:52%;height:52%;transition:transform .18s ease}.face{inset:0;width:100%;height:100%}.pupil{width:20%;height:20%;transition:transform .18s ease}.pupil.left{left:19%;top:50%}.pupil.right{left:60%;top:50%}.mascot-button[data-direction*="left"] .pupil{transform:translateX(-14%)}.mascot-button[data-direction*="right"] .pupil{transform:translateX(14%)}.mascot-button[data-direction^="top"] .pupil{translate:0 -15%}.mascot-button[data-direction^="bottom"] .pupil{translate:0 15%}.mascot-button[data-direction="top"] .pupil{translate:0 -15%}.mascot-button[data-direction="bottom"] .pupil{translate:0 15%}.mascot-button[data-reaction="happy"] .head,.mascot-button[data-reaction="celebrate"] .head{transform:rotate(8deg)}.mascot-button[data-reaction="thinking"] .head,.mascot-button[data-reaction="wise"] .head{transform:rotate(-5deg)}.mascot-button[data-reaction="surprised"] .head{transform:scale(1.08)}.mascot-button[data-reaction="warning"]{filter:drop-shadow(0 0 14px var(--color-danger))}.mascot-button[data-reaction="sleepy"] .pupil,.mascot-button[data-reaction="blink"] .pupil{opacity:.35}.mascot-button[data-reaction="neutral"] .head{transform:none}.bubble{position:relative;width:min(340px,calc(100vw - 32px));padding:14px 38px 14px 15px;border:1px solid var(--border);border-radius:16px;background:var(--surface-raised);box-shadow:var(--shadow-md);color:var(--text)}.bubble b{color:var(--color-primary)}.bubble p{margin:5px 0 0;line-height:1.5}.bubble button{position:absolute;right:8px;top:8px;width:28px;height:28px;border:0;background:transparent;color:var(--text-muted)}.bubble svg{width:16px}@media(max-width:760px){.mascot-v2{right:10px;bottom:calc(12px + env(safe-area-inset-bottom))}.mascot-button{width:96px;height:96px}}@media(prefers-reduced-motion:reduce){.mascot-v2 *{transition:none!important;animation:none!important}}

.mascot-stage{animation:owl-breathe 3.6s ease-in-out infinite;transform-origin:50% 90%}
.head{transform-origin:50% 70%;animation:owl-head-idle 6s ease-in-out infinite}
.wing{transform-origin:50% 25%}
.pupil{animation:owl-blink 5.4s ease-in-out infinite;transform-origin:center}
.mascot-button[data-direction*="left"] .head{rotate:-7deg}
.mascot-button[data-direction*="right"] .head{rotate:7deg}
.mascot-button:hover .wing.left,.mascot-button:focus-visible .wing.left,.waving .wing.left{animation:owl-wave-left .42s ease-in-out 2}
.mascot-button:hover .wing.right,.mascot-button:focus-visible .wing.right,.waving .wing.right{animation:owl-wave-right .42s ease-in-out 2}
.mascot-button:focus-visible{outline:2px solid var(--color-primary);outline-offset:3px;border-radius:24px}
@keyframes owl-breathe{0%,100%{transform:translateY(0)}50%{transform:translateY(-7px)}}
@keyframes owl-head-idle{0%,65%,100%{translate:0 0}75%,85%{translate:0 -3px}}
@keyframes owl-blink{0%,42%,46%,100%{scale:1 1}44%{scale:1 .12}}
@keyframes owl-wave-left{0%,100%{transform:rotate(0)}50%{transform:rotate(24deg)}}
@keyframes owl-wave-right{0%,100%{transform:rotate(0)}50%{transform:rotate(-24deg)}}
.paused *{animation-play-state:paused!important}
.no-tilt .head{rotate:0deg!important}
.no-motion *{animation:none!important;transition:none!important}
@media(prefers-reduced-motion:reduce){.mascot-v2 *{animation:none!important;transition:none!important;rotate:none!important;translate:none!important}}
</style>
