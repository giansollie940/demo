<script setup lang="ts">
import { Search } from 'lucide-vue-next'
import type { TrackingFilter, TrackingSort } from '../../features/tracking/tracking-model'
withDefaults(defineProps<{modelValue:TrackingFilter;counts:Record<TrackingFilter,number>;query:string;sort:TrackingSort;showFilters?:boolean}>(),{showFilters:true})
const emit=defineEmits<{ 'update:modelValue':[value:TrackingFilter];'update:query':[value:string];'update:sort':[value:TrackingSort] }>()
const filters:Array<{key:TrackingFilter;label:string}>=[
  {key:'all',label:'Tất cả'},{key:'registered',label:'Đã đăng ký'},{key:'missing',label:'Chưa đăng ký'},{key:'attention',label:'Cần xử lý'},{key:'device',label:'Có thiết bị'},{key:'no-device',label:'Không thiết bị'},{key:'unknown-device',label:'Chưa rõ thiết bị'},
]
</script>
<template>
  <div class="tracking-controls">
    <div v-if="showFilters" class="filter-chips" role="tablist" aria-label="Lọc học sinh"><button v-for="item in filters" :key="item.key" type="button" role="tab" :aria-selected="modelValue===item.key" :class="{active:modelValue===item.key}" @click="emit('update:modelValue',item.key)">{{ item.label }} · {{ counts[item.key] }}</button></div>
    <div class="search-sort"><label class="search"><Search aria-hidden="true"/><span class="sr-only">Tìm học sinh</span><input :value="query" placeholder="Tìm mã, tên hoặc nội dung" @input="emit('update:query',($event.target as HTMLInputElement).value)"></label><label class="sort"><span>Sắp xếp</span><select :value="sort" @change="emit('update:sort',($event.target as HTMLSelectElement).value as TrackingSort)"><option value="name">Theo tên</option><option value="code">Theo mã</option><option value="status">Theo trạng thái</option></select></label></div>
  </div>
</template>
<style scoped>
.tracking-controls{display:grid;gap:12px}.filter-chips{display:flex;gap:8px;overflow:auto;padding-bottom:2px}.filter-chips button{min-height:40px;border:1px solid var(--border);border-radius:999px;padding:8px 12px;background:var(--surface-raised);color:var(--text-muted);font-weight:800;white-space:nowrap;transition:transform var(--transition-fast),border-color var(--transition-fast),box-shadow var(--transition-fast),background var(--transition-fast)}.filter-chips button:hover{transform:translateY(-2px);border-color:color-mix(in srgb,var(--color-sky) 35%,var(--border));box-shadow:var(--shadow-sm)}.filter-chips button.active{background:var(--gradient-primary);border-color:color-mix(in srgb,var(--color-primary) 65%,var(--border));color:var(--color-on-action);box-shadow:0 5px 14px color-mix(in srgb,var(--color-primary) 16%,transparent)}.search-sort{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px}.search{display:flex;align-items:center;gap:8px;border:1px solid var(--border);border-radius:12px;padding:0 11px;background:var(--surface-raised)}.search svg{width:17px;color:var(--text-muted)}.search input{min-width:0;width:100%;min-height:42px;border:0;outline:0;background:transparent;color:var(--text)}.sort{display:flex;align-items:center;gap:8px;color:var(--text-muted);font-size:.82rem}.sort select{min-height:42px;border:1px solid var(--border);border-radius:12px;background:var(--surface-raised);color:var(--text);padding:0 10px}@media(prefers-reduced-motion:reduce){.filter-chips button{transition:none}.filter-chips button:hover{transform:none}}@media(max-width:680px){.search-sort{grid-template-columns:1fr}.sort{justify-content:space-between}.sort select{flex:1}}
</style>
