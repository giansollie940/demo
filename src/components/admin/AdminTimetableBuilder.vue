<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Clock3, Plus, Save, Trash2 } from 'lucide-vue-next'
import AppButton from '../ui/AppButton.vue'
import InlineStatus from '../ui/InlineStatus.vue'
import { calculateTimetable, defaultTimetableConfig } from '../../features/timetable/timetable-engine'
import { cloneTimetableSnapshot } from '../../features/timetable/timetable-clone.js'
import type { TimetableConfig, TimetableDayOverride } from '../../features/timetable/timetable-types'
import type { AdminTimetableTemplateRecord, AdminTimetableVersionRecord } from '../../features/admin/admin-directory'

type TimetableFeedback={state:'idle'|'saving'|'success'|'error'|'server-changed';message:string;selectedTemplateId?:string;version?:number;token:number}
const props=defineProps<{schoolYearId:string;templates:AdminTimetableTemplateRecord[];versions:AdminTimetableVersionRecord[];busy?:boolean;feedback?:TimetableFeedback}>()
const emit=defineEmits<{
  create:[payload:{schoolYearId:string;name:string;config:TimetableConfig;generatedDays:GeneratedDay[]}]
  saveVersion:[payload:{templateId:string;config:TimetableConfig;generatedDays:GeneratedDay[]}]
}>()
type GeneratedDay={weekday:number;periods:Array<{number:number;start:string;end:string;session:'morning'|'afternoon'}>}
type SessionName='morning'|'afternoon'
const days=['Thứ 2','Thứ 3','Thứ 4','Thứ 5','Thứ 6']
const templateId=ref('')
const name=ref('')
const config=ref<TimetableConfig>(defaultTimetableConfig())
const scope=ref<'base'|'0'|'1'|'2'|'3'|'4'>('base')
const draftDay=ref<TimetableDayOverride>({})
const pendingTemplateId=ref('')

function normalizedConfig(value:TimetableConfig):TimetableConfig{
  const defaults=defaultTimetableConfig(),raw=cloneTimetableSnapshot(value)
  return{
    ...defaults,...raw,
    morningLongBreakEnabled:raw.morningLongBreakEnabled??defaults.morningLongBreakEnabled,
    morningLongBreakAfterPeriod:Number(raw.morningLongBreakAfterPeriod||defaults.morningLongBreakAfterPeriod),
    afternoonLongBreakEnabled:raw.afternoonLongBreakEnabled??defaults.afternoonLongBreakEnabled,
    afternoonLongBreakAfterPeriod:Number(raw.afternoonLongBreakAfterPeriod||defaults.afternoonLongBreakAfterPeriod),
    periodOverrides:Array.isArray(raw.periodOverrides)?raw.periodOverrides:[],
    breakRules:Array.isArray(raw.breakRules)?raw.breakRules:[],
    dayOverrides:raw.dayOverrides&&typeof raw.dayOverrides==='object'?raw.dayOverrides:{},
  }
}
function latestVersion(id:string){return props.versions.filter(row=>row.templateId===id).sort((a,b)=>b.version-a.version)[0]??null}
const selectedTemplate=computed(()=>props.templates.find(row=>row.id===templateId.value)??null)
const selectedVersion=computed(()=>templateId.value?latestVersion(templateId.value):null)
const selectedVersionId=computed(()=>selectedVersion.value?.id??'')
function loadTemplate(){
  if(!templateId.value){name.value='';config.value=defaultTimetableConfig();scope.value='base';draftDay.value={};return}
  const template=selectedTemplate.value,version=selectedVersion.value
  name.value=template?.name??'';config.value=version?normalizedConfig(version.config):defaultTimetableConfig();scope.value='base';draftDay.value={}
}
function selectPendingTemplate(){const id=pendingTemplateId.value;if(!id||!props.templates.some(row=>row.id===id))return;pendingTemplateId.value='';templateId.value=id;loadTemplate()}
watch([templateId,selectedVersionId],loadTemplate)
watch(()=>props.feedback?.token,()=>{const id=props.feedback?.selectedTemplateId??'';if(id){pendingTemplateId.value=id;selectPendingTemplate()}})
watch(()=>props.templates,selectPendingTemplate)
watch(scope,value=>{draftDay.value=value==='base'?{}:cloneTimetableSnapshot(config.value.dayOverrides[value]??{})})

