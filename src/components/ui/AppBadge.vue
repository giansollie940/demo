<script setup lang="ts">
type BadgeTone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger'

withDefaults(defineProps<{
  tone?: BadgeTone
}>(), {
  tone: 'neutral',
})
</script>

<template>
  <span class="app-badge" :class="`app-badge--${tone}`">
    <slot />
  </span>
</template>

<style scoped>
.app-badge {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: var(--space-1) var(--space-2);
  border-radius: 999px;
  font-size: 0.8125rem;
  font-weight: 600;
  line-height: 1.2;
}

.app-badge--neutral {
  color: var(--text);
  background: var(--surface-subtle);
}

.app-badge--primary {
  color: var(--color-primary-strong);
  background: var(--color-primary-soft);
}

.app-badge--success {
  color: var(--text-strong);
  background: color-mix(in srgb, var(--color-success) 12%, var(--surface));
}

.app-badge--warning {
  color: var(--text-strong);
  background: color-mix(in srgb, var(--color-warning) 12%, var(--surface));
}

.app-badge--danger {
  color: var(--text-strong);
  background: color-mix(in srgb, var(--color-danger) 12%, var(--surface));
}
</style>
