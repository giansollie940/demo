<script setup lang="ts">
import { CalendarDays, CheckCircle2, Save } from 'lucide-vue-next'
import { reactive, watch } from 'vue'
import AppButton from '../ui/AppButton.vue'
import AppBadge from '../ui/AppBadge.vue'
import AdminTimetableBuilder from './AdminTimetableBuilder.vue'
import AdminTimetableAssignment from './AdminTimetableAssignment.vue'
import type { TimetableConfig } from '../../features/timetable/timetable-types'
import type { AdminCalendarWeekRecord, AdminClassRecord, AdminSchoolYearRecord, AdminTimetableAssignmentRecord, AdminTimetableTemplateRecord, AdminTimetableVersionRecord } from '../../features/admin/admin-directory'

type GeneratedDay={weekday:number;periods:Array<{number:number;start:string;end:string;session:'morning'|'afternoon'}>}
type TimetableFeedback={state:'idle'|'saving'|'success'|'error'|'server-changed';message:string;selectedTemplateId?:string;version?:number;token:number}
const props=defineProps<{
  item:AdminSchoolYearRecord;weeks:AdminCalendarWeekRecord[];classes:AdminClassRecord[];templates:AdminTimetableTemplateRecord[];versions:AdminTimetableVersionRecord[];assignments:AdminTimetableAssignmentRecord[];busy:boolean;busyWeekId?:string|null;busyTimetable?:boolean;busyAssignment?:boolean;timetableFeedback?:TimetableFeedback
}>()
const emit=defineEmits<{
  activate:[id:string];saveWeek:[input:{weekId:string;startDate:string;endDate:string}]
  createTemplate:[payload:{schoolYearId:string;name:string;config:TimetableConfig;generatedDays:GeneratedDay[]}]
  saveVersion:[payload:{templateId:string;config:TimetableConfig;generatedDays:GeneratedDay[]}]
  assignTemplate:[payload:{classId:string;schoolYearId:string;templateVersionId:string;effectiveFrom:string;effectiveTo:string}]
}>()
const drafts=reactive<Record<string,{startDate:string;endDate:string}>>({})
watch(()=>props.weeks,rows=>{for(const week of rows){const current=drafts[week.id];if(!current||current.startDate===week.startDate&&current.endDate===week.endDate)drafts[week.id]={startDate:week.startDate,endDate:week.endDate}}},{immediate:true,deep:true})
function formatDate(value:string){if(!value)return'—';const [y,m,d]=value.split('-');return `${d}/${m}/${y}`}
function dirty(week:AdminCalendarWeekRecord){const draft=drafts[week.id];return Boolean(draft&&(draft.startDate!==week.startDate||draft.endDate!==week.endDate))}
function save(week:AdminCalendarWeekRecord){const draft=drafts[week.id];if(!draft||!dirty(week))return;emit('saveWeek',{weekId:week.id,startDate:draft.startDate,endDate:draft.endDate})}
</script>
<template>
  <article class="year-card" :class="{active:item.active}">
    <div class="year-heading"><div class="year-icon"><CalendarDays/></div><div class="year-copy"><div class="year-title"><h3>{{ item.name }}</h3><AppBadge v-if="item.active" tone="success"><CheckCircle2/>Đang hoạt động</AppBadge></div><p>{{ formatDate(item.startDate) }} → {{ formatDate(item.endDate) }}</p></div><AppButton v-if="!item.active" variant="secondary" :loading="busy" @click="emit('activate',item.id)">Đặt đang hoạt động</AppButton></div>
    <div class="calendar-editor"><div class="calendar-editor-title"><b>Lịch tuần chuẩn</b><span>Admin thiết lập ngày; GV chỉ vận hành deadline và trạng thái từng lớp.</span></div><div class="week-grid"><div v-for="week in weeks" :key="week.id" class="week-row"><b>Tuần {{ week.number }}</b><label><span>Bắt đầu</span><input v-model="drafts[week.id].startDate" type="date"></label><label><span>Kết thúc</span><input v-model="drafts[week.id].endDate" type="date"></label><AppButton variant="secondary" size="sm" :disabled="!dirty(week)" :loading="busyWeekId===week.id" @click="save(week)"><Save/>Lưu lịch tuần</AppButton></div></div></div>
    <AdminTimetableBuilder :school-year-id="item.id" :templates="templates" :versions="versions" :busy="busyTimetable" :feedback="timetableFeedback" @create="emit('createTemplate',$event)" @save-version="emit('saveVersion',$event)"/>
    <AdminTimetableAssignment :school-year-id="item.id" :year-start="item.startDate" :year-end="item.endDate" :classes="classes" :templates="templates" :versions="versions" :assignments="assignments" :busy="busyAssignment" @assign="emit('assignTemplate',$event)"/>
  </article>
</template>
<style scoped>
.year-card{display:grid;gap:16px;padding:16px;border:1px solid color-mix(in srgb,var(--color-coral) 12%,var(--border));border-radius:20px;background:linear-gradient(125deg,color-mix(in srgb,var(--surface) 94%,transparent),color-mix(in srgb,var(--wash-peach) 48%,var(--surface)));box-shadow:0 8px 22px rgb(79 55 73/.06)}.year-card.active{background:linear-gradient(125deg,color-mix(in srgb,var(--wash-cream) 72%,var(--surface)),color-mix(in srgb,var(--wash-violet) 45%,var(--surface)));border-color:color-mix(in srgb,var(--color-primary) 22%,var(--border))}.year-heading{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:14px}.year-icon{width:44px;height:44px;display:grid;place-items:center;border-radius:15px;background:linear-gradient(145deg,var(--wash-peach),var(--wash-violet));color:var(--color-primary)}.year-icon svg{width:21px}.year-title{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.year-title h3{margin:0;font-size:1.08rem}.year-copy p{margin:5px 0 0;color:var(--text-muted);font-size:.85rem}.year-title :deep(svg),.week-row :deep(svg){width:14px}.calendar-editor{display:grid;gap:10px;padding-top:14px;border-top:1px solid color-mix(in srgb,var(--color-primary) 10%,var(--border))}.calendar-editor-title{display:flex;justify-content:space-between;gap:12px;align-items:center}.calendar-editor-title span{color:var(--text-muted);font-size:var(--font-size-ui-min)}.week-grid{display:grid;gap:8px;max-height:360px;overflow:auto;padding-right:3px}.week-row{display:grid;grid-template-columns:82px minmax(150px,1fr) minmax(150px,1fr) auto;align-items:end;gap:9px;padding:9px;border-radius:14px;background:color-mix(in srgb,var(--surface) 76%,transparent);border:1px solid color-mix(in srgb,var(--color-primary) 7%,var(--border))}.week-row>b{align-self:center;color:var(--color-primary)}.week-row label{display:grid;gap:4px}.week-row label span{font-size:var(--font-size-ui-min);font-weight:800;color:var(--text-muted)}.week-row input{min-height:39px;border:1px solid var(--border);border-radius:10px;padding:7px 9px;background:var(--input);color:var(--text)}@media(max-width:820px){.year-heading{grid-template-columns:auto 1fr}.year-heading :deep(.app-button){grid-column:1/-1;width:100%}.calendar-editor-title{display:grid}.week-row{grid-template-columns:1fr 1fr}.week-row>b{grid-column:1/-1}.week-row :deep(.app-button){grid-column:1/-1;width:100%}}@media(max-width:520px){.week-row{grid-template-columns:1fr}}
</style>
