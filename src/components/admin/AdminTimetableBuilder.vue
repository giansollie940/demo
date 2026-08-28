<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Clock3, CopyPlus, Plus, Save, Trash2 } from 'lucide-vue-next'
import AppButton from '../ui/AppButton.vue'
import { calculateTimetable, defaultTimetableConfig } from '../../features/timetable/timetable-engine'
import type { TimetableBreakRule, TimetableConfig, TimetableDayOverride, TimetablePeriodOverride } from '../../features/timetable/timetable-types'
import type { AdminTimetableTemplateRecord, AdminTimetableVersionRecord } from '../../features/admin/admin-directory'

const props=defineProps<{schoolYearId:string;templates:AdminTimetableTemplateRecord[];versions:AdminTimetableVersionRecord[];busy?:boolean}>()
const emit=defineEmits<{
  create:[payload:{schoolYearId:string;name:string;config:TimetableConfig;generatedDays:GeneratedDay[]}]
  saveVersion:[payload:{templateId:string;config:TimetableConfig;generatedDays:GeneratedDay[]}]
}>()
type GeneratedDay={weekday:number;periods:Array<{number:number;start:string;end:string;session:'morning'|'afternoon'}>}
const days=['Thứ 2','Thứ 3','Thứ 4','Thứ 5','Thứ 6']
const templateId=ref('')
const name=ref('')
const config=ref<TimetableConfig>(defaultTimetableConfig())
const scope=ref<'base'|'0'|'1'|'2'|'3'|'4'>('base')
const draftDay=ref<TimetableDayOverride>({})

function clone<T>(value:T):T{return structuredClone(value)}
function latestVersion(id:string){return props.versions.filter(row=>row.templateId===id).sort((a,b)=>b.version-a.version)[0]??null}
function loadTemplate(){
  if(!templateId.value){name.value='';config.value=defaultTimetableConfig();scope.value='base';draftDay.value={};return}
  const template=props.templates.find(row=>row.id===templateId.value),version=latestVersion(templateId.value)
  name.value=template?.name??'';config.value=version?clone(version.config):defaultTimetableConfig();scope.value='base';draftDay.value={}
}
watch(templateId,loadTemplate)
watch(scope,value=>{draftDay.value=value==='base'?{}:clone(config.value.dayOverrides[value]??{})})

const previews=computed(()=>days.map((_,weekday)=>calculateTimetable(config.value,weekday)))
const allErrors=computed(()=>[...new Set(previews.value.flatMap(row=>row.errors))])
const generatedDays=computed<GeneratedDay[]>(()=>previews.value.map((row,index)=>({weekday:index+1,periods:row.periods.map(period=>({number:period.number,start:period.start,end:period.end,session:period.session}))})))
const canSave=computed(()=>name.value.trim().length>0&&allErrors.value.length===0&&generatedDays.value.every(day=>day.periods.length>0)&&!props.busy)
const activePeriodOverrides=computed(()=>scope.value==='base'?config.value.periodOverrides:(draftDay.value.periodOverrides??=[]))
const activeBreakRules=computed(()=>scope.value==='base'?config.value.breakRules:(draftDay.value.breakRules??=[]))

function addPeriodOverride(){activePeriodOverrides.value.push({period:1,minutes:config.value.defaultPeriodMinutes})}
function removePeriodOverride(index:number){activePeriodOverrides.value.splice(index,1)}
function addBreak(){activeBreakRules.value.push({afterPeriod:1,type:'short'})}
function removeBreak(index:number){activeBreakRules.value.splice(index,1)}
function commitDay(){if(scope.value==='base')return;config.value.dayOverrides={...config.value.dayOverrides,[scope.value]:clone(draftDay.value)}}
function clearDay(){if(scope.value==='base')return;const next={...config.value.dayOverrides};delete next[scope.value];config.value.dayOverrides=next;draftDay.value={}}
function updateDayField(key:keyof TimetableDayOverride,event:Event,type:'time'|'number'='time'){
  if(scope.value==='base')return
  const raw=(event.target as HTMLInputElement).value
  ;(draftDay.value as Record<string,unknown>)[key]=raw===''?undefined:type==='number'?Number(raw):raw
  commitDay()
}
function save(){if(!canSave.value)return;const payload={config:clone(config.value),generatedDays:clone(generatedDays.value)};if(templateId.value)emit('saveVersion',{templateId:templateId.value,...payload});else emit('create',{schoolYearId:props.schoolYearId,name:name.value.trim(),...payload})}
function syncArrays(){if(scope.value!=='base')commitDay()}
</script>

