<script setup lang="ts">
import { onMounted, ref } from 'vue'

/** Day: the sun rises over a horizon with slowly turning rays. Night: the moon fades in with twinkling stars. */
defineProps<{ night: boolean }>()
// Start below the horizon and rise on the first frame, so the sun also rises when the page opens.
const ready = ref(false)
onMounted(() => requestAnimationFrame(() => { ready.value = true }))
const rays = Array.from({ length: 12 }, (_, i) => i * 30)
</script>

<template>
  <div class="sky" :class="{ ready, night }" aria-hidden="true">
    <div class="horizon">
      <svg class="sun" viewBox="0 0 100 100">
        <defs>
          <radialGradient id="login-sun-core" cx=".42" cy=".38" r=".7">
            <stop offset="0" stop-color="#fff7c2" />
            <stop offset=".55" stop-color="#ffd05a" />
            <stop offset="1" stop-color="#ffa630" />
          </radialGradient>
        </defs>
        <g class="rays">
          <rect v-for="deg in rays" :key="deg" x="48" y="4" width="4" height="13" rx="2" fill="#ffc247" :transform="`rotate(${deg} 50 50)`" />
        </g>
        <circle cx="50" cy="50" r="23" fill="url(#login-sun-core)" />
      </svg>
    </div>
    <svg class="moon" viewBox="0 0 100 100">
      <defs>
        <mask id="login-moon-cut">
          <rect width="100" height="100" fill="#fff" />
          <circle cx="62" cy="40" r="22" fill="#000" />
        </mask>
        <radialGradient id="login-moon-core" cx=".35" cy=".4" r=".75">
          <stop offset="0" stop-color="#fffdf0" />
          <stop offset="1" stop-color="#ffe7a3" />
        </radialGradient>
      </defs>
      <circle cx="50" cy="52" r="27" fill="url(#login-moon-core)" mask="url(#login-moon-cut)" />
      <path class="star s1" d="M84 16l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" fill="#fff6cd" />
      <path class="star s2" d="M20 20l1.5 3.5 3.5 1.5-3.5 1.5-1.5 3.5-1.5-3.5-3.5-1.5 3.5-1.5z" fill="#fff6cd" />
      <path class="star s3" d="M88 72l1.5 3.5 3.5 1.5-3.5 1.5-1.5 3.5-1.5-3.5-3.5-1.5 3.5-1.5z" fill="#fff6cd" />
    </svg>
  </div>
</template>

<style scoped>
.sky {
  position: absolute;
  z-index: 42;
  top: 118px;
  right: calc(clamp(400px, 28vw, 456px) + 28px);
  width: 96px;
  height: 96px;
  pointer-events: none;
}

/* Clips only the bottom edge, so the sun climbs out from behind a horizon while its glow stays free. */
.horizon {
  position: absolute;
  inset: 0;
  clip-path: inset(-60% -60% 0 -60%);
}

.sun,
.moon {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: visible;
  opacity: 0;
}

.sun {
  transform: translateY(95%) scale(.85);
  filter: drop-shadow(0 0 14px rgb(255 190 70 / .75));
  transition: transform 1200ms cubic-bezier(.2, .75, .25, 1), opacity 700ms ease;
}

.ready:not(.night) .sun {
  opacity: 1;
  transform: none;
}

.rays {
  transform-origin: 50px 50px;
  animation: sun-spin 30s linear infinite;
}

.moon {
  transform: translateY(-12px) scale(.7) rotate(-25deg);
  filter: drop-shadow(0 0 14px rgb(255 246 205 / .65));
  transition: transform 1000ms cubic-bezier(.2, .75, .25, 1), opacity 800ms ease;
}

.ready.night .moon {
  opacity: 1;
  transform: none;
}

.star { transform-box: fill-box; transform-origin: center; animation: twinkle 2.6s ease-in-out infinite; }
.s2 { animation-delay: .8s; }
.s3 { animation-delay: 1.6s; }

@keyframes sun-spin { to { rotate: 360deg; } }
@keyframes twinkle { 0%, 100% { opacity: .35; scale: .7; } 50% { opacity: 1; scale: 1; } }

@media (max-width: 980px) {
  .sky { top: 22px; right: 84px; width: 52px; height: 52px; }
}

@media (max-width: 560px) {
  .sky { top: 16px; right: 64px; width: 44px; height: 44px; }
}

@media (prefers-reduced-motion: reduce) {
  .sun, .moon { transform: none; transition: opacity 300ms ease; }
  .rays, .star { animation: none; }
}
</style>
