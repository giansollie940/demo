<script setup lang="ts">
/*
 * "Hành trang tự học" mark: the purple school bag used on the bag page, with four pencils in
 * the four theme colours peeking out. Drawn in SVG so it looks the same on every device (an
 * emoji is drawn differently by each OS). A parent with .bag-mark-host makes the pencils bob
 * while it is hovered or focused.
 */
defineProps<{ size?: number }>()
</script>

<template>
  <svg class="bag-mark" :width="size ?? 28" :height="size ?? 28" viewBox="0 0 64 64" aria-hidden="true">
    <g class="bm-pencils">
      <g class="bm-p bm-p1"><rect x="16" y="6" width="6" height="22" rx="1.5" fill="#e5484d" /><path d="M16 6 L19 1 L22 6 Z" fill="#f3d3a0" /></g>
      <g class="bm-p bm-p2"><rect x="24.5" y="3" width="6" height="25" rx="1.5" fill="#f5b400" /><path d="M24.5 3 L27.5 -2 L30.5 3 Z" fill="#f3d3a0" /></g>
      <g class="bm-p bm-p3"><rect x="33" y="5" width="6" height="23" rx="1.5" fill="#22a06b" /><path d="M33 5 L36 0 L39 5 Z" fill="#f3d3a0" /></g>
      <g class="bm-p bm-p4"><rect x="41.5" y="8" width="6" height="20" rx="1.5" fill="#3b82f6" /><path d="M41.5 8 L44.5 3 L47.5 8 Z" fill="#f3d3a0" /></g>
    </g>
    <g class="bm-bag">
      <path d="M24 20 C24 12 40 12 40 20" fill="none" stroke="#4d318f" stroke-width="3.5" stroke-linecap="round" />
      <rect x="9" y="19" width="46" height="42" rx="12" fill="#7c5cd6" stroke="#4d318f" stroke-width="2.5" />
      <path d="M9 33 H55" stroke="#4d318f" stroke-width="2.5" />
      <rect x="18" y="39" width="28" height="15" rx="5.5" fill="#9b82ea" stroke="#4d318f" stroke-width="2.5" />
      <rect x="28.5" y="29.5" width="7" height="7" rx="2" fill="#ffd166" stroke="#a87600" stroke-width="1.6" />
      <path d="M14 24 q3 -2 6 0" stroke="#fff" stroke-opacity=".45" stroke-width="2" fill="none" stroke-linecap="round" />
    </g>
  </svg>
</template>

<style>
/* Unscoped on purpose so a parent's :hover can drive it; every class is bm-/bag-mark- prefixed. */
.bag-mark { display: block; flex: none; overflow: visible; }
.bag-mark .bm-bag { transform-origin: 50% 95%; }
.bag-mark .bm-p { transform-box: fill-box; transform-origin: 50% 100%; }
.bag-mark-host:hover .bag-mark .bm-bag,
.bag-mark-host:focus-visible .bag-mark .bm-bag { animation: bag-mark-wiggle 1s ease-in-out infinite; }
.bag-mark-host:hover .bag-mark .bm-p,
.bag-mark-host:focus-visible .bag-mark .bm-p { animation: bag-mark-bob 1s ease-in-out infinite; }
.bag-mark-host:hover .bag-mark .bm-p2, .bag-mark-host:focus-visible .bag-mark .bm-p2 { animation-delay: .12s; }
.bag-mark-host:hover .bag-mark .bm-p3, .bag-mark-host:focus-visible .bag-mark .bm-p3 { animation-delay: .24s; }
.bag-mark-host:hover .bag-mark .bm-p4, .bag-mark-host:focus-visible .bag-mark .bm-p4 { animation-delay: .36s; }
@keyframes bag-mark-bob { 0%, 100% { transform: translateY(0); } 40% { transform: translateY(-5px); } }
@keyframes bag-mark-wiggle { 0%, 100% { transform: rotate(0); } 30% { transform: rotate(-6deg); } 70% { transform: rotate(5deg); } }
@media (prefers-reduced-motion: reduce) {
  .bag-mark .bm-bag, .bag-mark .bm-p { animation: none !important; }
}
</style>
