<script setup lang="ts">
import { onMounted, ref } from 'vue'

/**
 * Sits at the hero's top-right corner. Day: the sun rises, its halo breathing and
 * rays shimmering, with sparkles around it. Night: the moon fades in with a soft halo, twinkling
 * stars and the odd shooting star.
 */
defineProps<{ night: boolean }>()
// Start low and faded, then rise on the first frame, so the sun also rises when the page opens.
const ready = ref(false)
onMounted(() => requestAnimationFrame(() => { ready.value = true }))
const rays = Array.from({ length: 16 }, (_, i) => ({ deg: i * 22.5, long: i % 2 === 0 }))
const sparkles = [
  { x: 6, y: 30, s: .9, d: 0 },
  { x: 92, y: 18, s: .7, d: .7 },
  { x: 86, y: 78, s: .6, d: 1.4 },
  { x: 14, y: 82, s: .5, d: 2.1 },
]
const stars = [
  { x: 88, y: 12, s: 1, d: 0 },
  { x: 12, y: 16, s: .75, d: .6 },
  { x: 94, y: 62, s: .6, d: 1.2 },
  { x: 4, y: 58, s: .55, d: 1.8 },
  { x: 60, y: 2, s: .5, d: 2.4 },
]
const star = 'M0-10C.8-3 3-.8 10 0 3 .8.8 3 0 10-.8 3-3 .8-10 0-3-.8-.8-3 0-10Z'
</script>

<template>
  <div class="sky" :class="{ ready, night }" aria-hidden="true">
    <div class="horizon">
      <svg class="sun" viewBox="0 0 100 100">
        <defs>
          <radialGradient id="login-sun-core" cx=".42" cy=".38" r=".7">
            <stop offset="0" stop-color="#fffbe0" />
            <stop offset=".5" stop-color="#ffd65c" />
            <stop offset="1" stop-color="#ff9f2e" />
          </radialGradient>
          <radialGradient id="login-sun-halo">
            <stop offset=".35" stop-color="#ffe08a" stop-opacity=".75" />
            <stop offset="1" stop-color="#ffe08a" stop-opacity="0" />
          </radialGradient>
        </defs>
        <circle class="halo" cx="50" cy="50" r="48" fill="url(#login-sun-halo)" />
        <g class="rays">
          <rect
            v-for="ray in rays"
            :key="ray.deg"
            :class="{ long: ray.long }"
            x="48.5"
            :y="ray.long ? 3 : 10"
            width="3"
            :height="ray.long ? 14 : 8"
            rx="1.5"
            fill="#ffc43d"
            :transform="`rotate(${ray.deg} 50 50)`"
          />
        </g>
        <circle cx="50" cy="50" r="22" fill="url(#login-sun-core)" />
        <ellipse cx="42" cy="41" rx="7" ry="4.5" fill="#fff" fill-opacity=".55" transform="rotate(-30 42 41)" />
      </svg>
    </div>
    <svg class="sparkles" viewBox="0 0 100 100">
      <path
        v-for="(p, i) in sparkles"
        :key="i"
        class="twinkle"
        :d="star"
        fill="#fff3b0"
        :style="{ transform: `translate(${p.x}px, ${p.y}px) scale(${p.s * .75})`, animationDelay: `${p.d}s` }"
      />
    </svg>
    <svg class="moon" viewBox="0 0 100 100">
      <defs>
        <mask id="login-moon-cut">
          <rect width="100" height="100" fill="#fff" />
          <circle cx="63" cy="40" r="21" fill="#000" />
        </mask>
        <radialGradient id="login-moon-core" cx=".35" cy=".4" r=".75">
          <stop offset="0" stop-color="#fffdf2" />
          <stop offset="1" stop-color="#ffe49a" />
        </radialGradient>
        <radialGradient id="login-moon-halo">
          <stop offset=".3" stop-color="#fff2c4" stop-opacity=".55" />
          <stop offset="1" stop-color="#fff2c4" stop-opacity="0" />
        </radialGradient>
        <linearGradient id="login-shooting" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="#fff6cd" stop-opacity="0" />
          <stop offset="1" stop-color="#fffdf2" />
        </linearGradient>
      </defs>
      <circle class="halo" cx="48" cy="52" r="46" fill="url(#login-moon-halo)" />
      <g mask="url(#login-moon-cut)">
        <circle cx="48" cy="52" r="26" fill="url(#login-moon-core)" />
        <circle cx="38" cy="60" r="3.2" fill="#f3d27a" fill-opacity=".5" />
        <circle cx="46" cy="70" r="2" fill="#f3d27a" fill-opacity=".45" />
      </g>
      <path
        v-for="(p, i) in stars"
        :key="i"
        class="twinkle"
        :d="star"
        fill="#fff6cd"
        :style="{ transform: `translate(${p.x}px, ${p.y}px) scale(${p.s * .5})`, animationDelay: `${p.d}s` }"
      />
      <rect class="shooting" x="0" y="0" width="34" height="1.6" rx=".8" fill="url(#login-shooting)" />
    </svg>
  </div>
