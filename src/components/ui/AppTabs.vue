<script setup lang="ts">
export interface AppTabItem {
  id: string
  label: string
  disabled?: boolean
}

const props = defineProps<{
  modelValue: string
  items: AppTabItem[]
  label: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

function select(item: AppTabItem) {
  if (!item.disabled) emit('update:modelValue', item.id)
}

function moveFocus(event: KeyboardEvent, index: number) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
  event.preventDefault()
  const enabled = props.items
    .map((item, itemIndex) => ({ item, itemIndex }))
    .filter(entry => !entry.item.disabled)
  if (!enabled.length) return
  const current = enabled.findIndex(entry => entry.itemIndex === index)
  const next = event.key === 'Home'
    ? enabled[0]
    : event.key === 'End'
      ? enabled[enabled.length - 1]
      : enabled[(current + (event.key === 'ArrowRight' ? 1 : -1) + enabled.length) % enabled.length]
  emit('update:modelValue', next.item.id)
  const tabs = (event.currentTarget as HTMLElement).parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
  tabs?.[next.itemIndex]?.focus()
}
</script>

<template>
  <div class="app-tabs" role="tablist" :aria-label="label">
    <button
      v-for="(item, index) in items"
      :key="item.id"
      type="button"
      role="tab"
      :aria-selected="modelValue === item.id"
      :tabindex="modelValue === item.id ? 0 : -1"
      :disabled="item.disabled"
      :class="{ active: modelValue === item.id }"
      @click="select(item)"
      @keydown="moveFocus($event, index)"
    >
      {{ item.label }}
    </button>
  </div>
</template>

<style scoped>
.app-tabs{display:inline-flex;gap:4px;padding:4px;border:1px solid color-mix(in srgb,var(--color-primary) 12%,var(--border));border-radius:14px;background:linear-gradient(110deg,var(--wash-violet),var(--wash-sky))}
.app-tabs button{min-height:44px;border:0;border-radius:10px;padding:8px 12px;background:transparent;color:var(--text-muted);font-weight:800;white-space:nowrap;transition:background var(--transition-fast),color var(--transition-fast),transform var(--transition-fast)}
.app-tabs button:hover:not(:disabled){color:var(--text)}
.app-tabs button.active{background:var(--gradient-primary);color:var(--color-on-action);box-shadow:var(--shadow-button)}
.app-tabs button:disabled{opacity:.5;cursor:not-allowed}
@media(max-width:560px){.app-tabs{display:grid;grid-template-columns:1fr 1fr;width:100%}.app-tabs button{min-width:0;padding-inline:8px}}
@media(max-width:360px){.app-tabs{grid-template-columns:1fr}}
</style>
