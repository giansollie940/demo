<script setup lang="ts">
import type { OwlCameoPhase } from '../../features/login/flashlight'

defineProps<{ phase: OwlCameoPhase; eyesClosed: boolean; x: number; y: number; size: number }>()
const asset = (name: string) => `${import.meta.env.BASE_URL}assets/images/owl/${name}`
</script>

<template>
  <div
    v-if="phase !== 'hidden'"
    class="login-owl"
    :class="[phase, { closed: eyesClosed }]"
    :style="{ left: `${x}px`, top: `${y}px`, '--owl-size': `${size}px` }"
    aria-hidden="true"
  >
    <img :src="asset('body.webp')" alt="" class="body" />
    <img :src="asset('left-wing.webp')" alt="" class="wing left" />
    <img :src="asset('right-wing.webp')" alt="" class="wing right" />
    <span class="head">
      <img :src="asset('head.webp')" alt="" class="face" />
      <img :src="asset('left-pupil.webp')" alt="" class="pupil left" />
      <img :src="asset('right-pupil.webp')" alt="" class="pupil right" />
    </span>
  </div>
</template>

<style scoped>
/* Layer geometry mirrors OwlMascotV2 so both owls share the same artwork. */
.login-owl {
  position: fixed;
  /* Under the night overlay (40): the owl is only seen where the beam lights it, and flies off
     into the dark. Still above the page content. */
  z-index: 39;
  width: var(--owl-size);
  height: var(--owl-size);
  pointer-events: none;
  filter: drop-shadow(0 10px 18px rgb(3 10 24 / .45));
}
.login-owl img { position: absolute; object-fit: contain; }
.body { left: 7.5%; top: 9.5%; width: 85%; height: 85%; }
/* Each wing is a narrow feather centred in its square image; it hinges at the top of that
   feather (the shoulder), so a flap swings it out past the body. */
.wing { top: 36%; width: 38%; height: 38%; transform-origin: 50% 14%; }
.wing.left { left: 12%; }
.wing.right { left: 50%; }
.head { position: absolute; left: 24%; top: 3%; width: 52%; height: 52%; }
.face { inset: 0; width: 100%; height: 100%; }
.pupil { width: 20%; height: 20%; top: 50%; transform-origin: center; transition: scale 60ms ease; }
.pupil.left { left: 19%; }
.pupil.right { left: 60%; }
.closed .pupil { scale: 1 .12; }

.appear { animation: owl-appear 300ms cubic-bezier(.2, .8, .3, 1.2) both; }
.fly { animation: owl-fly 850ms cubic-bezier(.45, 0, .6, 1) forwards; }
/* Keeps flapping for the whole flight, not just the take-off. */
.fly .wing.left { animation: owl-flap-left 190ms ease-in-out infinite; }
.fly .wing.right { animation: owl-flap-right 190ms ease-in-out infinite; }

@keyframes owl-appear {
  from { opacity: 0; transform: translateY(10px) scale(.85); }
  to { opacity: 1; transform: none; }
}
@keyframes owl-fly {
  0% { opacity: 1; transform: none; }
  45% { opacity: 1; transform: translate(70px, -95px) rotate(10deg) scale(.9); }
  100% { opacity: 0; transform: translate(200px, -180px) rotate(20deg) scale(.65); }
}
@keyframes owl-flap-left { 0%, 100% { rotate: 20deg; translate: -8% 0; } 50% { rotate: 80deg; translate: -22% -10%; } }
@keyframes owl-flap-right { 0%, 100% { rotate: -20deg; translate: 8% 0; } 50% { rotate: -80deg; translate: 22% -10%; } }

@media (prefers-reduced-motion: reduce) {
  .appear { animation: owl-fade-in 200ms ease both; }
  .fly { animation: owl-fade-out 300ms ease forwards; }
  .fly .wing.left, .fly .wing.right { animation: none; }
  @keyframes owl-fade-in { from { opacity: 0; } }
  @keyframes owl-fade-out { to { opacity: 0; } }
}
</style>