</template>

<style scoped>
.sky {
  position: absolute;
  z-index: 42;
  top: calc(1% - 22px);
  right: 3%;
  width: clamp(48px, 8.5vw, 92px);
  aspect-ratio: 1;
  pointer-events: none;
}

/* No clipping: a hard horizon edge cut the glow into a visible straight line mid-rise.
   The sun and moon rise and set on soft fades instead. */
.horizon {
  position: absolute;
  inset: 0;
}

.sun,
.moon,
.sparkles {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: visible;
  opacity: 0;
}

.sun {
  transform: translateY(45%) scale(.85);
  filter: drop-shadow(0 0 12px rgb(255 190 70 / .8));
  transition: transform 1200ms cubic-bezier(.22, .8, .3, 1), opacity 900ms cubic-bezier(.4, 0, .2, 1);
}

.ready:not(.night) .sun,
.ready:not(.night) .sparkles {
  opacity: 1;
  transform: none;
}

.sparkles { transition: opacity 900ms ease 500ms; }
.ready.night .sparkles { transition-delay: 0s; }

.halo {
  transform-box: fill-box;
  transform-origin: center;
  animation: halo-breathe 3.2s ease-in-out infinite;
}

.rays {
  transform-origin: 50px 50px;
  animation: sun-spin 36s linear infinite;
}

.rays rect { animation: ray-shimmer 1.8s ease-in-out infinite; }
.rays rect.long { animation-delay: .9s; }

.moon {
  transform: translateY(45%) scale(.85) rotate(-20deg);
  filter: drop-shadow(0 0 12px rgb(255 246 205 / .7));
  transition: transform 1200ms cubic-bezier(.22, .8, .3, 1), opacity 900ms cubic-bezier(.4, 0, .2, 1);
}

.ready.night .moon {
  opacity: 1;
  transform: none;
}

.twinkle {
  transform-box: view-box;
  animation: twinkle 2.4s ease-in-out infinite;
}

.shooting {
  opacity: 0;
  animation: shooting-star 7s ease-in 2s infinite;
}

@keyframes sun-spin { to { rotate: 360deg; } }
@keyframes halo-breathe { 0%, 100% { scale: .88; opacity: .75; } 50% { scale: 1.08; opacity: 1; } }
@keyframes ray-shimmer { 0%, 100% { opacity: 1; } 50% { opacity: .45; } }
@keyframes twinkle { 0%, 100% { opacity: .25; } 50% { opacity: 1; } }
@keyframes shooting-star {
  0%, 88% { opacity: 0; transform: translate(-20px, 18px) rotate(-28deg); }
  91% { opacity: 1; }
  100% { opacity: 0; transform: translate(70px, -20px) rotate(-28deg); }
}

@media (prefers-reduced-motion: reduce) {
  .sun, .moon { transform: none; transition: opacity 300ms ease; }
  .rays, .rays rect, .halo, .twinkle, .shooting { animation: none; }
  .twinkle { opacity: .8; }
}
</style>
