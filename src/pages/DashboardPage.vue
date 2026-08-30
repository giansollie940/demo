<script setup lang="ts">
import { computed } from 'vue'
import { AlertCircle, CheckCircle2, ClipboardCheck, TriangleAlert, UserCheck, UsersRound } from 'lucide-vue-next'
import AppCard from '../components/ui/AppCard.vue'
import AppBadge from '../components/ui/AppBadge.vue'
import { useAuthStore } from '../stores/auth'
import { useContextStore } from '../stores/context'
import { useWeekData } from '../features/weeks/queries'
import { buildDashboardMetrics } from '../features/dashboard/dashboard-model'
import { useDailyQuote } from '../features/owl/daily-quote'
import { useNowTicker } from '../features/shared/useNowTicker'
import { needsTeacherAction } from '../features/registrations/registration-model'

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
</script>

<template>
<div class="page-stack dashboard-page">
  <section class="dashboard-hero app-card">
    <div class="hero-copy">
      <span class="hero-kicker">TỔNG QUAN TUẦN</span>
      <h1>Chào {{ auth.currentUser?.name||'bạn' }} 👋</h1>
      <p v-if="isStudent">Theo dõi đăng ký, phản hồi và những việc bạn cần hoàn thành trong tuần.</p>
      <p v-else-if="isMonitor">Theo dõi việc học của bạn và hỗ trợ lớp hoàn thành đăng ký đúng hạn.</p>
      <p v-else>{{ auth.legacyState?.settings.announcement||'Theo dõi tiến độ tự học và các mục cần xử lý của lớp.' }}</p>
      <div class="hero-meta">
        <span class="week-pill">Tuần {{ week?.number??'–' }}<template v-if="week"> · {{ week.startDate }} → {{ week.endDate }}</template></span>
        <AppBadge :tone="isFetching?'info':'success'">{{ isFetching?'Đang đồng bộ':'Đã đồng bộ' }}</AppBadge>
      </div>
    </div>
    <div class="hero-illustration"><img :src="dashboardIllustrationUrl" alt=""/></div>
  </section>

  <template v-if="isStudent">
    <section class="role-section"><div class="role-heading"><span>CÁ NHÂN CỦA TÔI</span><h2>Việc cần theo dõi</h2></div><div class="metrics dashboard-stat-grid learner-metrics"><AppCard><ClipboardCheck/><b>{{ personalMetrics.submitted }}/{{ personalMetrics.slots }}</b><span>Đăng ký tuần này</span></AppCard><AppCard><CheckCircle2/><b>{{ personalMetrics.approved }}</b><span>Đã duyệt</span></AppCard><AppCard><AlertCircle/><b>{{ personalMetrics.needsRevision }}</b><span>Cần chỉnh sửa</span></AppCard><AppCard><TriangleAlert/><b>{{ personalMetrics.issues }}</b><span>Báo cáo lỗi</span></AppCard></div></section>
  </template>

  <template v-else-if="isMonitor">
    <section class="role-section"><div class="role-heading"><span>CÁ NHÂN CỦA TÔI</span><h2>Tiến độ của tôi</h2></div><div class="metrics dashboard-stat-grid learner-metrics"><AppCard><ClipboardCheck/><b>{{ personalMetrics.submitted }}/{{ personalMetrics.slots }}</b><span>Đăng ký tuần này</span></AppCard><AppCard><CheckCircle2/><b>{{ personalMetrics.approved }}</b><span>Đã duyệt</span></AppCard><AppCard><AlertCircle/><b>{{ personalMetrics.needsRevision }}</b><span>Cần chỉnh sửa</span></AppCard><AppCard><TriangleAlert/><b>{{ personalMetrics.issues }}</b><span>Báo cáo lỗi</span></AppCard></div></section>
    <section class="role-section"><div class="role-heading"><span>HỖ TRỢ LỚP</span><h2>Tình hình lớp</h2></div><div class="metrics dashboard-stat-grid class-support"><AppCard><UsersRound/><b>{{ classMetrics.students }}</b><span>Học sinh</span></AppCard><AppCard><UserCheck/><b>{{ classMetrics.completion }}%</b><span>Đã đăng ký</span></AppCard><AppCard><AlertCircle/><b>{{ classMetrics.needsRevision }}</b><span>Cần chỉnh sửa</span></AppCard><AppCard><TriangleAlert/><b>{{ classMetrics.issues }}</b><span>Báo cáo lỗi</span></AppCard></div></section>
  </template>

  <section v-else class="manager-metrics dashboard-stat-grid metrics">
    <AppCard><UsersRound/><b>{{ classMetrics.students }}</b><span>Học sinh</span></AppCard>
    <AppCard><CheckCircle2/><b>{{ classMetrics.completion }}%</b><span>Đã đăng ký</span></AppCard>
    <AppCard><ClipboardCheck/><b>{{ managerQueue }}</b><span>Cần GV xử lý</span></AppCard>
    <AppCard><TriangleAlert/><b>{{ attentionCount }}</b><span>Cần chú ý</span></AppCard>
  </section>

  <section class="dashboard-main-grid">
    <AppCard padding="lg" class="work-panel">
      <div class="panel-heading"><div><span class="panel-kicker">ƯU TIÊN</span><h2>Công việc cần xử lý</h2><p>Những mục cần phản hồi trong tuần đang xem.</p></div></div>
      <div class="task-list">
        <div class="task-row" v-if="!isLearner"><span class="task-dot task-warning"></span><div><b>Đăng ký cần giáo viên xử lý</b><small>Ưu tiên duyệt hoặc phản hồi</small></div><strong>{{ managerQueue }}</strong></div>
        <div class="task-row"><span class="task-dot task-coral"></span><div><b>Đăng ký cần chỉnh sửa</b><small>Đang chờ học sinh cập nhật</small></div><strong>{{ activeMetrics.needsRevision }}</strong></div>
        <div class="task-row"><span class="task-dot task-violet"></span><div><b>Báo cáo lỗi</b><small>Cần kiểm tra tình trạng quá hạn</small></div><strong>{{ activeMetrics.issues }}</strong></div>
      </div>
      <RouterLink v-if="activeMetrics.issues" class="issue-link interactive-link" to="/issues">Xem Báo cáo lỗi →</RouterLink>
    </AppCard>

    <AppCard padding="lg" class="overview-panel">
      <div class="panel-heading"><div><span class="panel-kicker">TIẾN ĐỘ</span><h2>Tổng quan tiến độ</h2><p>{{ isLearner?'Theo các buổi tự học của bạn.':'Theo dữ liệu của lớp trong tuần.' }}</p></div></div>
      <div class="overview-body">
        <div class="progress-donut" :style="{'--progress':`${activeMetrics.completion}%`}"><div><strong>{{ activeMetrics.completion }}%</strong><span>đã đăng ký</span></div></div>
        <div class="overview-legend"><div><i class="legend-dot done"></i><span>Đã đăng ký</span><b>{{ activeMetrics.submitted }}</b></div><div><i class="legend-dot approved"></i><span>Đã duyệt</span><b>{{ activeMetrics.approved }}</b></div><div><i class="legend-dot pending"></i><span>Cần chú ý</span><b>{{ attentionCount }}</b></div></div>
      </div>
    </AppCard>
  </section>

  <section class="daily-quote"><AppCard padding="lg"><span class="quote-kicker">Danh ngôn hôm nay</span><blockquote>“{{ dailyQuote?.text || 'Mỗi ngày học một điều mới là một bước tiến.' }}”</blockquote><cite>— {{ dailyQuote?.author || 'Cú Thông Thái' }}</cite></AppCard></section>
