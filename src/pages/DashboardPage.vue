<script setup lang="ts">
import { computed } from 'vue'
import { AlertTriangle, CheckCircle2, ClipboardList, UsersRound } from 'lucide-vue-next'
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

<<<<<<< HEAD
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
=======
const dashboardIllustrationUrl = `${import.meta.env.BASE_URL}assets/images/student-group-dashboard.png`
const auth=useAuthStore();const context=useContextStore();const nowMs=useNowTicker(30_000);const classId=computed(()=>context.selectedClassId);const weekId=computed(()=>context.selectedWeekId);const weekQuery=useWeekData(classId,weekId)
const isStudent=computed(()=>auth.currentUser?.role==='student')
const isMonitor=computed(()=>auth.currentUser?.role==='monitor')
const isLearner=computed(()=>isStudent.value||isMonitor.value)
const slots=computed(()=>{const state=auth.legacyState;if(!state)return[];const overrides=(weekQuery.data.value?.overrides??state.overrides??[]).filter(row=>row.weekId===weekId.value);return overrides.length?overrides.filter(row=>row.active!==false).map(row=>({dow:row.dow,period:row.period})):state.schedule??[]})
const registrations=computed(()=>weekQuery.data.value?.registrations??auth.legacyState?.registrations.filter(row=>row.weekId===weekId.value)??[])
const personalRegistrations=computed(()=>registrations.value.filter(row=>row.studentId===auth.currentUser?.id))
const week=computed(()=>context.selectedWeek)
const classMetrics=computed(()=>buildDashboardMetrics({users:auth.legacyState?.users??[],registrations:registrations.value,slots:slots.value,week:week.value,periods:auth.legacyState?.periods??[],nowMs:nowMs.value}))
const personalMetrics=computed(()=>buildDashboardMetrics({users:auth.currentUser?[auth.currentUser]:[],registrations:personalRegistrations.value,slots:slots.value,week:week.value,periods:auth.legacyState?.periods??[],nowMs:nowMs.value}))
const managerQueue=computed(()=>registrations.value.filter(row=>needsTeacherAction(row)).length)
const dailyQuoteQuery=useDailyQuote();const dailyQuote=computed(()=>dailyQuoteQuery.data.value)
const isFetching=computed(()=>weekQuery.isFetching.value)
const activeMetrics=computed(()=>isLearner.value?personalMetrics.value:classMetrics.value)
const attentionCount=computed(()=>activeMetrics.value.needsRevision+activeMetrics.value.issues+(!isLearner.value?managerQueue.value:0))
>>>>>>> parent of 656f9a2 (demo 35)
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
        :icon="ClipboardList"
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
<<<<<<< HEAD
<<<<<<< HEAD
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
=======
.dashboard-page{max-width:1292px;margin:0 auto;gap:16px}.dashboard-hero{min-height:190px;display:grid;grid-template-columns:minmax(0,1fr) 470px;align-items:center;padding:24px 28px;overflow:hidden;position:relative;background:radial-gradient(circle at 76% 24%,color-mix(in srgb,var(--wash-sky) 72%,transparent),transparent 31%),radial-gradient(circle at 8% 0%,color-mix(in srgb,var(--wash-pink) 72%,transparent),transparent 36%),linear-gradient(135deg,color-mix(in srgb,var(--surface) 98%,transparent),color-mix(in srgb,var(--wash-violet) 58%,var(--surface)));border-radius:24px}.dashboard-hero::after{content:"";position:absolute;right:-82px;bottom:-122px;width:250px;height:250px;border-radius:50%;background:color-mix(in srgb,var(--color-primary) 5%,transparent);pointer-events:none}.hero-copy,.hero-illustration{position:relative;z-index:1}.hero-copy{display:grid;gap:7px;align-content:center}.hero-kicker,.role-heading span,.panel-kicker{color:var(--color-primary);font-size:.69rem;font-weight:900;letter-spacing:.12em}.hero-copy h1{margin:0;font-size:clamp(1.9rem,2.7vw,2.45rem);line-height:1.04;color:var(--text);letter-spacing:-.035em}.hero-copy p{margin:0;max-width:62ch;color:var(--text-muted);font-size:.86rem}.hero-meta{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:5px}.week-pill{display:inline-flex;padding:7px 10px;border-radius:11px;background:color-mix(in srgb,var(--surface) 86%,transparent);border:1px solid color-mix(in srgb,var(--color-primary) 12%,var(--border));color:var(--text-muted);font-size:.74rem;font-weight:800}.hero-illustration{width:470px;min-height:142px;justify-self:end;display:grid;place-items:center;overflow:visible;border-radius:0;background:transparent;box-shadow:none}.hero-illustration img{width:500px;height:156px;object-fit:contain;object-position:center 48%;border-radius:0;filter:none;-webkit-mask-image:linear-gradient(90deg,transparent 0%,rgba(0,0,0,.28) 8%,#000 24%,#000 100%);mask-image:linear-gradient(90deg,transparent 0%,rgba(0,0,0,.28) 8%,#000 24%,#000 100%)}
.role-section{display:grid;gap:10px}.role-heading h2{margin:3px 0 0;font-size:1.18rem}.metrics{display:grid;gap:14px}.dashboard-stat-grid{grid-template-columns:repeat(4,minmax(0,1fr))}.metrics :deep(.card){--metric-accent:var(--color-primary);--metric-wash:var(--wash-violet);min-height:114px;display:grid;grid-template-columns:auto 1fr;grid-template-rows:auto auto;column-gap:14px;align-items:center;padding:18px;background:linear-gradient(145deg,color-mix(in srgb,var(--surface) 96%,transparent),color-mix(in srgb,var(--metric-wash) 96%,transparent));border-color:color-mix(in srgb,var(--metric-accent) 18%,var(--border));border-radius:21px;box-shadow:0 7px 18px color-mix(in srgb,var(--metric-accent) 6%,transparent)}.metrics :deep(.card:nth-child(1)){--metric-accent:var(--color-sky);--metric-wash:var(--wash-sky)}.metrics :deep(.card:nth-child(2)){--metric-accent:var(--color-mint);--metric-wash:var(--wash-mint)}.metrics :deep(.card:nth-child(3)){--metric-accent:var(--color-sun);--metric-wash:var(--wash-sun)}.metrics :deep(.card:nth-child(4)){--metric-accent:var(--color-lilac);--metric-wash:var(--wash-violet)}.metrics :deep(svg){grid-row:1/3;width:28px;height:28px;padding:8px;border-radius:16px;color:var(--metric-accent);background:color-mix(in srgb,var(--metric-accent) 13%,var(--surface));box-sizing:content-box}.metrics b{font-size:1.72rem;line-height:1.02;color:var(--text)}.metrics span{color:var(--text-muted);font-size:.76rem;font-weight:760}
.dashboard-main-grid{display:grid;grid-template-columns:minmax(0,820px) minmax(0,454px);gap:18px}.work-panel,.overview-panel{min-height:300px;height:300px;border-radius:22px;background:color-mix(in srgb,var(--surface) 98%,transparent);border-color:color-mix(in srgb,var(--border) 92%,transparent);box-shadow:0 8px 22px rgb(79 55 73 / .055)}.work-panel.pad-lg,.overview-panel.pad-lg{padding:22px}.panel-heading h2{margin:2px 0 3px;font-size:1.18rem}.panel-heading p{margin:0;color:var(--text-muted);font-size:.76rem}.task-list{display:grid;gap:8px;margin-top:16px}.task-row{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:12px;min-height:50px;padding:8px 13px;border-radius:14px;background:color-mix(in srgb,var(--surface-soft) 66%,var(--surface));border:1px solid color-mix(in srgb,var(--border) 82%,transparent)}.task-row div{display:grid}.task-row b{font-size:.8rem}.task-row small{color:var(--text-muted);font-size:.68rem}.task-row strong{font-size:.82rem}.task-dot,.legend-dot{display:block;width:10px;height:10px;border-radius:50%}.task-warning{background:var(--color-sun)}.task-coral{background:var(--color-coral)}.task-violet{background:var(--color-lilac)}.issue-link{display:inline-flex;margin-top:10px;color:var(--color-warning);font-size:.78rem;font-weight:850}.overview-body{display:grid;grid-template-columns:190px 1fr;align-items:center;gap:18px;margin-top:14px}.progress-donut{--progress:0%;width:154px;aspect-ratio:1;border-radius:50%;display:grid;place-items:center;background:conic-gradient(var(--color-mint) var(--progress),color-mix(in srgb,var(--surface-soft) 82%,var(--border)) 0);position:relative;margin:auto}.progress-donut::after{content:"";position:absolute;inset:18px;border-radius:50%;background:var(--surface)}.progress-donut div{position:relative;z-index:1;display:grid;text-align:center}.progress-donut strong{font-size:1.42rem;color:var(--color-mint)}.progress-donut span{color:var(--text-muted);font-size:.66rem;font-weight:700}.overview-legend{display:grid;gap:11px}.overview-legend div{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:8px;color:var(--text-muted);font-size:.72rem}.overview-legend b{color:var(--text);font-size:.75rem}.legend-dot.done{background:var(--color-mint)}.legend-dot.approved{background:var(--color-sky)}.legend-dot.pending{background:var(--color-coral)}
.daily-quote :deep(.card){position:relative;overflow:hidden;background:linear-gradient(120deg,color-mix(in srgb,var(--wash-sky) 90%,transparent),color-mix(in srgb,var(--wash-violet) 88%,transparent) 48%,color-mix(in srgb,var(--wash-pink) 88%,transparent));border-color:color-mix(in srgb,var(--color-lilac) 18%,var(--border))}.daily-quote :deep(.card)::before{content:"✦";position:absolute;right:24px;top:12px;color:var(--color-sun);font-size:2rem;opacity:.6}.quote-kicker{color:var(--color-primary);font-size:.75rem;font-weight:900;letter-spacing:.08em}.daily-quote blockquote{margin:9px 0 5px;font-size:clamp(.98rem,1.7vw,1.15rem);line-height:1.55;font-weight:800}.daily-quote cite{color:var(--text-muted);font-style:normal}
@media(max-width:1400px){.dashboard-page{max-width:1180px}.dashboard-hero{grid-template-columns:minmax(0,1fr) 420px}.hero-illustration{width:420px}.hero-illustration img{width:420px}.dashboard-main-grid{grid-template-columns:minmax(0,1.55fr) minmax(320px,.85fr)}}@media(max-width:1100px){.dashboard-stat-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.dashboard-main-grid{grid-template-columns:1fr}.work-panel,.overview-panel{height:auto;min-height:300px}.dashboard-hero{grid-template-columns:1fr}.hero-illustration{width:100%;min-height:150px;justify-self:stretch;background:transparent;box-shadow:none;border-radius:0}.hero-illustration img{width:100%;height:160px;border-radius:0}.overview-body{grid-template-columns:minmax(170px,220px) 1fr}}@media(max-width:640px){.dashboard-stat-grid{grid-template-columns:1fr}.dashboard-hero{padding:22px 20px}.overview-body{grid-template-columns:1fr}.progress-donut{width:150px}}
>>>>>>> parent of 66b0142 (demo 36)
=======
.dashboard-page{max-width:1292px;margin:0 auto;gap:16px}.dashboard-hero{min-height:190px;display:grid;grid-template-columns:minmax(0,1fr) 470px;align-items:center;padding:24px 28px;overflow:hidden;position:relative;background:radial-gradient(circle at 76% 24%,color-mix(in srgb,var(--wash-sky) 72%,transparent),transparent 31%),radial-gradient(circle at 8% 0%,color-mix(in srgb,var(--wash-pink) 72%,transparent),transparent 36%),linear-gradient(135deg,color-mix(in srgb,var(--surface) 98%,transparent),color-mix(in srgb,var(--wash-violet) 58%,var(--surface)));border-radius:24px}.dashboard-hero::after{content:"";position:absolute;right:-82px;bottom:-122px;width:250px;height:250px;border-radius:50%;background:color-mix(in srgb,var(--color-primary) 5%,transparent);pointer-events:none}.hero-copy,.hero-illustration{position:relative;z-index:1}.hero-copy{display:grid;gap:7px;align-content:center}.hero-kicker,.role-heading span,.panel-kicker{color:var(--color-primary);font-size:.69rem;font-weight:900;letter-spacing:.12em}.hero-copy h1{margin:0;font-size:clamp(1.9rem,2.7vw,2.45rem);line-height:1.04;color:var(--text);letter-spacing:-.035em}.hero-copy p{margin:0;max-width:62ch;color:var(--text-muted);font-size:.86rem}.hero-meta{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:5px}.week-pill{display:inline-flex;padding:7px 10px;border-radius:11px;background:color-mix(in srgb,var(--surface) 86%,transparent);border:1px solid color-mix(in srgb,var(--color-primary) 12%,var(--border));color:var(--text-muted);font-size:.74rem;font-weight:800}.hero-illustration{width:470px;min-height:142px;justify-self:end;display:grid;place-items:center;overflow:hidden;border-radius:22px;background:color-mix(in srgb,var(--wash-sky) 80%,var(--surface));box-shadow:0 10px 24px color-mix(in srgb,var(--color-primary) 8%,transparent)}.hero-illustration img{width:470px;height:142px;object-fit:cover;object-position:center 48%;border-radius:22px;filter:none}
.role-section{display:grid;gap:10px}.role-heading h2{margin:3px 0 0;font-size:1.18rem}.metrics{display:grid;gap:14px}.dashboard-stat-grid{grid-template-columns:repeat(4,minmax(0,1fr))}.metrics :deep(.card){--metric-accent:var(--color-primary);--metric-wash:var(--wash-violet);min-height:114px;display:grid;grid-template-columns:auto 1fr;grid-template-rows:auto auto;column-gap:14px;align-items:center;padding:18px;background:linear-gradient(145deg,color-mix(in srgb,var(--surface) 96%,transparent),color-mix(in srgb,var(--metric-wash) 96%,transparent));border-color:color-mix(in srgb,var(--metric-accent) 18%,var(--border));border-radius:21px;box-shadow:0 7px 18px color-mix(in srgb,var(--metric-accent) 6%,transparent)}.metrics :deep(.card:nth-child(1)){--metric-accent:var(--color-sky);--metric-wash:var(--wash-sky)}.metrics :deep(.card:nth-child(2)){--metric-accent:var(--color-mint);--metric-wash:var(--wash-mint)}.metrics :deep(.card:nth-child(3)){--metric-accent:var(--color-sun);--metric-wash:var(--wash-sun)}.metrics :deep(.card:nth-child(4)){--metric-accent:var(--color-lilac);--metric-wash:var(--wash-violet)}.metrics :deep(svg){grid-row:1/3;width:28px;height:28px;padding:8px;border-radius:16px;color:var(--metric-accent);background:color-mix(in srgb,var(--metric-accent) 13%,var(--surface));box-sizing:content-box}.metrics b{font-size:1.72rem;line-height:1.02;color:var(--text)}.metrics span{color:var(--text-muted);font-size:.76rem;font-weight:760}
.dashboard-main-grid{display:grid;grid-template-columns:minmax(0,820px) minmax(0,454px);gap:18px}.work-panel,.overview-panel{min-height:300px;height:300px;border-radius:22px;background:color-mix(in srgb,var(--surface) 98%,transparent);border-color:color-mix(in srgb,var(--border) 92%,transparent);box-shadow:0 8px 22px rgb(79 55 73 / .055)}.work-panel.pad-lg,.overview-panel.pad-lg{padding:22px}.panel-heading h2{margin:2px 0 3px;font-size:1.18rem}.panel-heading p{margin:0;color:var(--text-muted);font-size:.76rem}.task-list{display:grid;gap:8px;margin-top:16px}.task-row{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:12px;min-height:50px;padding:8px 13px;border-radius:14px;background:color-mix(in srgb,var(--surface-soft) 66%,var(--surface));border:1px solid color-mix(in srgb,var(--border) 82%,transparent)}.task-row div{display:grid}.task-row b{font-size:.8rem}.task-row small{color:var(--text-muted);font-size:.68rem}.task-row strong{font-size:.82rem}.task-dot,.legend-dot{display:block;width:10px;height:10px;border-radius:50%}.task-warning{background:var(--color-sun)}.task-coral{background:var(--color-coral)}.task-violet{background:var(--color-lilac)}.issue-link{display:inline-flex;margin-top:10px;color:var(--color-warning);font-size:.78rem;font-weight:850}.overview-body{display:grid;grid-template-columns:190px 1fr;align-items:center;gap:18px;margin-top:14px}.progress-donut{--progress:0%;width:154px;aspect-ratio:1;border-radius:50%;display:grid;place-items:center;background:conic-gradient(var(--color-mint) var(--progress),color-mix(in srgb,var(--surface-soft) 82%,var(--border)) 0);position:relative;margin:auto}.progress-donut::after{content:"";position:absolute;inset:18px;border-radius:50%;background:var(--surface)}.progress-donut div{position:relative;z-index:1;display:grid;text-align:center}.progress-donut strong{font-size:1.42rem;color:var(--color-mint)}.progress-donut span{color:var(--text-muted);font-size:.66rem;font-weight:700}.overview-legend{display:grid;gap:11px}.overview-legend div{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:8px;color:var(--text-muted);font-size:.72rem}.overview-legend b{color:var(--text);font-size:.75rem}.legend-dot.done{background:var(--color-mint)}.legend-dot.approved{background:var(--color-sky)}.legend-dot.pending{background:var(--color-coral)}
.daily-quote :deep(.card){position:relative;overflow:hidden;background:linear-gradient(120deg,color-mix(in srgb,var(--wash-sky) 90%,transparent),color-mix(in srgb,var(--wash-violet) 88%,transparent) 48%,color-mix(in srgb,var(--wash-pink) 88%,transparent));border-color:color-mix(in srgb,var(--color-lilac) 18%,var(--border))}.daily-quote :deep(.card)::before{content:"✦";position:absolute;right:24px;top:12px;color:var(--color-sun);font-size:2rem;opacity:.6}.quote-kicker{color:var(--color-primary);font-size:.75rem;font-weight:900;letter-spacing:.08em}.daily-quote blockquote{margin:9px 0 5px;font-size:clamp(.98rem,1.7vw,1.15rem);line-height:1.55;font-weight:800}.daily-quote cite{color:var(--text-muted);font-style:normal}
@media(max-width:1400px){.dashboard-page{max-width:1180px}.dashboard-hero{grid-template-columns:minmax(0,1fr) 420px}.hero-illustration{width:420px}.hero-illustration img{width:420px}.dashboard-main-grid{grid-template-columns:minmax(0,1.55fr) minmax(320px,.85fr)}}@media(max-width:1100px){.dashboard-stat-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.dashboard-main-grid{grid-template-columns:1fr}.work-panel,.overview-panel{height:auto;min-height:300px}.dashboard-hero{grid-template-columns:1fr}.hero-illustration{width:100%;min-height:150px;justify-self:stretch}.hero-illustration img{width:100%;height:160px}.overview-body{grid-template-columns:minmax(170px,220px) 1fr}}@media(max-width:640px){.dashboard-stat-grid{grid-template-columns:1fr}.dashboard-hero{padding:22px 20px}.overview-body{grid-template-columns:1fr}.progress-donut{width:150px}}
>>>>>>> parent of 656f9a2 (demo 35)
</style>
