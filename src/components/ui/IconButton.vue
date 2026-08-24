<script setup lang="ts">
const props = withDefaults(defineProps<{
  label: string
  disabled?: boolean
}>(), {
  disabled: false,
})

const emit = defineEmits<{
  click: [event: MouseEvent]
}>()

function emitClick(event: MouseEvent) {
  if (props.disabled) return

  emit('click', event)
}
</script>

<template>
  <button
    class="icon-button"
    type="button"
    :disabled="disabled"
    :aria-label="label"
    @click="emitClick"
  >
    <slot />
  </button>
</template>

<style scoped>
.icon-button {
  display: inline-grid;
  width: 40px;
  height: 40px;
  place-items: center;
  color: var(--text);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transform: translateY(0);
  transition:
    color var(--motion-fast) ease,
    background-color var(--motion-fast) ease,
    border-color var(--motion-fast) ease,
    transform var(--motion-fast) ease;
}

.icon-button:hover:not(:disabled) {
  color: var(--color-primary);
  background: var(--color-primary-soft);
  border-color: var(--color-primary);
}

.icon-button:active:not(:disabled) {
  transform: translateY(1px);
}

.icon-button:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

@media (prefers-reduced-motion: reduce) {
  .icon-button {
    transition-duration: 0.01ms;
  }

  .icon-button:active:not(:disabled) {
    transform: none;
  }
}
</style>
