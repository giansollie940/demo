<script setup lang="ts">
import { CalendarDays, CheckCircle2 } from 'lucide-vue-next'
import AppButton from '../ui/AppButton.vue'
import AppBadge from '../ui/AppBadge.vue'
import type { AdminSchoolYearRecord } from '../../features/admin/admin-directory'

defineProps<{item:AdminSchoolYearRecord;busy:boolean}>()
const emit=defineEmits<{activate:[id:string]}>()
function formatDate(value:string){if(!value)return'—';const [y,m,d]=value.split('-');return `${d}/${m}/${y}`}
</script>
<template>
  <article class="year-card" :class="{active:item.active}">
    <div class="year-icon"><CalendarDays/></div>
    <div class="year-copy"><div class="year-title"><h3>{{ item.name }}</h3><AppBadge v-if="item.active" tone="success"><CheckCircle2/>Đang hoạt động</AppBadge></div><p>{{ formatDate(item.startDate) }} → {{ formatDate(item.endDate) }}</p></div>
    <AppButton v-if="!item.active" variant="secondary" :loading="busy" @click="emit('activate',item.id)">Đặt đang hoạt động</AppButton>
  </article>
</template>
<style scoped>
.year-card{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:14px;padding:16px;border:1px solid color-mix(in srgb,var(--color-coral) 12%,var(--border));border-radius:18px;background:linear-gradient(125deg,color-mix(in srgb,var(--surface) 94%,transparent),color-mix(in srgb,var(--wash-peach) 48%,var(--surface)));box-shadow:0 8px 22px rgb(79 55 73 / .06);transition:transform var(--transition-fast),box-shadow var(--transition-fast),border-color var(--transition-fast),background var(--theme-transition)}.year-card:hover{transform:translateY(-2px);border-color:color-mix(in srgb,var(--color-coral) 28%,var(--border));box-shadow:0 14px 30px color-mix(in srgb,var(--color-coral) 10%,transparent)}.year-card.active{background:linear-gradient(125deg,color-mix(in srgb,var(--wash-cream) 72%,var(--surface)),color-mix(in srgb,var(--wash-violet) 45%,var(--surface)));border-color:color-mix(in srgb,var(--color-primary) 22%,var(--border))}.year-icon{width:44px;height:44px;display:grid;place-items:center;border-radius:15px;background:linear-gradient(145deg,var(--wash-peach),var(--wash-violet));color:var(--color-primary)}.year-icon svg{width:21px}.year-title{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.year-title h3{margin:0;font-size:1.08rem}.year-copy p{margin:5px 0 0;color:var(--text-muted);font-size:.85rem}.year-title :deep(svg){width:14px}@media(max-width:720px){.year-card{grid-template-columns:auto 1fr}.year-card :deep(.app-button){grid-column:1/-1;width:100%}}
</style>
