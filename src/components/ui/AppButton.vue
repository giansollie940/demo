<script setup lang="ts">
withDefaults(defineProps<{variant?:'primary'|'info'|'success'|'warning'|'danger'|'secondary';type?:'button'|'submit'|'reset';loading?:boolean;disabled?:boolean}>(),{variant:'primary',type:'button',loading:false,disabled:false})
</script>
<template><button class="app-button" :class="`is-${variant}`" :type="type" :disabled="disabled||loading"><span v-if="loading" class="spinner" aria-hidden="true"></span><slot /></button></template>
<style scoped>
.app-button{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:44px;border:1px solid transparent;border-radius:13px;padding:12px 16px;font-weight:800;color:var(--color-on-action);white-space:nowrap;transition:box-shadow var(--transition-fast),background var(--transition-fast),transform var(--transition-fast),border-color var(--transition-fast)}
.app-button:hover:not(:disabled){box-shadow:var(--shadow-button);transform:translateY(-1px)}.app-button:active:not(:disabled){box-shadow:var(--shadow-sm);transform:translateY(0)}.app-button:disabled{opacity:.56;cursor:not-allowed}.app-button:focus-visible{outline:3px solid var(--focus-inner);outline-offset:2px;box-shadow:0 0 0 5px var(--focus-ring)}
.is-primary{background:var(--gradient-primary)}.is-info{background:linear-gradient(135deg,var(--color-info),var(--color-sky))}.is-success{background:linear-gradient(135deg,var(--color-success),var(--color-mint))}.is-warning{background:linear-gradient(135deg,var(--color-warning),var(--color-sun))}.is-danger{background:linear-gradient(135deg,var(--color-danger),var(--color-coral))}.is-secondary{background:linear-gradient(145deg,var(--surface-raised),var(--wash-violet));color:var(--text);border-color:color-mix(in srgb,var(--color-primary) 15%,var(--border))}
.spinner{width:14px;height:14px;border:2px solid var(--spinner-track);border-top-color:currentColor;border-radius:50%;animation:spin .7s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}
</style>
