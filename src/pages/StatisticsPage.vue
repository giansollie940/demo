<script setup lang="ts">
import { computed } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { BarChart3, CheckCircle2, CircleAlert, Download, UserRoundX } from 'lucide-vue-next'
import AppButton from '../components/ui/AppButton.vue'
import AppCard from '../components/ui/AppCard.vue'
import AppBadge from '../components/ui/AppBadge.vue'
import { useAuthStore } from '../stores/auth'
import { useContextStore } from '../stores/context'
import { useWeekData } from '../features/weeks/queries'
import { legacyApi } from '../services/legacy-supabase'
import { mergeWeekData, statisticsCsv, statisticsForWeek } from '../features/statistics/statistics-model'
import type { WeekData } from '../types/legacy'

const auth = useAuthStore()
const context = useContextStore()
const state = computed(() => auth.legacyState)
const isLearner = computed(() => auth.currentUser?.role === 'student' || auth.currentUser?.role === 'monitor')
const classId = computed(() => context.selectedClassId)
const weekId = computed(() => context.selectedWeekId)
const selectedWeekQuery = useWeekData(classId, weekId)
const trendWeeks = computed(() => [...(state.value?.weeks ?? [])].slice(0, 12))
const trendQuery = useQuery<Record<string, WeekData>>({
  queryKey: computed(() => ['statistics-week-history', classId.value ?? 'none', ...trendWeeks.value.map(week => week.id)]),
  enabled: computed(() => trendWeeks.value.length > 0),
  queryFn: async () => {
    const rows = await Promise.all(trendWeeks.value.map(async week => [week.id, await legacyApi.loadWeekData(week.id, classId.value)] as const))
    return Object.fromEntries(rows)
  },
  staleTime: 60_000,
})
const selectedState = computed(() => {
  if (!state.value || !weekId.value) return null
  const data = selectedWeekQuery.data.value
  return data ? mergeWeekData(state.value, weekId.value, data) : null
})
const personalState = computed(() => {
  const source = selectedState.value
  const user = auth.currentUser
  if (!source || !user || !isLearner.value) return source
  return { ...source, users: [user], registrations: source.registrations.filter(row => row.studentId === auth.currentUser!.id) }
})
const current = computed(() => personalState.value && weekId.value ? statisticsForWeek(personalState.value, weekId.value) : null)
const rows = computed(() => {
  if (!state.value || !trendQuery.data.value) return []
  return trendWeeks.value.map(week => {
    const data = trendQuery.data.value?.[week.id]
    const merged = data ? mergeWeekData(state.value!, week.id, data) : state.value!
    const scoped = isLearner.value && auth.currentUser ? { ...merged, users: [auth.currentUser], registrations: merged.registrations.filter(row => row.studentId === auth.currentUser!.id) } : merged
    return { week, ...statisticsForWeek(scoped, week.id) }
  })
})
const isFetching = computed(() => selectedWeekQuery.isFetching.value || trendQuery.isFetching.value)

