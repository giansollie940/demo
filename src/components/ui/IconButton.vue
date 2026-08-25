<script setup lang="ts">
withDefaults(defineProps<{label:string;active?:boolean}>(),{active:false})
</script>
<template><button class="icon-button" :class="{active}" type="button" :aria-label="label" :title="label"><slot /></button></template>
<style scoped>.icon-button{width:40px;height:40px;display:grid;place-items:center;border:1px solid var(--border);border-radius:12px;background:var(--surface);color:var(--text-muted);transition:background var(--transition-fast),color var(--transition-fast)}.icon-button:hover{background:var(--surface-soft)}.icon-button.active{background:var(--surface-soft);color:var(--color-primary)}.icon-button:active{background:color-mix(in srgb,var(--color-primary) 10%,var(--surface))}.icon-button :deep(svg){width:19px;height:19px;stroke:currentColor}</style>