<template>
  <section class="builder">
    <div class="builder-head"><div><b><Clock3/>Mẫu TKB</b><span>Nhập quy luật; app tự tính giờ bắt đầu/kết thúc và số tiết tối đa.</span></div><select v-model="templateId"><option value="">+ Tạo mẫu mới</option><option v-for="item in templates" :key="item.id" :value="item.id">{{ item.name }} · v{{ item.latestVersionNumber }}</option></select></div>
    <div class="builder-layout">
      <div class="config-pane">
        <label class="wide">Tên mẫu<input v-model="name" :disabled="Boolean(templateId)" placeholder="TKB chuẩn THCS"></label>
        <div class="session-card"><strong>Buổi sáng</strong><label>Bắt đầu<input v-if="scope==='base'" v-model="config.morningStart" type="time"><input v-else :value="draftDay.morningStart??''" type="time" :placeholder="config.morningStart??''" @input="updateDayField('morningStart',$event)"></label><label>Kết thúc<input v-if="scope==='base'" v-model="config.morningEnd" type="time"><input v-else :value="draftDay.morningEnd??''" type="time" :placeholder="config.morningEnd??''" @input="updateDayField('morningEnd',$event)"></label></div>
        <div class="session-card"><strong>Buổi chiều</strong><label>Bắt đầu<input v-if="scope==='base'" v-model="config.afternoonStart" type="time"><input v-else :value="draftDay.afternoonStart??''" type="time" :placeholder="config.afternoonStart??''" @input="updateDayField('afternoonStart',$event)"></label><label>Kết thúc<input v-if="scope==='base'" v-model="config.afternoonEnd" type="time"><input v-else :value="draftDay.afternoonEnd??''" type="time" :placeholder="config.afternoonEnd??''" @input="updateDayField('afternoonEnd',$event)"></label></div>
        <div class="duration-grid"><label>Tiết chuẩn<input v-if="scope==='base'" v-model.number="config.defaultPeriodMinutes" type="number" min="1"><input v-else :value="draftDay.defaultPeriodMinutes??''" type="number" min="1" :placeholder="String(config.defaultPeriodMinutes)" @input="updateDayField('defaultPeriodMinutes',$event,'number')"></label><label>Nghỉ ngắn<input v-if="scope==='base'" v-model.number="config.shortBreakMinutes" type="number" min="0"><input v-else :value="draftDay.shortBreakMinutes??''" type="number" min="0" :placeholder="String(config.shortBreakMinutes)" @input="updateDayField('shortBreakMinutes',$event,'number')"></label><label>Nghỉ dài<input v-if="scope==='base'" v-model.number="config.longBreakMinutes" type="number" min="0"><input v-else :value="draftDay.longBreakMinutes??''" type="number" min="0" :placeholder="String(config.longBreakMinutes)" @input="updateDayField('longBreakMinutes',$event,'number')"></label></div>
        <div class="scope-row"><b>Biến thể ngày</b><select v-model="scope"><option value="base">Cấu hình cơ sở</option><option v-for="(_,i) in days" :key="i" :value="String(i)">{{ days[i] }}</option></select><AppButton v-if="scope!=='base'" size="sm" variant="secondary" @click="clearDay">Xóa biến thể</AppButton></div>
        <div class="rule-box"><div class="rule-title"><b>Ngoại lệ thời lượng tiết</b><AppButton size="sm" variant="secondary" @click="addPeriodOverride"><Plus/>Thêm</AppButton></div><div v-if="!activePeriodOverrides.length" class="empty">Không có ngoại lệ.</div><div v-for="(row,index) in activePeriodOverrides" :key="index" class="rule-row"><label>Tiết<input v-model.number="row.period" type="number" min="1" @change="syncArrays"></label><label>Phút<input v-model.number="row.minutes" type="number" min="1" @change="syncArrays"></label><button type="button" aria-label="Xóa ngoại lệ" @click="removePeriodOverride(index);syncArrays()"><Trash2/></button></div></div>
        <div class="rule-box"><div class="rule-title"><b>Quy luật nghỉ</b><AppButton size="sm" variant="secondary" @click="addBreak"><Plus/>Thêm</AppButton></div><div v-if="!activeBreakRules.length" class="empty">Không có khoảng nghỉ.</div><div v-for="(row,index) in activeBreakRules" :key="index" class="break-row"><label>Sau tiết<input v-model.number="row.afterPeriod" type="number" min="1" @change="syncArrays"></label><label>Loại<select v-model="row.type" @change="syncArrays"><option value="none">Không nghỉ</option><option value="short">Nghỉ ngắn</option><option value="long">Nghỉ dài</option><option value="custom">Tùy chỉnh</option></select></label><label v-if="row.type==='custom'">Phút<input v-model.number="row.minutes" type="number" min="1" @change="syncArrays"></label><button type="button" aria-label="Xóa quy tắc" @click="removeBreak(index);syncArrays()"><Trash2/></button></div></div>
        <div v-if="allErrors.length" class="errors"><b>Chưa thể lưu</b><span v-for="error in allErrors" :key="error">{{ error }}</span></div>
        <AppButton :disabled="!canSave" :loading="busy" @click="save"><Save/>{{ templateId?'Lưu thành phiên bản mới':'Tạo mẫu TKB' }}</AppButton>
      </div>
      <div class="preview-pane"><div class="preview-head"><b>Preview tự động</b><span>Thay đổi cấu hình sẽ cập nhật ngay.</span></div><div v-for="(day,index) in previews" :key="index" class="day-preview"><strong>{{ days[index] }}</strong><div class="period-chips"><span v-for="period in day.periods" :key="period.number" :class="{exception:period.minutes!==day.config.defaultPeriodMinutes}"><b>T{{ period.number }}</b>{{ period.start }}–{{ period.end }}<small v-if="period.breakAfter">nghỉ {{ period.breakAfter.minutes }}'</small></span></div></div></div>
    </div>
  </section>
