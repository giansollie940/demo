<script setup lang="ts">
import { computed } from 'vue'
import { AlertCircle, CheckCircle2, LoaderCircle, RefreshCw } from 'lucide-vue-next'

export type InlineStatusState = 'idle' | 'saving' | 'success' | 'error' | 'server-changed'

const props = withDefaults(defineProps<{
  state?: InlineStatusState
  message?: string
}>(), { state: 'idle', message: '' })

const role = computed(() => ['error', 'server-changed'].includes(props.state) ? 'alert' : 'status')
</script>

<template>
  <div v-if="state !== 'idle'" class="inline-status" :class="`is-${state}`" :role="role">
    <LoaderCircle v-if="state === 'saving'" class="spin" aria-hidden="true" />
    <CheckCircle2 v-else-if="state === 'success'" aria-hidden="true" />
    <RefreshCw v-else-if="state === 'server-changed'" aria-hidden="true" />
    <AlertCircle v-else aria-hidden="true" />
    <span>{{ message }}</span>
    <slot />
  </div>
</template>

<style scoped>
.inline-status{display:flex;align-items:center;gap:8px;min-height:44px;padding:12px;border:1px solid var(--border);border-radius:12px;background:var(--surface-soft);color:var(--text-muted);font-size:.9rem;font-weight:700}
.inline-status svg{width:18px;flex:0 0 auto}.is-success{color:var(--color-success);border-color:color-mix(in srgb,var(--color-success) 30%,var(--border))}.is-error{color:var(--color-danger);border-color:color-mix(in srgb,var(--color-danger) 30%,var(--border))}.is-server-changed{color:var(--color-warning);border-color:color-mix(in srgb,var(--color-warning) 35%,var(--border))}.spin{animation:spin .75s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}
@media(prefers-reduced-motion:reduce){.spin{animation:none}}
</style>
