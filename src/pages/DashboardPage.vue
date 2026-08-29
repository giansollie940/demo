<script setup lang="ts">
import { computed } from 'vue'
import { AlertTriangle, CheckCircle2, ClipboardClock, ClipboardList, UsersRound } from 'lucide-vue-next'
import DashboardHero from '../components/dashboard/DashboardHero.vue'
import KpiTrendCard from '../components/dashboard/KpiTrendCard.vue'
import PendingTasksTable from '../components/dashboard/PendingTasksTable.vue'
import WeeklyProgressCard from '../components/dashboard/WeeklyProgressCard.vue'
import AppCard from '../components/ui/AppCard.vue'
import dashboardIllustrationUrl from '../assets/images/r7-dashboard-students@2x.png'
import { useAuthStore } from '../stores/auth'
import { useContextStore } from '../stores/context'
import { useWeekData } from '../features/weeks/queries'
import { buildDashboardMetrics } from '../features/dashboard/dashboard-model'
import { buildDashboardQueue, buildMotivationMessage } from '../features/dashboard/dashboard-presenter'
import { useDailyQuote } from '../features/owl/daily-quote'
import { useNowTicker } from '../features/shared/useNowTicker'
import { needsTeacherAction } from '../features/registrations/registration-model'

const auth = useAuthStore()
const context = useContextStore()
const nowMs = useNowTicker(30_000)
const classId = computed(() => context.selectedClassId)
const weekId = computed(() => context.selectedWeekId)
const weekQuery = useWeekData(classId, weekId)

const isStudent = computed(() => auth.currentUser?.role === 'student')
const isMonitor = computed(() => auth.currentUser?.role === 'monitor')
const isLearner = computed(() => isStudent.value || isMonitor.value)
const week = computed(() => context.selectedWeek)
const classLabel = computed(() => context.selectedClass?.name || context.selectedClass?.code || auth.legacyState?.settings.className || 'Lớp')
const weekLabel = computed(() => week.value ? `Tuần ${week.value.number} · ${week.value.startDate} – ${week.value.endDate}` : 'Tuần –')

const slots = computed(() => {
  const state = auth.legacyState
  if (!state) return []
  const overrides = (weekQuery.data.value?.overrides ?? state.overrides ?? []).filter(row => row.weekId === weekId.value)
  return overrides.length
    ? overrides.filter(row => row.active !== false).map(row => ({ dow: row.dow, period: row.period }))
    : state.schedule ?? []
})

const registrations = computed(() => weekQuery.data.value?.registrations
  ?? auth.legacyState?.registrations.filter(row => row.weekId === weekId.value)
  ?? [])
const personalRegistrations = computed(() => registrations.value.filter(row => row.studentId === auth.currentUser?.id))

const classMetrics = computed(() => buildDashboardMetrics({
  users: auth.legacyState?.users ?? [],
  registrations: registrations.value,
  slots: slots.value,
  week: week.value,
  periods: auth.legacyState?.periods ?? [],
  nowMs: nowMs.value,
}))
const personalMetrics = computed(() => buildDashboardMetrics({
  users: auth.currentUser ? [auth.currentUser] : [],
  registrations: personalRegistrations.value,
  slots: slots.value,
  week: week.value,
  periods: auth.legacyState?.periods ?? [],
  nowMs: nowMs.value,
}))
const activeMetrics = computed(() => isLearner.value ? personalMetrics.value : classMetrics.value)
const managerQueue = computed(() => registrations.value.filter(row => needsTeacherAction(row)).length)
const attentionCount = computed(() => activeMetrics.value.needsRevision + activeMetrics.value.issues)
const queueRows = computed(() => {
  const rows = buildDashboardQueue({
    registrations: registrations.value,
    users: auth.legacyState?.users ?? [],
    classLabel: classLabel.value,
    nowMs: nowMs.value,
  })
  return isLearner.value ? rows.filter(row => row.studentId === auth.currentUser?.id) : rows
})
const motivation = computed(() => buildMotivationMessage(activeMetrics.value))
const isFetching = computed(() => weekQuery.isFetching.value)
const dailyQuoteQuery = useDailyQuote()
const dailyQuote = computed(() => dailyQuoteQuery.data.value)
const heroSubtitle = computed(() => isLearner.value
  ? 'Cùng nhìn lại tiến độ và hoàn thành kế hoạch tự học trong tuần này.'
  : 'Cùng nhìn lại tiến độ của lớp và ưu tiên những mục cần xử lý trong tuần.')