</template>

<style scoped>
.builder{display:grid;gap:12px;padding-top:14px;border-top:1px solid color-mix(in srgb,var(--color-primary) 10%,var(--border))}.builder-head,.builder-head>div,.preview-head{display:flex;justify-content:space-between;gap:10px;align-items:center}.builder-head>div,.preview-head{align-items:flex-start;flex-direction:column}.builder-head b{display:flex;align-items:center;gap:7px}.builder-head svg{width:17px}.builder-head span,.preview-head span,.empty{font-size:.76rem;color:var(--text-muted)}select,input{min-height:40px;border:1px solid var(--border);border-radius:10px;padding:7px 9px;background:var(--input);color:var(--text)}.builder-layout{display:grid;grid-template-columns:minmax(430px,.9fr) minmax(0,1.1fr);gap:12px}.config-pane,.preview-pane{display:grid;align-content:start;gap:10px;padding:12px;border:1px solid var(--border);border-radius:16px;background:color-mix(in srgb,var(--surface) 82%,transparent)}label{display:grid;gap:4px;font-size:.72rem;font-weight:800;color:var(--text-muted)}.session-card{display:grid;grid-template-columns:100px 1fr 1fr;gap:8px;align-items:end}.session-card strong{align-self:center}.duration-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.scope-row,.rule-title{display:flex;align-items:center;gap:8px;justify-content:space-between}.rule-box{display:grid;gap:7px;padding:10px;border-radius:13px;background:var(--surface-soft)}.rule-row,.break-row{display:grid;grid-template-columns:1fr 1fr auto;gap:7px;align-items:end}.break-row{grid-template-columns:1fr 1.3fr 1fr auto}.rule-row button,.break-row button{width:38px;height:38px;border:0;border-radius:10px;background:color-mix(in srgb,var(--color-danger) 10%,var(--surface));color:var(--color-danger)}.rule-row svg,.break-row svg{width:16px}.errors{display:grid;gap:3px;padding:9px;border-radius:11px;background:color-mix(in srgb,var(--color-danger) 8%,var(--surface));color:var(--color-danger);font-size:.78rem}.day-preview{display:grid;gap:7px;padding:9px;border-radius:12px;background:var(--surface-soft)}.period-chips{display:flex;flex-wrap:wrap;gap:5px}.period-chips span{display:grid;gap:1px;padding:6px 8px;border:1px solid var(--border);border-radius:9px;background:var(--surface);font-size:.72rem}.period-chips span.exception{border-color:color-mix(in srgb,var(--color-coral) 40%,var(--border))}.period-chips small{color:var(--text-muted)}@media(max-width:1100px){.builder-layout{grid-template-columns:1fr}}@media(max-width:650px){.session-card,.duration-grid,.rule-row,.break-row{grid-template-columns:1fr}.scope-row,.builder-head{align-items:stretch;flex-direction:column}.rule-row button,.break-row button{width:100%}}
</style>
