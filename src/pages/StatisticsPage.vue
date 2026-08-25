<script setup lang="ts">
import { computed } from 'vue'
import { BarChart3, CheckCircle2, CircleAlert, Download, UserRoundX } from 'lucide-vue-next'
import AppButton from '../components/ui/AppButton.vue'
import AppCard from '../components/ui/AppCard.vue'
import { useAuthStore } from '../stores/auth'
import { useContextStore } from '../stores/context'
import { statisticsCsv, statisticsForWeek, statisticsTrend } from '../features/statistics/statistics-model'

const auth = useAuthStore()
const context = useContextStore()
const state = computed(() => auth.legacyState)
const current = computed(() => state.value && context.selectedWeekId ? statisticsForWeek(state.value, context.selectedWeekId) : null)
const rows = computed(() => state.value ? statisticsTrend(state.value, 12) : [])

function exportCsv() {
  if (!state.value || !context.selectedWeekId) return
  const csv = statisticsCsv(state.value, context.selectedWeekId)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `so-tu-hoc-tuan-${context.selectedWeek?.number ?? ''}.csv`
  anchor.click()
  URL.revokeObjectURL(url)
}
</script>

<template>
  <div class="page-stack statistics-page">
    <header class="page-header"><div><span>THỐNG KÊ LỚP</span><h1>Tỷ lệ hoàn thành</h1><p>Đăng ký hợp lệ, trường hợp cần xử lý và xu hướng theo 12 tuần.</p></div><AppButton variant="secondary" @click="exportCsv"><Download />Xuất CSV</AppButton></header>
    <section v-if="current" class="metric-grid">
      <AppCard class="metric success"><CheckCircle2/><span>Đăng ký hợp lệ</span><b>{{ current.valid }}</b></AppCard>
      <AppCard class="metric warning"><CircleAlert/><span>Cần xử lý</span><b>{{ current.issues }}</b></AppCard>
      <AppCard class="metric danger"><UserRoundX/><span>Chưa đăng ký</span><b>{{ current.missing }}</b></AppCard>
      <AppCard class="metric primary"><BarChart3/><span>Hoàn thành hợp lệ</span><b>{{ current.rate }}%</b></AppCard>
    </section>
    <AppCard padding="lg">
      <div class="section-head"><div><span>XU HƯỚNG 12 TUẦN</span><h2>Tỷ lệ hoàn thành theo tuần</h2></div></div>
      <div v-if="rows.length" class="trend-list">
        <article v-for="row in rows" :key="row.week.id" class="trend-row">
          <div><b>Tuần {{ row.week.number }}</b><small>{{ row.valid }} hợp lệ · {{ row.issues }} cần xử lý · {{ row.missing }} chưa đăng ký</small></div>
          <div class="track"><span :style="{width:`${row.rate}%`}" /></div><strong>{{ row.rate }}%</strong>
        </article>
      </div>
      <p v-else class="empty">Chưa có dữ liệu thống kê.</p>
    </AppCard>
  </div>
</template>

<style scoped>
.statistics-page{max-width:1500px;margin:0 auto}.page-header{display:flex;align-items:flex-end;justify-content:space-between;gap:20px}.page-header span,.section-head span{color:var(--color-primary);font-size:.78rem;font-weight:850;letter-spacing:.08em}.page-header h1{margin:7px 0;font-size:clamp(2rem,4vw,3rem)}.page-header p{margin:0;color:var(--text-muted)}.page-header svg{width:18px}.metric-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}.metric{display:grid;grid-template-columns:auto 1fr;gap:6px 12px;align-items:center}.metric :deep(svg){grid-row:1/3;width:24px;color:var(--color-primary)}.metric span{color:var(--text-muted);font-size:.85rem;font-weight:750}.metric b{font-size:1.8rem}.metric.success :deep(svg){color:var(--color-success)}.metric.warning :deep(svg){color:var(--color-warning)}.metric.danger :deep(svg){color:var(--color-danger)}.section-head h2{margin:6px 0 18px}.trend-list{display:grid;gap:10px}.trend-row{display:grid;grid-template-columns:minmax(220px,.9fr) minmax(180px,1.5fr) 58px;align-items:center;gap:16px;padding:12px 0;border-bottom:1px solid var(--border)}.trend-row:last-child{border-bottom:0}.trend-row>div:first-child{display:grid;gap:4px}.trend-row small{color:var(--text-muted)}.track{height:9px;border-radius:999px;background:var(--surface-soft);overflow:hidden}.track span{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,var(--color-primary),var(--color-info))}.trend-row strong{text-align:right}.empty{color:var(--text-muted)}@media(max-width:900px){.metric-grid{grid-template-columns:repeat(2,1fr)}.trend-row{grid-template-columns:1fr 56px}.track{grid-column:1/-1;grid-row:2}.trend-row strong{grid-column:2;grid-row:1}}@media(max-width:600px){.page-header{align-items:flex-start;flex-direction:column}.metric-grid{grid-template-columns:1fr 1fr}.metric{padding:14px}.trend-row{grid-template-columns:1fr 50px}}@media(max-width:380px){.metric-grid{grid-template-columns:1fr}}
</style>
