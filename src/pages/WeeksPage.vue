<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { CalendarRange, LocateFixed, Save, Search } from 'lucide-vue-next'
import AppButton from '../components/ui/AppButton.vue'
import AppCard from '../components/ui/AppCard.vue'
import InlineStatus, { type InlineStatusState } from '../components/ui/InlineStatus.vue'
import WeekEditorCard from '../components/weeks/WeekEditorCard.vue'
import WeekStatusBadge from '../components/weeks/WeekStatusBadge.vue'
import { useAuthStore } from '../stores/auth'
import { useContextStore } from '../stores/context'
import { getWeekLifecycle } from '../features/weeks/week-lifecycle'
import { buildWeekDrafts, summarizeWeekStatuses, type WeekEditorDraft, type WeekOperationalStatus } from '../features/weeks/week-editor-model'
import { saveWeekSettingsMutation } from '../features/weeks/week-mutations'
import { useLegacyMutationRuntime } from '../features/shared/useLegacyMutationRuntime'
import { useDirtyEditor } from '../features/shared/dirty-registry'

type WeekFilter = 'all' | 'open' | 'locked' | 'upcoming' | 'holiday'
const auth=useAuthStore(),context=useContextStore(),router=useRouter(),createRuntime=useLegacyMutationRuntime(),dirtyEditor=useDirtyEditor('weeks')
const drafts=ref<WeekEditorDraft[]>([]),initialDrafts=ref<WeekEditorDraft[]>([]),selectedDraftId=ref<string|null>(null)
const filter=ref<WeekFilter>('all'),search=ref(''),status=ref<InlineStatusState>('idle'),statusMessage=ref('')
const state=computed(()=>auth.legacyState),classId=computed(()=>context.selectedClassId)
const deadlineTime=computed(()=>String(state.value?.settings.registrationDeadlineTime||'20:00'))
const lifecycle=computed(()=>{const current=state.value;if(!current)return{currentWeekId:null,statuses:{} as Record<string,WeekOperationalStatus>,nextBoundaryMs:null};return getWeekLifecycle({weeks:current.weeks,periods:current.periods,getSlots(weekId){const rows=current.overrides.filter(row=>row.weekId===weekId);return rows.length?rows.filter(row=>row.active!==false):current.schedule}})})
const summary=computed(()=>summarizeWeekStatuses(drafts.value,lifecycle.value.statuses))
const isDirty=computed(()=>JSON.stringify(drafts.value)!==JSON.stringify(initialDrafts.value)),serverChanged=computed(()=>dirtyEditor.state.serverChanged)
const filterItems:Array<{id:WeekFilter;label:string}>=[{id:'all',label:'Tất cả'},{id:'open',label:'Đang mở'},{id:'locked',label:'Đã khóa'},{id:'upcoming',label:'Sắp tới'},{id:'holiday',label:'Tuần nghỉ'}]
function displayStatus(draft:WeekEditorDraft){return draft.holiday?'holiday':draft.manualStatus??lifecycle.value.statuses[draft.id]??'upcoming'}
const nextAutoCloseText=computed(()=>lifecycle.value.nextBoundaryMs?new Intl.DateTimeFormat('vi-VN',{weekday:'short',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}).format(new Date(lifecycle.value.nextBoundaryMs)):'Chưa xác định')
const filteredDrafts=computed(()=>{const term=search.value.trim().toLowerCase();return drafts.value.filter(draft=>(filter.value==='all'||displayStatus(draft)===filter.value)&&(!term||`tuần ${draft.number} ${draft.startDate} ${draft.endDate}`.toLowerCase().includes(term)))})
const selectedDraft=computed(()=>drafts.value.find(item=>item.id===selectedDraftId.value)??null)
function chooseDefaultDraft(rows:WeekEditorDraft[]){const preferred=context.selectedWeekId||lifecycle.value.currentWeekId;return rows.find(row=>row.id===preferred)?.id??rows[0]?.id??null}
function loadDrafts(){if(!state.value)return;const next=buildWeekDrafts(state.value.weeks);drafts.value=next;initialDrafts.value=structuredClone(next);if(!selectedDraftId.value||!next.some(item=>item.id===selectedDraftId.value))selectedDraftId.value=chooseDefaultDraft(next);status.value='idle';statusMessage.value='';dirtyEditor.markClean()}
watch(classId,loadDrafts,{immediate:true});watch(()=>auth.legacyState,()=>{if(!(isDirty.value&&serverChanged.value))loadDrafts()});watch(isDirty,value=>dirtyEditor.setDirty(value),{immediate:true})
watch(filteredDrafts,rows=>{if(rows.length&&!rows.some(item=>item.id===selectedDraftId.value))selectedDraftId.value=rows[0].id})
function loadServerVersion(){dirtyEditor.markClean();loadDrafts();status.value='success';statusMessage.value='Đã tải dữ liệu mới từ máy chủ.'}
function keepDraft(){dirtyEditor.acknowledgeServerChange();status.value='success';statusMessage.value='Đang giữ bản chỉnh sửa. Khi lưu, thay đổi sẽ áp dụng lên dữ liệu mới nhất.'}
function replaceSelected(value:WeekEditorDraft){const index=drafts.value.findIndex(item=>item.id===value.id);if(index>=0)drafts.value[index]=value}
function errorMessage(error:unknown){return error instanceof Error?error.message:'Chưa lưu được cấu hình tuần.'}
async function save(){if(!classId.value)return;status.value='saving';statusMessage.value='Đang lưu cấu hình tuần…';try{await saveWeekSettingsMutation(createRuntime(),classId.value,drafts.value);loadDrafts();status.value='success';statusMessage.value='Đã lưu cấu hình tuần.'}catch(error){status.value='error';statusMessage.value=errorMessage(error)}}
function goCurrentWeek(){context.resumeAutoWeek(lifecycle.value.currentWeekId);const id=lifecycle.value.currentWeekId;if(id)selectedDraftId.value=id}
function selectDraft(id:string){selectedDraftId.value=id;context.selectWeek(id,{manual:id!==lifecycle.value.currentWeekId})}
function viewWeek(id:string){context.selectWeek(id,{manual:true})}
async function openSchedule(id:string){context.selectWeek(id,{manual:true});await router.push('/schedule')}
</script>

