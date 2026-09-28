<script setup lang="ts">
/** Torch artwork. Pointing right at 0°; the page rotates it around its tail via CSS variables. */
defineProps<{ on: boolean }>()
</script>

<template>
  <div class="torch" :class="{ on }" aria-hidden="true">
    <svg viewBox="0 0 120 44" width="100%" height="100%">
      <defs>
        <linearGradient id="torch-body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#6d7fae" />
          <stop offset=".45" stop-color="#3b4a72" />
          <stop offset="1" stop-color="#1b2542" />
        </linearGradient>
        <linearGradient id="torch-head" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#e9edf7" />
          <stop offset=".5" stop-color="#9aa6c2" />
          <stop offset="1" stop-color="#5a6583" />
        </linearGradient>
        <radialGradient id="torch-lens" cx=".4" cy=".5" r=".7">
          <stop offset="0" stop-color="#fffdf0" />
          <stop offset=".6" stop-color="#fff6cd" />
          <stop offset="1" stop-color="#ffd98a" />
        </radialGradient>
      </defs>
      <rect x="2" y="14" width="9" height="16" rx="3" fill="#1b2542" />
      <rect x="8" y="12" width="60" height="20" rx="6" fill="url(#torch-body)" />
      <path d="M18 13v18M24 13v18M30 13v18" stroke="#1b2542" stroke-opacity=".55" stroke-width="2" />
      <rect x="10" y="14" width="56" height="4" rx="2" fill="#fff" fill-opacity=".18" />
      <rect x="44" y="8" width="11" height="6" rx="2" fill="#ffb347" />
      <path d="M66 12 L96 4 L96 40 L66 32 Z" fill="url(#torch-head)" />
      <path d="M68 13.5 L94 7 L94 11 L68 17 Z" fill="#fff" fill-opacity=".35" />
      <ellipse class="lens" cx="98" cy="22" rx="4.5" ry="18" fill="url(#torch-lens)" />
    </svg>
  </div>
</template>

<style scoped>
.torch {
  position: fixed;
  z-index: 44;
  left: var(--pivot-x, -200px);
  top: var(--pivot-y, -200px);
  width: var(--torch-length, 110px);
  aspect-ratio: 120 / 44;
  pointer-events: none;
  transform-origin: 0 50%;
  transform: translateY(-50%) rotate(var(--beam-rot, 0deg));
  scale: .6;
  opacity: 0;
  visibility: hidden;
  filter: drop-shadow(0 6px 10px rgb(3 10 24 / .45));
  transition: opacity 350ms ease, scale 350ms cubic-bezier(.2, .8, .3, 1.2), visibility 0s linear 350ms;
}

.torch.on {
  opacity: 1;
  visibility: visible;
  scale: 1;
  /* Only fade/scale are animated; rotation must track the pointer without lag. */
  transition: opacity 350ms ease, scale 350ms cubic-bezier(.2, .8, .3, 1.2), visibility 0s;
}

.lens {
  filter: drop-shadow(0 0 4px #fff6cd) drop-shadow(0 0 10px rgb(255 220 150 / .9));
}

@media (prefers-reduced-motion: reduce) {
  .torch, .torch.on { transition-duration: 150ms; }
}
</style>