function exportCsv() {
  if (!personalState.value || !context.selectedWeekId) return
  const csv = statisticsCsv(personalState.value, context.selectedWeekId)
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
    <header class="page-header"><div><span>{{ isLearner?'THỐNG KÊ CÁ NHÂN':'THỐNG KÊ LỚP' }}</span><h1>{{ isLearner?'Tiến độ của tôi':'Tỷ lệ hoàn thành' }}</h1><p>{{ isLearner?'Đăng ký hợp lệ, mục cần xử lý và xu hướng cá nhân theo 12 tuần.':'Đăng ký hợp lệ, trường hợp cần xử lý và xu hướng theo 12 tuần.' }}</p></div><div class="header-actions"><AppBadge :tone="isFetching?'info':'success'">{{ isFetching?'Đang tải tuần':'Dữ liệu tuần đã tải' }}</AppBadge><AppButton variant="secondary" :disabled="!personalState" @click="exportCsv"><Download />Xuất CSV</AppButton></div></header>
    <section v-if="current" class="metric-grid">
      <AppCard class="metric success"><CheckCircle2/><span>Đăng ký hợp lệ</span><b>{{ current.valid }}</b></AppCard>
      <AppCard class="metric warning"><CircleAlert/><span>Cần xử lý</span><b>{{ current.issues }}</b></AppCard>
      <AppCard class="metric danger"><UserRoundX/><span>Chưa đăng ký</span><b>{{ current.missing }}</b></AppCard>
      <AppCard class="metric primary"><BarChart3/><span>Hoàn thành hợp lệ</span><b>{{ current.rate }}%</b></AppCard>
    </section>
    <AppCard v-else padding="lg"><p class="empty">Đang tải dữ liệu của tuần {{ context.selectedWeek?.number ?? '' }}…</p></AppCard>
    <AppCard padding="lg">
      <div class="section-head"><div><span>XU HƯỚNG 12 TUẦN</span><h2>Tỷ lệ hoàn thành theo tuần</h2></div></div>
      <div v-if="rows.length" class="trend-list">
        <article v-for="row in rows" :key="row.week.id" class="trend-row">
          <div><b>Tuần {{ row.week.number }}</b><small>{{ row.valid }} hợp lệ · {{ row.issues }} cần xử lý · {{ row.missing }} chưa đăng ký</small></div>
          <div class="track"><span :style="{width:`${row.rate}%`}" /></div><strong>{{ row.rate }}%</strong>
        </article>
      </div>
      <p v-else class="empty">{{ isFetching?'Đang tải dữ liệu 12 tuần…':'Chưa có dữ liệu thống kê.' }}</p>
    </AppCard>
  </div>
</template>

<style scoped>
.statistics-page{max-width:1500px;margin:0 auto}.page-header{display:flex;align-items:flex-end;justify-content:space-between;gap:20px}.page-header span,.section-head span{color:var(--color-primary);font-size:var(--font-size-ui-min);font-weight:850;letter-spacing:.08em}.page-header h1{margin:7px 0;font-size:clamp(2rem,4vw,3rem)}.page-header p{margin:0;color:var(--text-muted)}.page-header svg{width:18px}.header-actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap;justify-content:flex-end}.metric-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}.metric{display:grid;grid-template-columns:auto 1fr;gap:6px 12px;align-items:center}.metric :deep(svg){grid-row:1/3;width:24px;color:var(--color-primary)}.metric span{color:var(--text-muted);font-size:.85rem;font-weight:750}.metric b{font-size:1.8rem}.metric.success :deep(svg){color:var(--color-success)}.metric.warning :deep(svg){color:var(--color-warning)}.metric.danger :deep(svg){color:var(--color-danger)}.section-head h2{margin:6px 0 18px}.trend-list{display:grid;gap:10px}.trend-row{display:grid;grid-template-columns:minmax(220px,.9fr) minmax(180px,1.5fr) 58px;align-items:center;gap:16px;padding:12px 0;border-bottom:1px solid var(--border)}.trend-row:last-child{border-bottom:0}.trend-row>div:first-child{display:grid;gap:4px}.trend-row small{color:var(--text-muted)}.track{height:9px;border-radius:999px;background:var(--surface-soft);overflow:hidden}.track span{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,var(--color-primary),var(--color-info))}.trend-row strong{text-align:right}.empty{color:var(--text-muted)}@media(max-width:900px){.metric-grid{grid-template-columns:repeat(2,1fr)}.trend-row{grid-template-columns:1fr 56px}.track{grid-column:1/-1;grid-row:2}.trend-row strong{grid-column:2;grid-row:1}}@media(max-width:600px){.page-header{align-items:flex-start;flex-direction:column}.header-actions{justify-content:flex-start}.metric-grid{grid-template-columns:1fr 1fr}.metric{padding:14px}.trend-row{grid-template-columns:1fr 50px}}@media(max-width:380px){.metric-grid{grid-template-columns:1fr}}
</style>
