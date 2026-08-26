<script setup lang="ts">
import type { ApprovalFilter } from '../../features/registrations/registration-model'

const props = defineProps<{
  modelValue: ApprovalFilter
  counts: Record<ApprovalFilter, number>
}>()
const emit = defineEmits<{ 'update:modelValue': [value: ApprovalFilter] }>()
const options: Array<{ key: ApprovalFilter; label: string }> = [
  { key: 'attention', label: 'Cần xử lý' },
  { key: 'approved', label: 'Đã duyệt' },
  { key: 'revision', label: 'Cần sửa' },
  { key: 'all', label: 'Tất cả' },
]
</script>

<template>
  <div class="approval-filters" role="tablist" aria-label="Lọc đăng ký">
    <button
      v-for="item in options"
      :key="item.key"
      type="button"
      role="tab"
      :aria-selected="props.modelValue === item.key"
      :class="{ active: props.modelValue === item.key }"
      @click="emit('update:modelValue', item.key)"
    >
      {{ item.label }} · {{ counts[item.key] }}
    </button>
  </div>
</template>

<style scoped>
.approval-filters{display:flex;gap:8px;overflow:auto;padding:2px 2px 6px;scrollbar-width:thin}.approval-filters button{min-height:42px;border:1px solid var(--border);border-radius:999px;background:var(--surface-raised);color:var(--text-muted);padding:9px 14px;font-weight:800;white-space:nowrap;cursor:pointer}.approval-filters button:hover{border-color:color-mix(in srgb,var(--color-primary) 45%,var(--border));color:var(--text)}.approval-filters button.active{background:var(--gradient-primary);border-color:color-mix(in srgb,var(--color-primary) 65%,var(--border));color:var(--color-on-action);box-shadow:0 5px 14px color-mix(in srgb,var(--color-primary) 16%,transparent)}.approval-filters button:focus-visible{outline:3px solid var(--focus-inner);outline-offset:2px}
</style>
