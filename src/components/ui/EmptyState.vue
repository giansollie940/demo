<script setup lang="ts">
defineProps<{
  title: string
  description?: string
  image?: string
}>()
</script>

<template>
  <section class="empty-state">
    <img v-if="image" class="empty-state__image" :src="image" alt="" />
    <div class="empty-state__content">
      <h2 class="empty-state__title">{{ title }}</h2>
      <p v-if="description" class="empty-state__description">{{ description }}</p>
      <div v-if="$slots.actions" class="empty-state__actions">
        <slot name="actions" />
      </div>
    </div>
  </section>
</template>

<style scoped>
.empty-state {
  display: grid;
  justify-items: center;
  gap: var(--space-5);
  padding: var(--space-8) var(--space-5);
  color: var(--text);
  text-align: center;
  background: var(--surface-subtle);
  border: 1px dashed var(--border);
  border-radius: var(--radius-card);
}

.empty-state__image {
  display: block;
  width: min(220px, 100%);
  height: auto;
}

.empty-state__content {
  display: grid;
  justify-items: center;
  gap: var(--space-2);
}

.empty-state__title {
  margin: 0;
  color: var(--text-strong);
  font-size: 1.125rem;
  line-height: 1.3;
}

.empty-state__description {
  max-width: 52ch;
  margin: 0;
}

.empty-state__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: var(--space-2);
  margin-top: var(--space-2);
}
</style>
