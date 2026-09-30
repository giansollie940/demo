<script setup lang="ts">
import { computed } from 'vue'
import type { ItemColor, ItemKind } from '../../features/auth-bag/catalog'

/** School supply artwork: each kind has its own silhouette so no item relies on colour alone. */
const props = defineProps<{ kind: ItemKind; color: ItemColor }>()

const PALETTE: Record<ItemColor, { fill: string; dark: string; light: string }> = {
  red: { fill: '#e5484d', dark: '#a8262b', light: '#ff9a9d' },
  blue: { fill: '#3b82f6', dark: '#1e4fae', light: '#9cc2ff' },
  yellow: { fill: '#f5b400', dark: '#a87600', light: '#ffe083' },
  green: { fill: '#22a06b', dark: '#146b46', light: '#8fe0b9' },
}
const c = computed(() => PALETTE[props.color])
</script>

<template>
  <svg viewBox="0 0 64 64" aria-hidden="true" class="bag-item-icon">
    <g v-if="kind === 'pencil'" transform="rotate(-35 32 32)">
      <rect x="12" y="25" width="34" height="14" rx="2" :fill="c.fill" :stroke="c.dark" stroke-width="2" />
      <path d="M12 28h34M12 36h34" :stroke="c.dark" stroke-opacity=".45" stroke-width="1.5" />
      <path d="M46 25 L58 32 L46 39 Z" fill="#f3d3a0" :stroke="c.dark" stroke-width="2" stroke-linejoin="round" />
      <path d="M54 29.7 L58 32 L54 34.3 Z" fill="#3a3a3a" />
      <rect x="6" y="25" width="7" height="14" rx="2" fill="#f4a3b4" :stroke="c.dark" stroke-width="2" />
    </g>
    <g v-else-if="kind === 'notebook'">
      <rect x="15" y="9" width="36" height="46" rx="4" :fill="c.fill" :stroke="c.dark" stroke-width="2" />
      <rect x="22" y="17" width="23" height="9" rx="2" fill="#fff" fill-opacity=".85" />
      <path d="M26 21.5h15" :stroke="c.dark" stroke-width="1.6" stroke-linecap="round" />
      <g :stroke="c.dark" stroke-width="2" stroke-linecap="round" fill="none">
        <path d="M11 15h8M11 23h8M11 31h8M11 39h8M11 47h8" />
      </g>
    </g>
    <g v-else-if="kind === 'ruler'">
      <path d="M10 54 L10 10 L54 54 Z" :fill="c.fill" fill-opacity=".9" :stroke="c.dark" stroke-width="2" stroke-linejoin="round" />
      <path d="M18 46 L18 30 L34 46 Z" fill="#fff" fill-opacity=".75" :stroke="c.dark" stroke-width="1.5" stroke-linejoin="round" />
      <path d="M10 18h5M10 26h4M10 34h5M10 42h4M18 54v-5M26 54v-4M34 54v-5M42 54v-4" :stroke="c.dark" stroke-width="1.6" stroke-linecap="round" />
    </g>
    <g v-else-if="kind === 'eraser'" transform="rotate(-18 32 32)">
      <rect x="10" y="20" width="44" height="24" rx="6" :fill="c.light" :stroke="c.dark" stroke-width="2" />
      <path d="M26 20 H48 a6 6 0 0 1 6 6 V38 a6 6 0 0 1 -6 6 H26 Z" :fill="c.fill" />
      <rect x="10" y="20" width="44" height="24" rx="6" fill="none" :stroke="c.dark" stroke-width="2" />
      <path d="M26 20v24" :stroke="c.dark" stroke-width="1.6" />
    </g>
    <g v-else-if="kind === 'crayon'">
      <path d="M22 50 V20 L32 6 L42 20 V50 Z" :fill="c.fill" :stroke="c.dark" stroke-width="2" stroke-linejoin="round" />
      <path d="M22 20 H42" :stroke="c.dark" stroke-width="2" />
      <rect x="22" y="26" width="20" height="16" fill="#fff" fill-opacity=".8" />
      <path d="M25 31 h14 M25 37 h10" :stroke="c.dark" stroke-width="1.6" stroke-linecap="round" />
      <path d="M22 50 H42 V56 H22 Z" :fill="c.dark" />
    </g>
    <g v-else-if="kind === 'pen'" transform="rotate(-90 32 32)">
      <rect x="27" y="6" width="10" height="36" rx="4" :fill="c.fill" :stroke="c.dark" stroke-width="2" />
      <rect x="27" y="6" width="10" height="13" rx="4" :fill="c.dark" />
      <path d="M38 9 V26" :stroke="c.dark" stroke-width="2.5" stroke-linecap="round" />
      <path d="M27 42 H37 L34 52 H30 Z" fill="#d9dde6" :stroke="c.dark" stroke-width="2" stroke-linejoin="round" />
      <path d="M31 52 L32 58 L33 52 Z" :fill="c.dark" />
    </g>
    <g v-else-if="kind === 'pencilcase'">
      <rect x="6" y="20" width="52" height="28" rx="12" :fill="c.fill" :stroke="c.dark" stroke-width="2" />
      <path d="M10 27 H54" :stroke="c.dark" stroke-width="2" stroke-dasharray="3 2.5" />
      <rect x="46" y="23" width="6" height="11" rx="2" :fill="c.light" :stroke="c.dark" stroke-width="1.5" />
      <circle cx="32" cy="38" r="5" fill="#fff" fill-opacity=".8" />
    </g>
    <g v-else-if="kind === 'scissors'">
      <!-- Two tapered steel blades crossing at the pivot screw, coloured finger loops below. -->
      <path d="M29.5 37 L47.5 6.5 Q50.5 4.5 50 8.5 L35.5 36 Z" fill="#e3e7ee" stroke="#5f6b7a" stroke-width="1.6" stroke-linejoin="round" />
      <path d="M34.5 37 L16.5 6.5 Q13.5 4.5 14 8.5 L28.5 36 Z" fill="#f1f4f8" stroke="#5f6b7a" stroke-width="1.6" stroke-linejoin="round" />
      <path d="M31 36 L25 42 M33 36 L39 42" :stroke="c.dark" stroke-width="5" stroke-linecap="round" />
      <ellipse cx="20.5" cy="48" rx="8.5" ry="7" transform="rotate(-25 20.5 48)" fill="none" :stroke="c.fill" stroke-width="5" />
      <ellipse cx="43.5" cy="48" rx="8.5" ry="7" transform="rotate(25 43.5 48)" fill="none" :stroke="c.fill" stroke-width="5" />
      <ellipse cx="20.5" cy="48" rx="8.5" ry="7" transform="rotate(-25 20.5 48)" fill="none" :stroke="c.dark" stroke-width="1.2" stroke-opacity=".5" />
      <ellipse cx="43.5" cy="48" rx="8.5" ry="7" transform="rotate(25 43.5 48)" fill="none" :stroke="c.dark" stroke-width="1.2" stroke-opacity=".5" />
      <circle cx="32" cy="33.5" r="2.8" fill="#8a94a3" stroke="#4b5563" stroke-width="1.2" />
    </g>
    <g v-else>
      <path d="M12 22 L40 14 L52 26 V46 L24 54 L12 42 Z" :fill="c.fill" :stroke="c.dark" stroke-width="2" stroke-linejoin="round" />
      <path d="M12 22 L24 34 L52 26 M24 34 V54" :stroke="c.dark" stroke-width="1.8" fill="none" stroke-linejoin="round" />
      <circle cx="38" cy="40" r="6" fill="#2e2e2e" :stroke="c.dark" stroke-width="1.5" />
      <path d="M18 34 l3 3" :stroke="c.light" stroke-width="2" stroke-linecap="round" />
    </g>
  </svg>
</template>

<style scoped>
.bag-item-icon { display: block; width: 100%; height: 100%; }
</style>