const previews=computed(()=>days.map((_,weekday)=>calculateTimetable(config.value,weekday)))
const allErrors=computed(()=>[...new Set(previews.value.flatMap(row=>row.errors))])
const generatedDays=computed<GeneratedDay[]>(()=>previews.value.map((row,index)=>({weekday:index+1,periods:row.periods.map(period=>({number:period.number,start:period.start,end:period.end,session:period.session}))})))
const canSave=computed(()=>name.value.trim().length>0&&allErrors.value.length===0&&generatedDays.value.every(day=>day.periods.length>0)&&!props.busy)
const saveButtonLabel=computed(()=>props.busy?(templateId.value?'Đang lưu TKB…':'Đang tạo TKB…'):(templateId.value?'Lưu thành phiên bản mới':'Tạo mẫu TKB'))
const activePeriodOverrides=computed(()=>scope.value==='base'?config.value.periodOverrides:(draftDay.value.periodOverrides??=[]))
const activeBreakRules=computed(()=>scope.value==='base'?config.value.breakRules:(draftDay.value.breakRules??=[]))

function addPeriodOverride(){activePeriodOverrides.value.push({period:1,minutes:config.value.defaultPeriodMinutes})}
function removePeriodOverride(index:number){activePeriodOverrides.value.splice(index,1)}
function addBreak(){activeBreakRules.value.push({afterPeriod:1,type:'custom',minutes:10})}
function removeBreak(index:number){activeBreakRules.value.splice(index,1)}
function commitDay(){if(scope.value==='base')return;config.value.dayOverrides={...config.value.dayOverrides,[scope.value]:cloneTimetableSnapshot(draftDay.value)}}
function clearDay(){if(scope.value==='base')return;const next={...config.value.dayOverrides};delete next[scope.value];config.value.dayOverrides=next;draftDay.value={}}
function updateDayField(key:keyof TimetableDayOverride,event:Event,type:'time'|'number'='time'){
  if(scope.value==='base')return
  const raw=(event.target as HTMLInputElement).value
  ;(draftDay.value as Record<string,unknown>)[key]=raw===''?undefined:type==='number'?Number(raw):raw
  commitDay()
}
function setBaseLongMode(session:SessionName,event:Event){
  const enabled=(event.target as HTMLSelectElement).value==='long'
  if(session==='morning')config.value.morningLongBreakEnabled=enabled
  else config.value.afternoonLongBreakEnabled=enabled
}
function dayLongMode(session:SessionName){
  const value=session==='morning'?draftDay.value.morningLongBreakEnabled:draftDay.value.afternoonLongBreakEnabled
  return value===undefined?'inherit':value?'long':'short'
}
function setDayLongMode(session:SessionName,event:Event){
  const value=(event.target as HTMLSelectElement).value
  const key=session==='morning'?'morningLongBreakEnabled':'afternoonLongBreakEnabled'
  ;(draftDay.value as Record<string,unknown>)[key]=value==='inherit'?undefined:value==='long'
  commitDay()
}
function effectiveLongEnabled(session:SessionName){
  if(scope.value==='base')return session==='morning'?config.value.morningLongBreakEnabled:config.value.afternoonLongBreakEnabled
  const local=session==='morning'?draftDay.value.morningLongBreakEnabled:draftDay.value.afternoonLongBreakEnabled
  return local??(session==='morning'?config.value.morningLongBreakEnabled:config.value.afternoonLongBreakEnabled)
}
function save(){if(!canSave.value)return;const payload={config:cloneTimetableSnapshot(config.value),generatedDays:cloneTimetableSnapshot(generatedDays.value)};if(templateId.value)emit('saveVersion',{templateId:templateId.value,...payload});else emit('create',{schoolYearId:props.schoolYearId,name:name.value.trim(),...payload})}
function syncArrays(){if(scope.value!=='base')commitDay()}
</script>

