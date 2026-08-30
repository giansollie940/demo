<script setup lang="ts">
import { computed } from 'vue'
import { Laptop, LaptopMinimalCheck, UserRoundX, CircleHelp } from 'lucide-vue-next'
import type { TrackingFilter, TrackingQuickReportRow } from '../../features/tracking/tracking-model'
const props=defineProps<{rows:TrackingQuickReportRow[];filter:Extract<TrackingFilter,'missing'|'device'|'no-device'|'unknown-device'>;sessionLabel:string}>()
const title=computed(()=>props.filter==='missing'?'Chưa đăng ký':props.filter==='device'?'Có thiết bị':props.filter==='no-device'?'Không có thiết bị':'Chưa xác định thiết bị')
const icon=computed(()=>props.filter==='missing'?UserRoundX:props.filter==='device'?LaptopMinimalCheck:props.filter==='no-device'?Laptop:CircleHelp)
const deviceText=(row:TrackingQuickReportRow)=>row.deviceState==='device'?'Có':row.deviceState==='no-device'?'Không':'Chưa xác định'
</script>
<template>
  <section class="quick-report" aria-label="Báo cáo nhanh theo buổi">
    <header><div class="title"><span class="icon"><component :is="icon"/></span><div><small>BÁO CÁO NHANH · {{ sessionLabel }}</small><h3>{{ title }}</h3></div></div><b class="count">{{ rows.length }}</b></header>
    <div class="table-wrap"><table><thead><tr><th>#</th><th>Học sinh</th><th>Mã</th><th v-if="filter!=='missing'">Thiết bị</th></tr></thead><tbody><tr v-for="(row,index) in rows" :key="row.id"><td>{{ index+1 }}</td><td><b>{{ row.name }}</b></td><td>{{ row.code }}</td><td v-if="filter!=='missing'"><span class="device-pill" :class="row.deviceState">{{ deviceText(row) }}</span></td></tr></tbody></table></div>
    <div v-if="!rows.length" class="empty">Không có học sinh thuộc nhóm này trong <b>{{ sessionLabel }}</b>.</div>
  </section>
</template>
<style scoped>
.quick-report{border:1px solid var(--border);border-radius:18px;overflow:hidden;background:color-mix(in srgb,var(--surface) 93%,transparent)}header{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 16px;background:linear-gradient(135deg,var(--wash-cream),color-mix(in srgb,var(--wash-violet) 45%,var(--surface)))}.title{display:flex;align-items:center;gap:10px}.icon{width:38px;height:38px;border-radius:12px;display:grid;place-items:center;background:var(--surface);color:var(--color-primary);box-shadow:var(--shadow-sm)}.icon :deep(svg){width:19px}.title small{color:var(--text-muted);font-size:var(--font-size-ui-min);font-weight:900;letter-spacing:.05em}.title h3{margin:2px 0 0}.count{min-width:42px;height:42px;padding:0 10px;border-radius:999px;display:grid;place-items:center;background:var(--surface);color:var(--color-primary);font-size:1.2rem}.table-wrap{overflow:auto}table{width:100%;border-collapse:collapse}th,td{padding:11px 14px;border-bottom:1px solid var(--border);text-align:left}th{font-size:var(--font-size-ui-min);color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em}td:first-child{width:52px;color:var(--text-muted)}.device-pill{display:inline-flex;padding:5px 9px;border-radius:999px;background:var(--surface-soft);font-size:var(--font-size-ui-min);font-weight:850}.device-pill.device{background:var(--wash-mint);color:var(--color-success)}.device-pill.no-device{background:var(--wash-coral);color:var(--color-danger)}.device-pill.unknown-device{background:var(--wash-sun);color:var(--color-warning)}.empty{padding:24px;text-align:center;color:var(--text-muted)}
</style>
