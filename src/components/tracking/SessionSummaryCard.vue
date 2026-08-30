<script setup lang="ts">
import { AlertTriangle, CheckCircle2, ChevronRight, UserRoundX } from 'lucide-vue-next'
import type { SessionTrackingSummary } from '../../features/tracking/tracking-model'
const props=defineProps<{summary:SessionTrackingSummary;label:string;active:boolean}>()
const emit=defineEmits<{select:[]}>()
</script>
<template>
  <button type="button" class="session-card" :class="{active}" :aria-pressed="active" @click="emit('select')">
    <div class="session-head"><div><span>BUỔI TỰ HỌC</span><h3>{{ label }}</h3><small>{{ summary.total }} học sinh</small></div><ChevronRight aria-hidden="true"/></div>
    <div class="progress" role="progressbar" :aria-valuenow="summary.completion" aria-valuemin="0" aria-valuemax="100"><span :style="{width:`${summary.completion}%`}"></span></div>
    <div class="metrics">
      <span><CheckCircle2 aria-hidden="true"/><b>{{ summary.registered }}</b><small>Đã đăng ký</small></span>
      <span><UserRoundX aria-hidden="true"/><b>{{ summary.missing }}</b><small>Chưa đăng ký</small></span>
      <span><AlertTriangle aria-hidden="true"/><b>{{ summary.attention }}</b><small>Cần xử lý</small></span>
    </div>
  </button>
</template>
<style scoped>
.session-card{display:grid;gap:13px;width:100%;min-height:190px;text-align:left;border:1px solid var(--border);border-radius:18px;padding:17px;background:var(--surface);color:var(--text);box-shadow:var(--shadow-sm);cursor:pointer;transition:border-color var(--transition-fast),transform var(--transition-fast),box-shadow var(--transition-fast)}.session-card:hover{transform:translateY(-2px);border-color:color-mix(in srgb,var(--color-primary) 40%,var(--border));box-shadow:var(--shadow-md)}.session-card.active{border-color:var(--color-primary);box-shadow:0 0 0 2px color-mix(in srgb,var(--color-primary) 15%,transparent),var(--shadow-sm)}.session-head{display:flex;justify-content:space-between;gap:12px}.session-head>svg{width:19px;color:var(--color-primary)}.session-head span{color:var(--color-primary);font-size:.68rem;font-weight:900;letter-spacing:.08em}.session-head h3{margin:4px 0 0;font-size:1.05rem}.session-head small{color:var(--text-muted)}.progress{height:7px;border-radius:999px;background:var(--surface-soft);overflow:hidden}.progress span{display:block;height:100%;background:var(--color-primary);border-radius:inherit}.metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.metrics span{display:grid;grid-template-columns:auto 1fr;align-items:center;column-gap:5px;font-size:.75rem;color:var(--text-muted)}.metrics svg{width:15px}.metrics b{font-size:1.05rem;color:var(--text)}.metrics small{grid-column:1/-1}@media(prefers-reduced-motion:reduce){.session-card{transition:none}.session-card:hover{transform:none}}
</style>