<template>
  <section class="builder">
    <div class="builder-head"><div><b><Clock3/>Mẫu TKB</b><span>Nhập giờ buổi học và quy luật chung; app tự tính số tiết, giờ từng tiết và các khoảng nghỉ.</span></div><select v-model="templateId"><option value="">+ Tạo mẫu mới</option><option v-for="item in templates" :key="item.id" :value="item.id">{{ item.name }} · v{{ item.latestVersionNumber }}</option></select></div>
    <div v-if="templateId" class="template-context"><span>Đang xem:</span><b>{{ selectedTemplate?.name||name }}</b><span v-if="selectedVersion">· v{{ selectedVersion.version }}</span></div>
    <InlineStatus v-if="feedback&&feedback.state!=='idle'" :state="feedback.state" :message="feedback.message"/>
    <InlineStatus v-if="templateId&&!selectedVersion" state="error" message="Chưa tìm thấy phiên bản đã lưu của mẫu TKB này. Hãy tải lại dữ liệu hoặc lưu một phiên bản mới."/>
    <div class="builder-layout">
      <div class="config-pane">
        <label class="wide">Tên mẫu<input v-model="name" :disabled="Boolean(templateId)" placeholder="TKB chuẩn THCS"></label>

        <div class="scope-row"><div><b>Phạm vi cấu hình</b><small>Cấu hình cơ sở áp dụng cho mọi ngày; biến thể chỉ lưu phần khác biệt.</small></div><select v-model="scope"><option value="base">Cấu hình cơ sở</option><option v-for="(_,i) in days" :key="i" :value="String(i)">{{ days[i] }}</option></select><AppButton v-if="scope!=='base'" size="sm" variant="secondary" @click="clearDay">Xóa biến thể</AppButton></div>

        <div class="session-grid">
          <div class="session-card">
            <div class="session-title"><strong>Buổi sáng</strong><small>App tự sinh tối đa số tiết vừa trong khoảng này.</small></div>
            <label>Bắt đầu<input v-if="scope==='base'" v-model="config.morningStart" type="time"><input v-else :value="draftDay.morningStart??''" type="time" :placeholder="config.morningStart??''" @input="updateDayField('morningStart',$event)"></label>
            <label>Kết thúc<input v-if="scope==='base'" v-model="config.morningEnd" type="time"><input v-else :value="draftDay.morningEnd??''" type="time" :placeholder="config.morningEnd??''" @input="updateDayField('morningEnd',$event)"></label>
            <label class="break-mode">Kiểu nghỉ
              <select v-if="scope==='base'" :value="config.morningLongBreakEnabled?'long':'short'" @change="setBaseLongMode('morning',$event)"><option value="short">Chỉ nghỉ ngắn</option><option value="long">Có nghỉ dài</option></select>
              <select v-else :value="dayLongMode('morning')" @change="setDayLongMode('morning',$event)"><option value="inherit">Kế thừa cấu hình cơ sở</option><option value="short">Chỉ nghỉ ngắn</option><option value="long">Có nghỉ dài</option></select>
            </label>
            <label v-if="effectiveLongEnabled('morning')">Nghỉ dài sau tiết
              <input v-if="scope==='base'" v-model.number="config.morningLongBreakAfterPeriod" type="number" min="1" max="40">
              <input v-else :value="draftDay.morningLongBreakAfterPeriod??''" type="number" min="1" max="40" :placeholder="String(config.morningLongBreakAfterPeriod)" @input="updateDayField('morningLongBreakAfterPeriod',$event,'number')">
            </label>
          </div>

          <div class="session-card">
            <div class="session-title"><strong>Buổi chiều</strong><small>Có thể chọn chỉ nghỉ ngắn hoặc thay một khoảng bằng nghỉ dài.</small></div>
            <label>Bắt đầu<input v-if="scope==='base'" v-model="config.afternoonStart" type="time"><input v-else :value="draftDay.afternoonStart??''" type="time" :placeholder="config.afternoonStart??''" @input="updateDayField('afternoonStart',$event)"></label>
            <label>Kết thúc<input v-if="scope==='base'" v-model="config.afternoonEnd" type="time"><input v-else :value="draftDay.afternoonEnd??''" type="time" :placeholder="config.afternoonEnd??''" @input="updateDayField('afternoonEnd',$event)"></label>
            <label class="break-mode">Kiểu nghỉ
              <select v-if="scope==='base'" :value="config.afternoonLongBreakEnabled?'long':'short'" @change="setBaseLongMode('afternoon',$event)"><option value="short">Chỉ nghỉ ngắn</option><option value="long">Có nghỉ dài</option></select>
              <select v-else :value="dayLongMode('afternoon')" @change="setDayLongMode('afternoon',$event)"><option value="inherit">Kế thừa cấu hình cơ sở</option><option value="short">Chỉ nghỉ ngắn</option><option value="long">Có nghỉ dài</option></select>
            </label>
            <label v-if="effectiveLongEnabled('afternoon')">Nghỉ dài sau tiết
              <input v-if="scope==='base'" v-model.number="config.afternoonLongBreakAfterPeriod" type="number" min="1" max="40">
              <input v-else :value="draftDay.afternoonLongBreakAfterPeriod??''" type="number" min="1" max="40" :placeholder="String(config.afternoonLongBreakAfterPeriod)" @input="updateDayField('afternoonLongBreakAfterPeriod',$event,'number')">
            </label>
          </div>
        </div>

        <div class="duration-grid">
          <label>Thời lượng mỗi tiết <span>(phút)</span><input v-if="scope==='base'" v-model.number="config.defaultPeriodMinutes" type="number" min="1"><input v-else :value="draftDay.defaultPeriodMinutes??''" type="number" min="1" :placeholder="String(config.defaultPeriodMinutes)" @input="updateDayField('defaultPeriodMinutes',$event,'number')"></label>
          <label>Nghỉ giữa các tiết <span>(phút)</span><input v-if="scope==='base'" v-model.number="config.shortBreakMinutes" type="number" min="0"><input v-else :value="draftDay.shortBreakMinutes??''" type="number" min="0" :placeholder="String(config.shortBreakMinutes)" @input="updateDayField('shortBreakMinutes',$event,'number')"></label>
          <label>Nghỉ dài <span>(phút)</span><input v-if="scope==='base'" v-model.number="config.longBreakMinutes" type="number" min="0"><input v-else :value="draftDay.longBreakMinutes??''" type="number" min="0" :placeholder="String(config.longBreakMinutes)" @input="updateDayField('longBreakMinutes',$event,'number')"></label>
        </div>

        <details class="advanced-box">
          <summary><span><b>Ngoại lệ nâng cao</b><small>Chỉ dùng khi một tiết hoặc khoảng nghỉ khác quy luật chung.</small></span><span>{{ activePeriodOverrides.length+activeBreakRules.length }} ngoại lệ</span></summary>
          <div class="advanced-content">
            <div class="rule-box"><div class="rule-title"><b>Ngoại lệ thời lượng tiết</b><AppButton size="sm" variant="secondary" @click="addPeriodOverride"><Plus/>Thêm</AppButton></div><div v-if="!activePeriodOverrides.length" class="empty">Không có ngoại lệ.</div><div v-for="(row,index) in activePeriodOverrides" :key="index" class="rule-row"><label>Tiết<input v-model.number="row.period" type="number" min="1" @change="syncArrays"></label><label>Phút<input v-model.number="row.minutes" type="number" min="1" @change="syncArrays"></label><button type="button" aria-label="Xóa ngoại lệ" @click="removePeriodOverride(index);syncArrays()"><Trash2/></button></div></div>
            <div class="rule-box"><div class="rule-title"><b>Ngoại lệ khoảng nghỉ</b><AppButton size="sm" variant="secondary" @click="addBreak"><Plus/>Thêm</AppButton></div><div v-if="!activeBreakRules.length" class="empty">Không có ngoại lệ; app tự dùng nghỉ ngắn và nghỉ dài đã chọn ở trên.</div><div v-for="(row,index) in activeBreakRules" :key="index" class="break-row"><label>Sau tiết<input v-model.number="row.afterPeriod" type="number" min="1" @change="syncArrays"></label><label>Loại<select v-model="row.type" @change="syncArrays"><option value="none">Không nghỉ</option><option value="short">Nghỉ ngắn</option><option value="long">Nghỉ dài</option><option value="custom">Tùy chỉnh</option></select></label><label v-if="row.type==='custom'">Phút<input v-model.number="row.minutes" type="number" min="1" @change="syncArrays"></label><button type="button" aria-label="Xóa quy tắc" @click="removeBreak(index);syncArrays()"><Trash2/></button></div></div>
          </div>
        </details>

        <div v-if="allErrors.length" class="errors"><b>Chưa thể lưu</b><span v-for="error in allErrors" :key="error">{{ error }}</span></div>
        <AppButton :disabled="!canSave" :loading="busy" @click="save"><Save/>{{ saveButtonLabel }}</AppButton>
      </div>

      <div class="preview-pane"><div class="preview-head"><b>Preview tự động</b><span>Giờ từng tiết và khoảng nghỉ được tính lại ngay khi thay đổi cấu hình.</span></div><div v-for="(day,index) in previews" :key="index" class="day-preview"><strong>{{ days[index] }}</strong><div class="period-chips"><span v-for="period in day.periods" :key="period.number" :class="{exception:period.minutes!==day.config.defaultPeriodMinutes}"><b>T{{ period.number }}</b>{{ period.start }}–{{ period.end }}<small v-if="period.breakAfter">{{ period.breakAfter.type==='long'?'nghỉ dài':'nghỉ' }} {{ period.breakAfter.minutes }}'</small></span></div></div></div>
    </div>
  </section>
