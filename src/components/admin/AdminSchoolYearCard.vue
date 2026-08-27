<script setup lang="ts">
import { CalendarClock, CalendarDays, CheckCircle2, Copy, Save } from 'lucide-vue-next'
import { computed, reactive, watch } from 'vue'
import AppButton from '../ui/AppButton.vue'
import AppBadge from '../ui/AppBadge.vue'
import type { AdminCalendarWeekRecord, AdminSchoolYearPeriodRecord, AdminSchoolYearRecord } from '../../features/admin/admin-directory'

const props=defineProps<{item:AdminSchoolYearRecord;weeks:AdminCalendarWeekRecord[];periods:AdminSchoolYearPeriodRecord[];busy:boolean;busyWeekId?:string|null;busyPeriods?:boolean}>()
const emit=defineEmits<{activate:[id:string];saveWeek:[input:{weekId:string;startDate:string;endDate:string}];savePeriods:[input:{schoolYearId:string;periods:Array<{number:number;start:string;end:string}>}]}>()
const drafts=reactive<Record<string,{startDate:string;endDate:string}>>({})
const periodDrafts=reactive<Array<{number:number;start:string;end:string}>>([])

watch(()=>props.weeks,rows=>{for(const week of rows){const current=drafts[week.id];if(!current||current.startDate===week.startDate&&current.endDate===week.endDate)drafts[week.id]={startDate:week.startDate,endDate:week.endDate}}},{immediate:true,deep:true})
watch(()=>props.periods,rows=>{periodDrafts.splice(0,periodDrafts.length,...rows.slice().sort((a,b)=>a.number-b.number).map(row=>({number:row.number,start:row.start,end:row.end})))},{immediate:true,deep:true})
function formatDate(value:string){if(!value)return'—';const [y,m,d]=value.split('-');return `${d}/${m}/${y}`}
function dirty(week:AdminCalendarWeekRecord){const draft=drafts[week.id];return Boolean(draft&&(draft.startDate!==week.startDate||draft.endDate!==week.endDate))}
function save(week:AdminCalendarWeekRecord){const draft=drafts[week.id];if(!draft||!dirty(week))return;emit('saveWeek',{weekId:week.id,startDate:draft.startDate,endDate:draft.endDate})}
const periodsDirty=computed(()=>JSON.stringify(periodDrafts)!==JSON.stringify(props.periods.slice().sort((a,b)=>a.number-b.number).map(row=>({number:row.number,start:row.start,end:row.end}))))
const periodsValid=computed(()=>periodDrafts.length>0&&periodDrafts.every((row,index)=>/^\d{2}:\d{2}$/.test(row.start)&&/^\d{2}:\d{2}$/.test(row.end)&&row.start<row.end&&(index===0||periodDrafts[index-1].end<=row.start)))
function copyDefaultPeriods(){const defaults=[['07:40','08:20'],['08:25','09:05'],['09:20','10:00'],['10:05','10:45'],['10:50','11:30'],['13:15','13:55'],['14:00','14:40'],['14:55','15:35'],['15:40','16:20']];periodDrafts.splice(0,periodDrafts.length,...defaults.map((row,index)=>({number:index+1,start:row[0],end:row[1]})))}
function savePeriods(){if(!periodsValid.value||!periodsDirty.value)return;emit('savePeriods',{schoolYearId:props.item.id,periods:periodDrafts.map(row=>({...row}))})}
</script>
<template>
  <article class="year-card" :class="{active:item.active}">
    <div class="year-heading">
      <div class="year-icon"><CalendarDays/></div>
      <div class="year-copy"><div class="year-title"><h3>{{ item.name }}</h3><AppBadge v-if="item.active" tone="success"><CheckCircle2/>Đang hoạt động</AppBadge></div><p>{{ formatDate(item.startDate) }} → {{ formatDate(item.endDate) }}</p></div>
      <AppButton v-if="!item.active" variant="secondary" :loading="busy" @click="emit('activate',item.id)">Đặt đang hoạt động</AppButton>
    </div>

    <div class="calendar-editor">
      <div class="calendar-editor-title"><b>Lịch tuần chuẩn</b><span>Admin thiết lập ngày; GV chỉ vận hành deadline và trạng thái của từng lớp.</span></div>
      <div class="week-grid">
        <div v-for="week in weeks" :key="week.id" class="week-row">
          <b>Tuần {{ week.number }}</b>
          <label><span>Bắt đầu</span><input v-model="drafts[week.id].startDate" type="date"/></label>
          <label><span>Kết thúc</span><input v-model="drafts[week.id].endDate" type="date"/></label>
          <AppButton variant="secondary" size="sm" :disabled="!dirty(week)" :loading="busyWeekId===week.id" @click="save(week)"><Save/>Lưu lịch tuần</AppButton>
        </div>
      </div>
    </div>

    <div class="period-editor">
      <div class="calendar-editor-title"><div><b><CalendarClock/>Khung giờ tiết học</b><span>Áp dụng riêng cho {{ item.name }}; dữ liệu năm học khác không bị thay đổi.</span></div><AppButton variant="secondary" size="sm" @click="copyDefaultPeriods"><Copy/>Sao chép từ khung giờ mặc định</AppButton></div>
      <div class="period-grid">
        <div v-for="row in periodDrafts" :key="row.number" class="period-row"><b>Tiết {{ row.number }}</b><label><span>Bắt đầu</span><input v-model="row.start" type="time"/></label><label><span>Kết thúc</span><input v-model="row.end" type="time"/></label></div>
      </div>
      <div class="period-actions"><small v-if="!periodsValid" class="period-error">Giờ tiết phải tăng dần, không chồng lấn và giờ bắt đầu phải trước giờ kết thúc.</small><AppButton :disabled="!periodsDirty||!periodsValid" :loading="busyPeriods" @click="savePeriods"><Save/>Lưu khung giờ</AppButton></div>
    </div>
  </article>
