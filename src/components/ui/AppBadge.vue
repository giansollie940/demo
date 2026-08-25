<script setup lang="ts">
withDefaults(defineProps<{tone?:'neutral'|'info'|'success'|'warning'|'danger'|'primary'}>(),{tone:'neutral'})
</script>
<template><span class="badge" :class="`tone-${tone}`"><slot /></span></template>
<style scoped>.badge{display:inline-flex;align-items:center;border-radius:999px;padding:8px 12px;font-size:.78rem;font-weight:800}.tone-neutral{background:var(--surface-soft);color:var(--text-muted)}.tone-primary{background:color-mix(in srgb,var(--color-primary) 14%,transparent);color:var(--color-primary)}.tone-info{background:color-mix(in srgb,var(--color-info) 14%,transparent);color:var(--color-info)}.tone-success{background:color-mix(in srgb,var(--color-success) 14%,transparent);color:var(--color-success)}.tone-warning{background:color-mix(in srgb,var(--color-warning) 14%,transparent);color:var(--color-warning)}.tone-danger{background:color-mix(in srgb,var(--color-danger) 14%,transparent);color:var(--color-danger)}</style>
