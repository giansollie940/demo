<script setup lang="ts">
// Gắn một lần duy nhất ở gốc app (App.vue) để appDialog.confirm()/prompt()
// dùng được từ mọi nơi, kể cả router guard và các hàm nằm ngoài component.
import ConfirmDialog from './ConfirmDialog.vue'
import { appDialog } from '../../features/shared/app-dialog'

const state = appDialog.state
</script>

<template>
  <ConfirmDialog
    id="app-dialog"
    :open="state.open"
    :title="state.title"
    :body="state.body"
    :confirm-label="state.confirmLabel"
    :cancel-label="state.cancelLabel"
    :danger="state.danger"
    :input="state.mode === 'prompt'"
    :label="state.label"
    :placeholder="state.placeholder"
    :multiline="state.multiline"
    :error="state.error"
    :model-value="state.value"
    @update:model-value="appDialog.setValue"
    @confirm="appDialog.accept"
    @cancel="appDialog.cancel"
  />
</template>
