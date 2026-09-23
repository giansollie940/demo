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
    class="device-policy-icon"
    aria-hidden="true"
    focusable="false"
  >
    <rect x="4" y="3" width="11" height="15" rx="2" />
    <line x1="8" y1="6" x2="11" y2="6" />
    <circle cx="9.5" cy="15.2" r="0.7" fill="currentColor" stroke="none" />
    <rect x="14.5" y="6" width="5.5" height="10" rx="1.3" />
    <line x1="16" y1="8" x2="18.5" y2="8" />
    <circle cx="17.25" cy="13.9" r="0.45" fill="currentColor" stroke="none" />
    <rect x="13" y="14.2" width="6" height="4.8" rx="1.1" fill="currentColor" stroke="none" />
    <path d="M14.4 14.2v-1a1.6 1.6 0 1 1 3.2 0v1" />
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
    strokeWidth: 1.8,
  },
)
</script>

<style scoped>
.device-policy-icon {
  display: block;
  flex: none;
  transition:
    color 0.2s ease-in-out,
    opacity 0.2s ease-in-out,
    transform 0.2s ease-in-out;
}

@media (prefers-reduced-motion: reduce) {
  .device-policy-icon {
    transition: none;
  }
}
</style>