</template>

<style scoped>
.builder{display:grid;gap:14px;padding-top:14px;border-top:1px solid color-mix(in srgb,var(--color-primary) 10%,var(--border))}.template-context{display:flex;align-items:center;gap:7px;min-height:38px;padding:8px 11px;border:1px solid color-mix(in srgb,var(--color-primary) 18%,var(--border));border-radius:12px;background:color-mix(in srgb,var(--wash-violet) 40%,var(--surface-soft));font-size:var(--font-size-ui-min)}.template-context span{color:var(--text-muted)}.template-context b{color:var(--color-primary)}.builder-head,.builder-head>div,.preview-head{display:flex;justify-content:space-between;gap:10px;align-items:center}.builder-head>div,.preview-head{align-items:flex-start;flex-direction:column}.builder-head b{display:flex;align-items:center;gap:7px}.builder-head b svg{width:19px}.builder-head span,.preview-head span,.scope-row small,.session-title small{color:var(--text-muted);font-size:var(--font-size-ui-min)}.builder-head select,.scope-row select,.config-pane input,.config-pane select{min-height:42px;border:1px solid var(--border);border-radius:11px;background:var(--input);color:var(--text);padding:7px 10px}.builder-layout{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(390px,.95fr);gap:16px;align-items:start}.config-pane{display:grid;gap:13px}.config-pane label{display:grid;gap:6px;font-size:var(--font-size-ui-min);font-weight:800;color:var(--text-muted)}.config-pane label span{font-weight:650}.wide{grid-column:1/-1}.scope-row{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:9px;align-items:end;padding:12px;border:1px solid var(--border);border-radius:14px;background:var(--surface-soft)}.scope-row>div{display:grid;gap:3px}.session-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.session-card{display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:14px;border:1px solid var(--border);border-radius:16px;background:var(--surface-soft)}.session-title{grid-column:1/-1;display:grid;gap:3px}.session-title strong{font-size:1rem;color:var(--text)}.break-mode{grid-column:1/-1}.duration-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;padding:13px;border-radius:16px;background:color-mix(in srgb,var(--wash-sky) 38%,var(--surface));border:1px solid color-mix(in srgb,var(--color-sky) 18%,var(--border))}.advanced-box{border:1px solid var(--border);border-radius:16px;background:var(--surface-soft);overflow:hidden}.advanced-box summary{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:13px 14px;cursor:pointer;list-style:none}.advanced-box summary::-webkit-details-marker{display:none}.advanced-box summary>span:first-child{display:grid;gap:2px}.advanced-box summary small{color:var(--text-muted)}.advanced-box summary>span:last-child{padding:5px 8px;border-radius:999px;background:var(--surface);color:var(--color-primary);font-size:var(--font-size-ui-min);font-weight:850}.advanced-content{display:grid;gap:12px;padding:0 13px 13px}.rule-box{display:grid;gap:9px;padding:12px;border:1px solid var(--border);border-radius:13px;background:var(--surface)}.rule-title{display:flex;justify-content:space-between;align-items:center;gap:8px}.rule-row,.break-row{display:grid;grid-template-columns:minmax(80px,.7fr) minmax(90px,1fr) auto;gap:8px;align-items:end}.break-row{grid-template-columns:minmax(80px,.7fr) minmax(110px,1fr) minmax(80px,.7fr) auto}.rule-row button,.break-row button{width:40px;height:40px;border:0;border-radius:10px;background:color-mix(in srgb,var(--color-danger) 9%,var(--surface));color:var(--color-danger);cursor:pointer}.rule-row button svg,.break-row button svg{width:17px}.empty{color:var(--text-muted);font-size:var(--font-size-ui-min)}.errors{display:grid;gap:4px;padding:11px;border-radius:12px;background:color-mix(in srgb,var(--color-danger) 8%,var(--surface));color:var(--color-danger);font-size:var(--font-size-ui-min)}.preview-pane{position:sticky;top:94px;display:grid;gap:11px;max-height:calc(100vh - 118px);overflow:auto;padding:14px;border:1px solid var(--border);border-radius:18px;background:color-mix(in srgb,var(--surface) 92%,transparent);box-shadow:var(--shadow-sm)}.day-preview{display:grid;gap:7px}.period-chips{display:flex;gap:6px;flex-wrap:wrap}.period-chips>span{display:grid;gap:1px;min-width:92px;padding:7px 9px;border:1px solid var(--border);border-radius:11px;background:var(--surface);font-size:var(--font-size-ui-min);font-variant-numeric:tabular-nums}.period-chips b{color:var(--color-primary)}.period-chips small{color:var(--text-muted)}.period-chips .exception{border-color:color-mix(in srgb,var(--color-coral) 40%,var(--border));background:color-mix(in srgb,var(--wash-peach) 60%,var(--surface))}@media(max-width:1150px){.builder-layout{grid-template-columns:1fr}.preview-pane{position:relative;top:auto;max-height:none}.session-grid{grid-template-columns:1fr}}@media(max-width:680px){.builder-head{align-items:stretch;flex-direction:column}.scope-row{grid-template-columns:1fr}.session-card,.duration-grid{grid-template-columns:1fr}.break-mode,.session-title{grid-column:auto}.break-row,.rule-row{grid-template-columns:1fr 1fr}.break-row button,.rule-row button{grid-column:2;justify-self:end}}
</style>
