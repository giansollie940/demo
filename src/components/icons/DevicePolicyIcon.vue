<template>
  <svg
    xmlns="http://www.w3.org/2000/svg"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    :stroke-width="strokeWidth"
    stroke-linecap="round"
    stroke-linejoin="round"
    :style="{ color }"
    class="feat010-device-policy-icon"
    aria-hidden="true"
    focusable="false"
  >
    <rect x="3" y="4" width="18" height="12" rx="2" />
    <line x1="2" y1="20" x2="22" y2="20" />
    <rect x="10" y="11" width="4" height="4" rx="1" fill="currentColor" stroke="none" />
    <path d="M10 11V9a2 2 0 1 1 4 0v2" />
  </svg>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    size?: number | string
    color?: string
    strokeWidth?: number | string
  }>(),
  {
    size: 18,
    color: 'currentColor',
    strokeWidth: 2,
  },
)
</script>

<style scoped>
.feat010-device-policy-icon {
  display: block;
  flex: none;
  transition:
    color 0.2s ease-in-out,
    opacity 0.2s ease-in-out,
    transform 0.2s ease-in-out;
}

@media (prefers-reduced-motion: reduce) {
  .feat010-device-policy-icon {
    transition: none;
  }
}
</style>
