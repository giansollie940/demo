<script setup lang="ts">
type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
type ButtonSize = 'sm' | 'md'

const props = withDefaults(defineProps<{
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  disabled?: boolean
}>(), {
  variant: 'primary',
  size: 'md',
  loading: false,
  disabled: false,
})

const emit = defineEmits<{
  click: [event: MouseEvent]
}>()

function emitClick(event: MouseEvent) {
  if (props.disabled || props.loading) return

  emit('click', event)
}
</script>

<template>
  <button
    class="app-button"
    :class="[`app-button--${variant}`, `app-button--${size}`]"
    type="button"
    :disabled="disabled || loading"
    :aria-busy="loading || undefined"
    @click="emitClick"
  >
    <span v-if="loading" class="app-button__spinner" aria-hidden="true" />
    <span class="app-button__label"><slot /></span>
  </button>
</template>

<style scoped>
.app-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  font: inherit;
  font-weight: 600;
  line-height: 1.2;
  cursor: pointer;
  transition:
    color var(--motion-fast) ease,
    background-color var(--motion-fast) ease,
    border-color var(--motion-fast) ease;
}

.app-button--sm {
  min-height: 32px;
  padding: var(--space-2) var(--space-3);
  font-size: 0.875rem;
}

.app-button--md {
  min-height: 40px;
  padding: var(--space-3) var(--space-4);
}

.app-button--primary {
  color: var(--surface);
  background: var(--color-primary);
}

.app-button--primary:hover:not(:disabled) {
  background: var(--color-primary-strong);
}

.app-button--secondary {
  color: var(--text-strong);
  background: var(--surface);
  border-color: var(--border);
}

.app-button--ghost {
  color: var(--text);
  background: transparent;
}

.app-button--ghost:hover:not(:disabled) {
  background: var(--surface-subtle);
}

.app-button--danger {
  color: var(--surface);
  background: var(--color-danger);
}

.app-button:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.app-button__spinner {
  width: 0.875em;
  height: 0.875em;
  border: 2px solid currentColor;
  border-right-color: transparent;
  border-radius: 50%;
  animation: app-button-spin var(--motion-normal) linear infinite;
}

@keyframes app-button-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
