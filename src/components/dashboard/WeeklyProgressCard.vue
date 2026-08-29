<script setup lang="ts">
import MotivationCard from './MotivationCard.vue'

defineProps<{
  completion: number
  submitted: number
  approved: number
  attention: number
  expected: number
  motivation: { title: string; body: string; tone: 'success' | 'info' | 'warning' } | null
}>()
</script>
<template>
  <section class="progress-card-r7">
    <div class="progress-heading"><span>TIẾN ĐỘ</span><h2>Tổng quan tiến độ tuần</h2></div>
    <div class="progress-layout">
      <div class="progress-donut" :style="{'--progress':`${completion}%`}"><div><strong>{{ completion }}%</strong><span>đã đăng ký</span></div></div>
      <div class="progress-legend">
        <div><i class="done"></i><span>Đã đăng ký</span><b>{{ submitted }}</b></div>
        <div><i class="approved"></i><span>Đã duyệt</span><b>{{ approved }}</b></div>
        <div><i class="attention"></i><span>Cần chú ý</span><b>{{ attention }}</b></div>
        <div><i class="missing"></i><span>Còn thiếu</span><b>{{ Math.max(0, expected - submitted) }}</b></div>
      </div>
      <MotivationCard :message="motivation" />
    </div>
  </section>
</template>
<style scoped>
.progress-card-r7 { padding:18px; border:1px solid var(--border); border-radius:22px; background:color-mix(in srgb,var(--surface) 97%,transparent); box-shadow:0 10px 28px rgb(47 65 91 / .05); }
.progress-heading span { color:var(--color-primary); font-size:.67rem; font-weight:900; letter-spacing:.12em; }
.progress-heading h2 { margin:4px 0 0; font-size:1.08rem; }
.progress-layout { display:grid; grid-template-columns:140px minmax(108px,.8fr) minmax(130px,1fr); gap:12px; align-items:center; margin-top:16px; }
.progress-donut { width:136px; height:136px; display:grid; place-items:center; border-radius:50%; background:conic-gradient(var(--color-success) var(--progress),color-mix(in srgb,var(--surface-soft) 95%,var(--border)) 0); position:relative; }
.progress-donut::after { content:""; position:absolute; inset:19px; border-radius:50%; background:var(--surface); }
.progress-donut>div { position:relative; z-index:1; display:grid; text-align:center; }
.progress-donut strong { font-size:1.45rem; }
.progress-donut span { color:var(--text-muted); font-size:.66rem; }
.progress-legend { display:grid; gap:9px; }
.progress-legend div { display:grid; grid-template-columns:9px 1fr auto; gap:6px; align-items:center; color:var(--text-muted); font-size:.68rem; }
.progress-legend i { width:9px; height:9px; border-radius:50%; }
.progress-legend .done { background:var(--color-success); }
.progress-legend .approved { background:var(--color-sky); }
.progress-legend .attention { background:var(--color-coral); }
.progress-legend .missing { background:var(--border); }
.progress-legend b { color:var(--text); }
.progress-layout :deep(.motivation-card) { min-height:136px; height:100%; }
@media (max-width: 1280px) { .progress-layout { grid-template-columns:136px minmax(120px,1fr); }.progress-layout :deep(.motivation-card) { grid-column:1 / -1; min-height:104px; } }
@media (max-width:620px) { .progress-layout { grid-template-columns:1fr; }.progress-donut { margin:auto; }.progress-layout :deep(.motivation-card) { grid-column:auto; } }
</style>