</template>
<style scoped>
.year-card{display:grid;gap:16px;padding:16px;border:1px solid color-mix(in srgb,var(--color-coral) 12%,var(--border));border-radius:20px;background:linear-gradient(125deg,color-mix(in srgb,var(--surface) 94%,transparent),color-mix(in srgb,var(--wash-peach) 48%,var(--surface)));box-shadow:0 8px 22px rgb(79 55 73 / .06);transition:transform var(--transition-fast),box-shadow var(--transition-fast),border-color var(--transition-fast),background var(--theme-transition)}.year-card:hover{transform:translateY(-2px);border-color:color-mix(in srgb,var(--color-coral) 28%,var(--border));box-shadow:0 14px 30px color-mix(in srgb,var(--color-coral) 10%,transparent)}.year-card.active{background:linear-gradient(125deg,color-mix(in srgb,var(--wash-cream) 72%,var(--surface)),color-mix(in srgb,var(--wash-violet) 45%,var(--surface)));border-color:color-mix(in srgb,var(--color-primary) 22%,var(--border))}.year-heading{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:14px}.year-icon{width:44px;height:44px;display:grid;place-items:center;border-radius:15px;background:linear-gradient(145deg,var(--wash-peach),var(--wash-violet));color:var(--color-primary)}.year-icon svg{width:21px}.year-title{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.year-title h3{margin:0;font-size:1.08rem}.year-copy p{margin:5px 0 0;color:var(--text-muted);font-size:.85rem}.year-title :deep(svg),.week-row :deep(svg),.period-editor :deep(svg){width:14px}.calendar-editor,.period-editor{display:grid;gap:10px;padding-top:14px;border-top:1px solid color-mix(in srgb,var(--color-primary) 10%,var(--border))}.calendar-editor-title{display:flex;justify-content:space-between;gap:12px;align-items:center}.calendar-editor-title>div{display:grid;gap:3px}.calendar-editor-title b{display:flex;align-items:center;gap:7px}.calendar-editor-title span{color:var(--text-muted);font-size:.78rem}.week-grid{display:grid;gap:8px;max-height:430px;overflow:auto;padding-right:3px}.week-row{display:grid;grid-template-columns:82px minmax(150px,1fr) minmax(150px,1fr) auto;align-items:end;gap:9px;padding:9px;border-radius:14px;background:color-mix(in srgb,var(--surface) 76%,transparent);border:1px solid color-mix(in srgb,var(--color-primary) 7%,var(--border))}.week-row>b{align-self:center;color:var(--color-primary)}.week-row label,.period-row label{display:grid;gap:4px}.week-row label span,.period-row label span{font-size:.72rem;font-weight:800;color:var(--text-muted)}.week-row input,.period-row input{min-height:39px;border:1px solid var(--border);border-radius:10px;padding:7px 9px;background:var(--input);color:var(--text)}.period-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.period-row{display:grid;grid-template-columns:64px 1fr 1fr;align-items:end;gap:7px;padding:9px;border:1px solid var(--border);border-radius:14px;background:color-mix(in srgb,var(--surface) 78%,transparent)}.period-row>b{align-self:center;color:var(--color-coral)}.period-actions{display:flex;align-items:center;justify-content:flex-end;gap:12px}.period-error{margin-right:auto;color:var(--color-danger);font-weight:750}@media(max-width:980px){.period-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:820px){.year-heading{grid-template-columns:auto 1fr}.year-heading :deep(.app-button){grid-column:1/-1;width:100%}.calendar-editor-title{display:grid}.week-row{grid-template-columns:1fr 1fr}.week-row>b{grid-column:1/-1}.week-row :deep(.app-button){grid-column:1/-1;width:100%}.period-grid{grid-template-columns:1fr}}@media(max-width:520px){.week-row,.period-row{grid-template-columns:1fr}.period-actions{display:grid}.period-actions :deep(.app-button){width:100%}}
</style>
