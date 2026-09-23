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
  // Chế độ nhập liệu (thay window.prompt). Bỏ trống thì hộp thoại chỉ hỏi
  // xác nhận đúng như trước, nên mọi chỗ dùng cũ không phải đổi gì.
  input?: boolean
  label?: string
  placeholder?: string
  modelValue?: string
  multiline?: boolean
  error?: string
}>(), {
  title: 'Xác nhận thao tác',
  body: '',
  confirmLabel: 'Xác nhận',
  cancelLabel: 'Hủy',
  danger: false,
  input: false,
  label: '',
  placeholder: '',
  modelValue: '',
  multiline: false,
  error: '',
})

const emit = defineEmits<{ confirm: []; cancel: []; 'update:modelValue': [value: string] }>()
const confirmButton = ref<HTMLButtonElement | null>(null)
const field = ref<HTMLInputElement | HTMLTextAreaElement | null>(null)
let returnFocus: HTMLElement | null = null

function cancel() {
  emit('cancel')
}

function onInput(event: Event) {
  emit('update:modelValue', (event.target as HTMLInputElement | HTMLTextAreaElement).value)
}

// Enter trên ô một dòng = xác nhận, giống hành vi quen thuộc của window.prompt.
// Textarea giữ Enter để xuống dòng.
function onFieldKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' && !props.multiline) {
    event.preventDefault()
    emit('confirm')
  }
}

watch(() => props.open, async open => {
  if (typeof document === 'undefined') return
  if (open) {
    returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    await nextTick()
    // Ở chế độ nhập liệu, con trỏ vào thẳng ô nhập; ngược lại focus nút xác nhận.
    if (props.input && field.value) {
      field.value.focus()
      field.value.select?.()
    } else {
      confirmButton.value?.focus()
    }
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
      <p v-if="body">{{ body }}</p>
      <label v-if="input" class="dialog-field">
        <span v-if="label">{{ label }}</span>
        <textarea
          v-if="multiline"
          ref="field"
          :value="modelValue"
          :placeholder="placeholder"
          :aria-invalid="Boolean(error)"
          rows="4"
          @input="onInput"
        ></textarea>
        <input
          v-else
          ref="field"
          :value="modelValue"
          :placeholder="placeholder"
          :aria-invalid="Boolean(error)"
          type="text"
          @input="onInput"
          @keydown="onFieldKeydown"
        />
        <small v-if="error" class="field-error" role="alert">{{ error }}</small>
      </label>
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
.dialog-field{display:grid;gap:6px;margin-top:16px}.dialog-field>span{font-weight:850}.dialog-field input,.dialog-field textarea{width:100%;min-height:44px;border:1px solid var(--border);border-radius:12px;padding:12px;background:var(--input);color:var(--text);font:inherit}.dialog-field textarea{min-height:104px;resize:vertical}.dialog-field input:focus,.dialog-field textarea:focus{outline:3px solid var(--focus-ring);border-color:var(--color-primary)}.dialog-field [aria-invalid="true"]{border-color:var(--color-danger)}.field-error{color:var(--color-danger);font-weight:800}
@media(max-width:480px){.dialog-backdrop{align-items:end;padding:12px}.confirm-dialog{border-radius:20px}.dialog-actions{display:grid;grid-template-columns:1fr}.dialog-actions :deep(button){width:100%}}
</style>