</script>

<template>
  <div class="dashboard-r7">
    <DashboardHero
      :name="auth.currentUser?.name ?? 'bạn'"
      :week-label="weekLabel"
      :class-label="classLabel"
      :sync-label="isFetching ? 'Đang đồng bộ' : 'Đã đồng bộ'"
      :subtitle="heroSubtitle"
      :illustration-src="dashboardIllustrationUrl"
    />

    <section class="dashboard-kpi-grid">
      <KpiTrendCard
        v-if="!isLearner"
        label="Học sinh"
        :value="classMetrics.students"
        context="Đang hoạt động"
        :icon="UsersRound"
        tone="blue"
      />
      <KpiTrendCard
        v-else
        label="Buổi tự học"
        :value="`${personalMetrics.submitted}/${personalMetrics.slots}`"
        context="Đã đăng ký"
        :icon="ClipboardList"
        tone="blue"
      />
      <KpiTrendCard label="Đã đăng ký" :value="`${activeMetrics.completion}%`" context="Tuần này" :icon="CheckCircle2" tone="green" />
      <KpiTrendCard
        :label="isLearner ? 'Cần chỉnh sửa' : 'Cần GV xử lý'"
        :value="isLearner ? activeMetrics.needsRevision : managerQueue"
        :context="isLearner ? 'Theo phản hồi' : 'Chờ duyệt'"
        :icon="ClipboardClock"
        tone="amber"
      />
      <KpiTrendCard label="Cần chú ý" :value="attentionCount" context="Quá hạn / Bất thường" :icon="AlertTriangle" tone="violet" />
    </section>

    <section class="dashboard-workspace-r7">
      <PendingTasksTable
        :rows="queueRows"
        :total="isLearner ? queueRows.length : managerQueue"
        :revision-count="activeMetrics.needsRevision"
        :issue-count="activeMetrics.issues"
      />
      <WeeklyProgressCard
        :completion="activeMetrics.completion"
        :submitted="activeMetrics.submitted"
        :approved="activeMetrics.approved"
        :attention="attentionCount"
        :expected="activeMetrics.expected"
        :motivation="motivation"
      />
    </section>

    <section class="daily-quote-r7">
      <AppCard padding="md">
        <span>Danh ngôn hôm nay</span>
        <blockquote>“{{ dailyQuote?.text || 'Mỗi ngày học một điều mới là một bước tiến.' }}”</blockquote>
        <cite>— {{ dailyQuote?.author || 'Cú Thông Thái' }}</cite>
      </AppCard>
    </section>
  </div>
</template>

<style scoped>
.dashboard-r7 { width: min(1300px, 100%); margin: 0 auto; display: grid; gap: 14px; }
.dashboard-kpi-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
.dashboard-workspace-r7 { display: grid; grid-template-columns: minmax(0, 1.62fr) minmax(330px, .92fr); gap: 14px; align-items: stretch; }
.daily-quote-r7 { margin-top: 2px; }
.daily-quote-r7 :deep(.app-card) { background: linear-gradient(105deg, color-mix(in srgb,var(--wash-sky) 52%,var(--surface)), color-mix(in srgb,var(--wash-pink) 45%,var(--surface))); }
.daily-quote-r7 span { color: var(--color-primary); font-size: .67rem; font-weight: 900; letter-spacing: .11em; }
.daily-quote-r7 blockquote { margin: 8px 0 4px; color: var(--text); font-size: .91rem; font-weight: 750; }.daily-quote-r7 cite { color: var(--text-muted); font-size: .75rem; }
@media (max-width: 1120px) {
  .dashboard-kpi-grid { grid-template-columns: repeat(2,minmax(0,1fr)); }
  .dashboard-workspace-r7 { grid-template-columns: 1fr; }
}
@media (max-width: 760px) {
  .dashboard-r7 { gap: 12px; }
  .dashboard-kpi-grid { grid-template-columns: 1fr; }
  .dashboard-workspace-r7 { grid-template-columns: 1fr; }
}
</style>
