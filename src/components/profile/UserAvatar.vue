<script setup lang="ts">
import { computed, ref, watch } from 'vue'

const props=withDefaults(defineProps<{
  src?:string|null
  name?:string
  code?:string
  size?:'sm'|'md'|'lg'
}>(),{src:null,name:'',code:'',size:'md'})

const failed=ref(false)
watch(()=>props.src,()=>{failed.value=false})
const initials=computed(()=>String(props.name||props.code||'?').trim().split(/\s+/).slice(-2).map(part=>part[0]||'').join('').toUpperCase()||'?')
</script>

<template>
  <span class="user-avatar" :class="`size-${size}`" aria-hidden="true">
    <img v-if="src&&!failed" :src="src" alt="" @error="failed=true">
    <span v-else>{{ initials }}</span>
  </span>
</template>

<style scoped>
.user-avatar{display:grid;place-items:center;overflow:hidden;flex:0 0 auto;border-radius:999px;background:linear-gradient(135deg,var(--wash-peach),var(--wash-violet));color:var(--color-primary);font-weight:900;line-height:1;box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--color-primary) 10%,var(--border))}.user-avatar img{display:block;width:100%;height:100%;object-fit:cover}.size-sm{width:35px;height:35px;font-size:.82rem}.size-md{width:44px;height:44px;font-size:.88rem}.size-lg{width:96px;height:96px;font-size:1.45rem}
</style>