<template>
  <div class="page-stack weeks-page">
    <header class="weeks-header">
      <div><span class="page-context"><CalendarRange/> Tuần học theo lớp</span><h1>Quản lý tuần</h1><p>{{ context.selectedClass?.name||context.selectedClass?.code||'Lớp đang chọn' }} · chọn một tuần để vận hành deadline, trạng thái và TKB.</p></div>
      <div class="header-actions"><AppButton variant="secondary" @click="goCurrentWeek"><LocateFixed/>Tuần hiện hành</AppButton><AppButton :loading="status==='saving'" :disabled="!isDirty" @click="save"><Save/>Lưu thay đổi</AppButton></div>
    </header>

    <section class="week-summary">
      <AppCard><span>Đang mở</span><b>{{ summary.open }}</b></AppCard><AppCard><span>Đã khóa</span><b>{{ summary.locked }}</b></AppCard><AppCard><span>Sắp tới</span><b>{{ summary.upcoming }}</b></AppCard><AppCard><span>Tuần nghỉ</span><b>{{ summary.holiday }}</b></AppCard>
      <AppCard><span>Hạn mặc định</span><b class="deadline-value">{{ deadlineTime }}</b><small>tối hôm trước từng buổi</small></AppCard>
      <AppCard class="auto-close-card"><span>Tự động đóng sau buổi tự học cuối</span><b class="auto-close-value">{{ nextAutoCloseText }}</b><small>Nếu GV không mở/đóng thủ công.</small></AppCard>
    </section>
    <InlineStatus :state="status" :message="statusMessage"/>
    <InlineStatus v-if="serverChanged" state="server-changed" message="Dữ liệu trên máy chủ vừa thay đổi."><div class="conflict-actions"><button type="button" @click="loadServerVersion">Tải bản mới</button><button type="button" @click="keepDraft">Tiếp tục bản đang chỉnh</button></div></InlineStatus>

    <section class="week-master-detail">
      <AppCard padding="md" class="week-master-list">
        <div class="master-tools">
          <label class="week-search"><Search aria-hidden="true"/><input v-model="search" type="search" placeholder="Tìm Tuần 12"/><span class="sr-only">Tìm tuần</span></label>
          <div class="filter-chips" role="tablist" aria-label="Lọc tuần"><button v-for="item in filterItems" :key="item.id" type="button" role="tab" :aria-selected="filter===item.id" :class="{active:filter===item.id}" @click="filter=item.id">{{ item.label }}</button></div>
        </div>
        <div class="week-master-scroll">
          <button v-for="draft in filteredDrafts" :key="draft.id" type="button" class="week-master-item" :class="{selected:selectedDraftId===draft.id,current:lifecycle.currentWeekId===draft.id}" @click="selectDraft(draft.id)">
            <span><b>Tuần {{ draft.number }}</b><small>{{ draft.startDate }} → {{ draft.endDate }}</small></span>
            <WeekStatusBadge :status="draft.holiday?'holiday':displayStatus(draft)"/>
          </button>
          <div v-if="!filteredDrafts.length" class="empty-master">Không tìm thấy tuần phù hợp.</div>
        </div>
      </AppCard>

      <div class="week-detail-panel">
        <WeekEditorCard v-if="selectedDraft" :model-value="selectedDraft" :operational-status="displayStatus(selectedDraft)" :current="lifecycle.currentWeekId===selectedDraft.id" :viewing="context.selectedWeekId===selectedDraft.id" :deadline-time="deadlineTime" :disabled="status==='saving'" @update:model-value="replaceSelected" @view="viewWeek(selectedDraft.id)" @open-schedule="openSchedule(selectedDraft.id)"/>
        <AppCard v-else padding="lg" class="empty-weeks"><h2>Chọn một tuần</h2><p>Chọn tuần ở danh sách bên trái để chỉnh cấu hình vận hành.</p></AppCard>
      </div>
    </section>
  </div>
