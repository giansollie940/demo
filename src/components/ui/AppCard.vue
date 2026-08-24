<script setup lang="ts">
type CardPadding = 'sm' | 'md' | 'lg'

withDefaults(defineProps<{
  padding?: CardPadding
}>(), {
  padding: 'md',
})
</script>

<template>
  <section class="app-card" :class="`app-card--${padding}`">
    <slot />
  </section>
</template>

<style scoped>
.app-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-card);
  box-shadow: var(--shadow-card);
}

.app-card--sm {
  padding: var(--space-3);
}

.app-card--md {
  padding: var(--space-5);
}

.app-card--lg {
  padding: var(--space-6);
}
</style>
