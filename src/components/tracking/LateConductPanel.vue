<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { CheckCheck, Clock3, ShieldAlert } from 'lucide-vue-next'
import AppButton from '../ui/AppButton.vue'
import { canResolveCase, clampLateThreshold, conductOverview, type LateTrackingData } from '../../features/tracking/late-model'
import type { CurrentUser, UserRole } from '../../types/legacy'

// FEAT-LATE-001: tổng hợp đăng ký trễ của cả năm học và các lần cải thiện ý thức.
const props=defineProps<{data:LateTrackingData;users:CurrentUser[];actorRole:UserRole|null;actorId:string|null;canEditThreshold:boolean;busyKey:string|null}>()
const emit=defineEmits<{resolve:[caseId:string,studentName:string];saveThreshold:[value:number]}>()

const overview=computed(()=>conductOverview(props.data,props.users))
const thresholdInput=ref(props.data.threshold)
watch(()=>props.data.threshold,value=>{thresholdInput.value=value})
const thresholdDirty=computed(()=>clampLateThreshold(thresholdInput.value)!==props.data.threshold)
const date=(iso:string|null)=>iso?new Intl.DateTimeFormat('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',day:'2-digit',month:'2-digit'}).format(new Date(iso)):''
const name=(user?:CurrentUser)=>user?.name??'Học sinh đã rời lớp'
</script>
<template>
  <section class="late-panel" aria-labelledby="late-panel-title">
    <header>
      <div>
        <span class="eyebrow"><ShieldAlert aria-hidden="true"/>ĐĂNG KÝ TRỄ · CẢ NĂM HỌC</span>
        <h2 id="late-panel-title">Cải thiện ý thức</h2>
        <p>Học sinh chưa đăng ký mà đã vào tiết thì báo miệng; cán sự / GV bấm <b>Ghi trễ</b> ở danh sách bên dưới. Cứ <b>{{ data.threshold }} lần trễ</b> thành <b>1 lần cải thiện ý thức</b>.</p>
      </div>
      <form v-if="canEditThreshold" class="threshold" @submit.prevent="emit('saveThreshold',clampLateThreshold(thresholdInput))">
        <label for="late-threshold">Số lần trễ cho 1 lần</label>
        <div><input id="late-threshold" v-model.number="thresholdInput" type="number" min="1" max="20" step="1" inputmode="numeric"><AppButton type="submit" variant="secondary" :disabled="!thresholdDirty" :loading="busyKey==='threshold'">Lưu</AppButton></div>
      </form>
    </header>

    <div class="columns">
      <div class="block">
        <h3>Cần xử phạt <b>{{ overview.openCases.length }}</b></h3>
        <ul v-if="overview.openCases.length" class="case-list">
          <li v-for="row in overview.openCases" :key="row.case.id">
            <div><b>{{ name(row.user) }}</b><small>{{ row.user?.code }} · từ {{ date(row.case.createdAt) }} · {{ row.lateCount }} lần trễ</small></div>
            <AppButton v-if="canResolveCase(row.case,actorRole,actorId)" variant="success" :loading="busyKey===row.case.id" @click="emit('resolve',row.case.id,name(row.user))"><CheckCheck aria-hidden="true"/>Đã chấp hành</AppButton>
          </li>
        </ul>
        <p v-else class="empty">Không có học sinh nào cần xử phạt.</p>
      </div>

      <div class="block">
        <h3>Đang tích lũy <b>{{ overview.pending.length }}</b></h3>
        <ul v-if="overview.pending.length" class="pending-list">
          <li v-for="row in overview.pending" :key="row.user.id"><Clock3 aria-hidden="true"/>{{ row.user.name }} <b>{{ row.pending }}/{{ data.threshold }}</b></li>
        </ul>
        <p v-else class="empty">Chưa có lần trễ nào đang tích lũy.</p>
      </div>
    </div>

    <details v-if="overview.resolvedCases.length" class="history">
      <summary>Đã chấp hành ({{ overview.resolvedCases.length }})</summary>
      <ul>
        <li v-for="row in overview.resolvedCases" :key="row.case.id"><b>{{ name(row.user) }}</b> · tạo {{ date(row.case.createdAt) }} · chấp hành {{ date(row.case.resolvedAt) }}<template v-if="row.case.resolutionNote"> · {{ row.case.resolutionNote }}</template></li>
      </ul>
    </details>
  </section>
</template>
<style scoped>
.late-panel{display:grid;gap:14px}
header{display:flex;justify-content:space-between;gap:18px;align-items:flex-start}
header h2{margin:5px 0}
header p{margin:0;color:var(--text-muted);max-width:70ch}
.eyebrow{display:flex;align-items:center;gap:7px;color:var(--color-danger);font-size:var(--font-size-ui-min);font-weight:900;letter-spacing:.05em}
.eyebrow svg{width:17px}
.threshold{display:grid;gap:5px;min-width:200px}
.threshold label{color:var(--text-muted);font-size:var(--font-size-ui-min);font-weight:850}
.threshold div{display:flex;gap:8px}
.threshold input{width:84px;min-height:44px;border:1px solid var(--border);border-radius:12px;padding:0 10px;background:var(--surface-raised);color:var(--text);font:inherit;font-weight:850}
.threshold input:focus{outline:3px solid var(--focus-ring);border-color:var(--color-primary)}
.columns{display:grid;grid-template-columns:minmax(0,1.4fr) minmax(0,1fr);gap:12px}
.block{display:grid;align-content:start;gap:9px;border:1px solid var(--border);border-radius:16px;padding:13px;background:var(--surface-soft)}
.block h3{display:flex;align-items:center;gap:8px;margin:0;font-size:.95rem}
.block h3 b{min-width:26px;padding:2px 8px;border-radius:999px;background:var(--surface);text-align:center}
ul{margin:0;padding:0;list-style:none}
.case-list{display:grid;gap:8px}
.case-list li{display:flex;align-items:center;justify-content:space-between;gap:10px;border:1px solid color-mix(in srgb,var(--color-danger) 25%,var(--border));border-radius:13px;padding:9px 11px;background:var(--surface-raised)}
.case-list li>div{display:grid;gap:2px}
.case-list small{color:var(--text-muted)}
.case-list :deep(.app-button){min-height:38px;padding:7px 11px;font-size:var(--font-size-ui-min)}
.case-list :deep(svg){width:15px}
.pending-list{display:flex;flex-wrap:wrap;gap:7px}
.pending-list li{display:inline-flex;align-items:center;gap:6px;border-radius:999px;padding:6px 10px;background:var(--wash-sun);font-size:.85rem}
.pending-list svg{width:14px;color:var(--color-warning)}
.pending-list b{color:var(--color-warning)}
.empty{margin:0;color:var(--text-muted);font-size:.88rem}
.history summary{cursor:pointer;color:var(--text-muted);font-weight:800}
.history ul{display:grid;gap:5px;margin-top:8px;font-size:.86rem;color:var(--text-muted)}
@media(max-width:900px){.columns{grid-template-columns:1fr}header{flex-direction:column}}
@media(max-width:560px){.case-list li{flex-direction:column;align-items:stretch}.case-list :deep(.app-button){width:100%}}
</style>
