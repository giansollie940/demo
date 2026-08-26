<script setup lang="ts">
withDefaults(defineProps<{padding?:'sm'|'md'|'lg'}>(),{padding:'md'})
</script>
<template><section class="app-card card" :class="`pad-${padding}`"><slot /></section></template>
<style scoped>.pad-sm{padding:12px}.pad-md{padding:20px}.pad-lg{padding:28px}</style>