</template>

<style scoped>
.weeks-page{max-width:1500px;margin:0 auto}.weeks-header{display:flex;justify-content:space-between;align-items:flex-start;gap:20px}.weeks-header h1{font-size:clamp(2rem,4vw,3rem);margin:8px 0}.weeks-header p{margin:0;color:var(--text-muted)}.page-context{display:flex;align-items:center;gap:8px;color:var(--color-primary);font-size:.86rem;font-weight:800}.page-context svg,.header-actions :deep(svg){width:18px}.header-actions{display:flex;gap:8px;flex-wrap:wrap}.week-summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.week-summary :deep(.card){display:grid;gap:4px}.week-summary span,.week-summary small{color:var(--text-muted);font-size:.78rem;font-weight:750}.week-summary b{font-size:1.75rem;font-variant-numeric:tabular-nums}.week-summary .deadline-value{font-size:1.35rem;color:var(--color-primary)}.week-summary .auto-close-value{font-size:1rem;color:var(--color-coral);line-height:1.25}.week-master-detail{display:grid;grid-template-columns:minmax(280px,340px) minmax(0,1fr);gap:14px;align-items:start}.week-master-list{position:sticky;top:94px;display:grid;gap:12px;max-height:calc(100vh - 118px);overflow:hidden}.master-tools{display:grid;gap:10px}.week-search{display:flex;align-items:center;gap:8px;padding:0 11px;border:1px solid var(--border);border-radius:13px;background:var(--input)}.week-search svg{width:17px;color:var(--text-muted)}.week-search input{width:100%;height:42px;border:0;outline:0;background:transparent;color:var(--text)}.filter-chips{display:flex;gap:6px;flex-wrap:wrap}.filter-chips button{min-height:36px;border:1px solid var(--border);border-radius:999px;padding:6px 9px;background:var(--surface);color:var(--text-muted);font-size:.76rem;font-weight:800}.filter-chips button.active{border-color:var(--color-primary);background:color-mix(in srgb,var(--color-primary) 11%,var(--surface));color:var(--color-primary)}.week-master-scroll{display:grid;gap:7px;overflow:auto;padding:2px}.week-master-item{display:flex;align-items:center;justify-content:space-between;gap:9px;width:100%;min-height:64px;padding:9px 10px;border:1px solid var(--border);border-radius:15px;background:color-mix(in srgb,var(--surface) 78%,transparent);color:var(--text);text-align:left;cursor:pointer;transition:transform var(--transition-fast),box-shadow var(--transition-fast),border-color var(--transition-fast),background var(--transition-fast)}.week-master-item>span{display:grid;gap:3px}.week-master-item small{color:var(--text-muted);font-size:.72rem}.week-master-item:hover{transform:translateX(3px);border-color:color-mix(in srgb,var(--color-primary) 25%,var(--border));box-shadow:0 9px 20px color-mix(in srgb,var(--color-primary) 8%,transparent)}.week-master-item.selected{background:linear-gradient(110deg,color-mix(in srgb,var(--wash-peach) 70%,var(--surface)),color-mix(in srgb,var(--wash-violet) 55%,var(--surface)));border-color:color-mix(in srgb,var(--color-primary) 30%,var(--border));box-shadow:0 10px 24px color-mix(in srgb,var(--color-primary) 10%,transparent)}.week-master-item.current::before{content:"";width:7px;height:7px;border-radius:999px;background:var(--color-success);box-shadow:0 0 0 3px color-mix(in srgb,var(--color-success) 12%,transparent)}.week-detail-panel{min-width:0}.empty-master,.empty-weeks{text-align:center;color:var(--text-muted);padding:18px}.empty-weeks h2{margin-top:0}.conflict-actions{display:flex;gap:8px;margin-left:auto}.conflict-actions button{min-height:44px;border:1px solid currentColor;border-radius:8px;padding:8px;background:transparent;color:inherit;font-weight:800;white-space:nowrap}@media(max-width:1050px){.week-summary{grid-template-columns:repeat(3,minmax(0,1fr))}.week-master-detail{grid-template-columns:1fr}.week-master-list{position:relative;top:auto;max-height:none}.week-master-scroll{grid-template-columns:repeat(2,minmax(0,1fr));max-height:360px}}@media(max-width:720px){.weeks-header{flex-direction:column}.header-actions{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);width:100%}.week-summary{grid-template-columns:repeat(2,minmax(0,1fr))}.week-master-scroll{grid-template-columns:1fr}}@media(max-width:450px){.header-actions{grid-template-columns:1fr}.filter-chips{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}.filter-chips button:last-child{grid-column:1/-1}}
</style>
