<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import AppButton from './AppButton.vue'

const props = withDefaults(defineProps<{
  open: boolean
  title?: string
  body?: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
}>(), {
  title: 'Xác nhận thao tác',
  body: '',
  confirmLabel: 'Xác nhận',
  cancelLabel: 'Hủy',
  danger: false,
})

const emit = defineEmits<{ confirm: []; cancel: [] }>()
const confirmButton = ref<HTMLButtonElement | null>(null)
let returnFocus: HTMLElement | null = null

function cancel() {
  emit('cancel')
}

watch(() => props.open, async open => {
  if (typeof document === 'undefined') return
  if (open) {
    returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    await nextTick()
    confirmButton.value?.focus()
  } else {
    returnFocus?.focus()
    returnFocus = null
  }
})
</script>

<template>
  <div v-if="open" class="dialog-backdrop" @click.self="cancel" @keydown.esc="cancel">
    <section class="confirm-dialog" role="alertdialog" aria-modal="true" :aria-labelledby="`${$attrs.id || 'confirm'}-title`">
      <h2 :id="`${$attrs.id || 'confirm'}-title`">{{ title }}</h2>
      <p>{{ body }}</p>
      <div class="dialog-actions">
        <AppButton variant="secondary" @click="cancel">{{ cancelLabel }}</AppButton>
        <AppButton ref="confirmButton" :variant="danger ? 'danger' : 'primary'" @click="emit('confirm')">
          {{ confirmLabel }}
        </AppButton>
      </div>
    </section>
  </div>
</template>

<style scoped>
.dialog-backdrop{position:fixed;inset:0;z-index:100;display:grid;place-items:center;padding:20px;background:var(--overlay)}
.confirm-dialog{width:min(480px,100%);padding:24px;border:1px solid var(--border);border-radius:20px;background:var(--surface-raised);box-shadow:var(--shadow-md)}
.confirm-dialog h2{margin:0 0 8px;font-size:1.35rem}.confirm-dialog p{margin:0;color:var(--text-muted);line-height:1.6}.dialog-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:24px;flex-wrap:wrap}
@media(max-width:480px){.dialog-backdrop{align-items:end;padding:12px}.confirm-dialog{border-radius:20px}.dialog-actions{display:grid;grid-template-columns:1fr}.dialog-actions :deep(button){width:100%}}
</style>
