<script setup lang="ts">
withDefaults(defineProps<{variant?:'primary'|'info'|'success'|'warning'|'danger'|'secondary';type?:'button'|'submit'|'reset';loading?:boolean;disabled?:boolean}>(),{variant:'primary',type:'button',loading:false,disabled:false})
</script>
<template><button class="app-button" :class="`is-${variant}`" :type="type" :disabled="disabled||loading"><span v-if="loading" class="spinner" aria-hidden="true"></span><slot /></button></template>
<style scoped>
.app-button{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:44px;border:1px solid transparent;border-radius:12px;padding:12px 16px;font-weight:700;color:var(--color-on-action);white-space:nowrap;transition:box-shadow var(--transition-fast),background var(--transition-fast)}
.app-button:hover:not(:disabled){box-shadow:var(--shadow-button)}.app-button:active:not(:disabled){box-shadow:var(--shadow-sm)}.app-button:disabled{opacity:.56;cursor:not-allowed}
.app-button:focus-visible{outline:3px solid var(--focus-inner);outline-offset:2px;box-shadow:0 0 0 5px var(--focus-ring)}
.is-primary{background:var(--color-primary)}.is-info{background:var(--color-info)}.is-success{background:var(--color-success)}.is-warning{background:var(--color-warning)}.is-danger{background:var(--color-danger)}
.is-secondary{background:var(--surface-raised);color:var(--text);border-color:var(--border)}
.spinner{width:14px;height:14px;border:2px solid var(--spinner-track);border-top-color:currentColor;border-radius:50%;animation:spin .7s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}
</style>
