<script setup lang="ts">
import { computed } from 'vue'
import AppTabs from '../ui/AppTabs.vue'

const props = defineProps<{ modelValue: 'default' | 'week'; weekNumber: number | string }>()
const emit = defineEmits<{ 'update:modelValue': [value: 'default' | 'week'] }>()
const items = computed(() => [
  { id: 'default', label: 'TKB mặc định' },
  { id: 'week', label: `TKB riêng · Tuần ${props.weekNumber}` },
])
</script>

<template>
  <AppTabs
    :model-value="modelValue"
    :items="items"
    label="Chế độ thời khóa biểu"
    @update:model-value="emit('update:modelValue', $event as 'default' | 'week')"
  />
</template>