</div>
</template>

<style scoped>
.dashboard-page{max-width:1296px;margin:0 auto;gap:16px}
.dashboard-hero{min-height:132px;display:block;padding:24px 28px;overflow:hidden;position:relative;background:radial-gradient(circle at 76% 24%,color-mix(in srgb,var(--wash-sky) 72%,transparent),transparent 31%),radial-gradient(circle at 8% 0%,color-mix(in srgb,var(--wash-pink) 72%,transparent),transparent 36%),linear-gradient(135deg,color-mix(in srgb,var(--surface) 98%,transparent),color-mix(in srgb,var(--wash-violet) 58%,var(--surface)));border-radius:24px}
.dashboard-hero::after{content:"";position:absolute;right:-82px;bottom:-122px;width:250px;height:250px;border-radius:50%;background:color-mix(in srgb,var(--color-primary) 5%,transparent);pointer-events:none}
.hero-copy{position:relative;z-index:2;display:grid;gap:7px;align-content:center;max-width:52%;min-height:84px}
.hero-kicker,.role-heading span,.panel-kicker{color:var(--color-primary);font-size:var(--font-size-ui-min);font-weight:900;letter-spacing:.12em}
.hero-copy h1{margin:0;font-size:clamp(1.95rem,2.4vw,2.25rem);line-height:1.08;color:var(--text);letter-spacing:-.035em}
.hero-copy p{margin:0;max-width:62ch;color:var(--text-muted);font-size:.9rem;line-height:1.5}
.hero-meta{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:5px}
.week-pill{display:inline-flex;padding:7px 10px;border-radius:11px;background:color-mix(in srgb,var(--surface) 86%,transparent);border:1px solid color-mix(in srgb,var(--color-primary) 12%,var(--border));color:var(--text-muted);font-size:var(--font-size-ui-min);font-weight:800}
.hero-illustration{position:absolute;inset:0 auto 0 0;width:min(52%,640px);height:100%;z-index:1;overflow:hidden;background:transparent;border:0;border-radius:0;box-shadow:none;pointer-events:none}
.hero-illustration img{width:100%;height:100%;object-fit:contain;object-position:center bottom;border-radius:0;filter:none;image-rendering:auto;-webkit-mask-image:linear-gradient(90deg,transparent 0%,rgba(0,0,0,.22) 8%,#000 27%,#000 100%);mask-image:linear-gradient(90deg,transparent 0%,rgba(0,0,0,.22) 8%,#000 27%,#000 100%)}
.role-section{display:grid;gap:10px}.role-heading h2{margin:3px 0 0;font-size:1.18rem}.metrics{display:grid;gap:14px}.dashboard-stat-grid{grid-template-columns:repeat(4,minmax(0,1fr))}.metrics :deep(.card){--metric-accent:var(--color-primary);--metric-wash:var(--wash-violet);min-height:114px;display:grid;grid-template-columns:auto 1fr;grid-template-rows:auto auto;column-gap:14px;align-items:center;padding:18px;background:linear-gradient(145deg,color-mix(in srgb,var(--surface) 96%,transparent),color-mix(in srgb,var(--metric-wash) 96%,transparent));border-color:color-mix(in srgb,var(--metric-accent) 18%,var(--border));border-radius:21px;box-shadow:0 7px 18px color-mix(in srgb,var(--metric-accent) 6%,transparent)}.metrics :deep(.card:nth-child(1)){--metric-accent:var(--color-sky);--metric-wash:var(--wash-sky)}.metrics :deep(.card:nth-child(2)){--metric-accent:var(--color-mint);--metric-wash:var(--wash-mint)}.metrics :deep(.card:nth-child(3)){--metric-accent:var(--color-sun);--metric-wash:var(--wash-sun)}.metrics :deep(.card:nth-child(4)){--metric-accent:var(--color-lilac);--metric-wash:var(--wash-violet)}.metrics :deep(svg){grid-row:1/3;width:28px;height:28px;padding:8px;border-radius:16px;color:var(--metric-accent);background:color-mix(in srgb,var(--metric-accent) 13%,var(--surface));box-sizing:content-box}.metrics b{font-size:1.82rem;line-height:1.02;color:var(--text)}.metrics span{color:var(--text-muted);font-size:.82rem;font-weight:760}
.dashboard-main-grid{display:grid;grid-template-columns:minmax(0,820px) minmax(0,454px);gap:18px}.work-panel,.overview-panel{min-height:340px;height:340px;border-radius:22px;background:color-mix(in srgb,var(--surface) 98%,transparent);border-color:color-mix(in srgb,var(--border) 92%,transparent);box-shadow:0 8px 22px rgb(79 55 73 / .055)}.work-panel.pad-lg,.overview-panel.pad-lg{padding:22px}.panel-heading h2{margin:2px 0 4px;font-size:1.28rem;line-height:1.25}.panel-heading p{margin:0;color:var(--text-muted);font-size:var(--font-size-ui-min);line-height:1.45}.task-list{display:grid;gap:8px;margin-top:16px}.task-row{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:12px;min-height:56px;padding:9px 14px;border-radius:14px;background:color-mix(in srgb,var(--surface-soft) 66%,var(--surface));border:1px solid color-mix(in srgb,var(--border) 82%,transparent)}.task-row div{display:grid}.task-row b{font-size:.86rem;line-height:1.35}.task-row small{color:var(--text-muted);font-size:var(--font-size-ui-min);line-height:1.4}.task-row strong{font-size:.88rem}.task-dot,.legend-dot{display:block;width:10px;height:10px;border-radius:50%}.task-warning{background:var(--color-sun)}.task-coral{background:var(--color-coral)}.task-violet{background:var(--color-lilac)}.issue-link{display:inline-flex;margin-top:10px;color:var(--color-warning);font-size:var(--font-size-ui-min);font-weight:850}.overview-body{display:grid;grid-template-columns:190px 1fr;align-items:center;gap:18px;margin-top:14px}.progress-donut{--progress:0%;width:154px;aspect-ratio:1;border-radius:50%;display:grid;place-items:center;background:conic-gradient(var(--color-mint) var(--progress),color-mix(in srgb,var(--surface-soft) 82%,var(--border)) 0);position:relative;margin:auto}.progress-donut::after{content:"";position:absolute;inset:18px;border-radius:50%;background:var(--surface)}.progress-donut div{position:relative;z-index:1;display:grid;text-align:center}.progress-donut strong{font-size:1.58rem;color:var(--color-mint)}.progress-donut span{color:var(--text-muted);font-size:var(--font-size-ui-min);font-weight:700}.overview-legend{display:grid;gap:11px}.overview-legend div{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:8px;color:var(--text-muted);font-size:var(--font-size-ui-min)}.overview-legend span{font-size:var(--font-size-ui-min)}.overview-legend b{color:var(--text);font-size:var(--font-size-ui-min)}.legend-dot.done{background:var(--color-mint)}.legend-dot.approved{background:var(--color-sky)}.legend-dot.pending{background:var(--color-coral)}
.daily-quote :deep(.card){position:relative;overflow:hidden;background:linear-gradient(120deg,color-mix(in srgb,var(--wash-sky) 90%,transparent),color-mix(in srgb,var(--wash-violet) 88%,transparent) 48%,color-mix(in srgb,var(--wash-pink) 88%,transparent));border-color:color-mix(in srgb,var(--color-lilac) 18%,var(--border))}.daily-quote :deep(.card)::before{content:"✦";position:absolute;right:24px;top:12px;color:var(--color-sun);font-size:2rem;opacity:.6}.quote-kicker{color:var(--color-primary);font-size:var(--font-size-ui-min);font-weight:900;letter-spacing:.08em}.daily-quote blockquote{margin:9px 0 5px;font-size:clamp(.98rem,1.7vw,1.15rem);line-height:1.55;font-weight:800}.daily-quote cite{color:var(--text-muted);font-style:normal}
@media(max-width:1400px){.dashboard-page{max-width:1220px}.hero-illustration{width:min(50%,590px)}.dashboard-main-grid{grid-template-columns:minmax(0,1.55fr) minmax(320px,.85fr)}}
@media(max-width:1100px){.dashboard-stat-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.dashboard-main-grid{grid-template-columns:1fr}.work-panel,.overview-panel{height:auto;min-height:300px}.dashboard-hero{display:grid;grid-template-columns:1fr;padding-bottom:0}.hero-copy{max-width:none;min-height:auto}.hero-illustration{position:relative;inset:auto;width:100%;height:172px;margin-top:12px;overflow:hidden}.hero-illustration img{width:100%;height:172px;object-fit:cover;object-position:center 45%}.overview-body{grid-template-columns:minmax(170px,220px) 1fr}}
@media(max-width:640px){.dashboard-stat-grid{grid-template-columns:1fr}.dashboard-hero{padding:22px 20px 0}.hero-illustration{height:138px;margin-inline:-20px;width:calc(100% + 40px)}.hero-illustration img{height:138px}.overview-body{grid-template-columns:1fr}.progress-donut{width:150px}}
</style>
