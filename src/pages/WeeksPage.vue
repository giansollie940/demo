<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { CalendarRange, LocateFixed, Save, Search } from 'lucide-vue-next'
import AppButton from '../components/ui/AppButton.vue'
import AppCard from '../components/ui/AppCard.vue'
import ConfirmDialog from '../components/ui/ConfirmDialog.vue'
import InlineStatus, { type InlineStatusState } from '../components/ui/InlineStatus.vue'
import WeekCalendarSetup from '../components/weeks/WeekCalendarSetup.vue'
import WeekEditorCard from '../components/weeks/WeekEditorCard.vue'
import { useAuthStore } from '../stores/auth'
import { useContextStore } from '../stores/context'
import { getWeekLifecycle } from '../features/weeks/week-lifecycle'
import {
  buildWeekDrafts,
  summarizeWeekStatuses,
  type WeekEditorDraft,
  type WeekOperationalStatus,
} from '../features/weeks/week-editor-model'
import {
  rebaseWeekCalendarMutation,
  saveWeekSettingsMutation,
} from '../features/weeks/week-mutations'
import { useLegacyMutationRuntime } from '../features/shared/useLegacyMutationRuntime'
import { useDirtyEditor } from '../features/shared/dirty-registry'

type WeekFilter = 'all' | 'open' | 'locked' | 'upcoming' | 'holiday'
const auth = useAuthStore()
const context = useContextStore()
const router = useRouter()
const createRuntime = useLegacyMutationRuntime()
const dirtyEditor = useDirtyEditor('weeks')
const drafts = ref<WeekEditorDraft[]>([])
const initialDrafts = ref<WeekEditorDraft[]>([])
const filter = ref<WeekFilter>('all')
const search = ref('')
const firstWeekStart = ref('')
const confirmRebase = ref(false)
const status = ref<InlineStatusState>('idle')
const statusMessage = ref('')

const state = computed(() => auth.legacyState)
const classId = computed(() => context.selectedClassId)
const deadlineTime = computed(() => String(state.value?.settings.registrationDeadlineTime || '20:00'))
const admin = computed(() => auth.currentUser?.role === 'admin')
const lifecycle = computed(() => {
  const current = state.value
  if (!current) return { currentWeekId: null, statuses: {} as Record<string, WeekOperationalStatus>, nextBoundaryMs: null }
  return getWeekLifecycle({
    weeks: current.weeks,
    periods: current.periods,
    getSlots(weekId) {
      const rows = current.overrides.filter(row => row.weekId === weekId)
      return rows.length ? rows.filter(row => row.active !== false) : current.schedule
    },
  })
})
const summary = computed(() => summarizeWeekStatuses(drafts.value, lifecycle.value.statuses))
const isDirty = computed(() => JSON.stringify(drafts.value) !== JSON.stringify(initialDrafts.value))
const serverChanged = computed(() => dirtyEditor.state.serverChanged)
const filterItems: Array<{ id: WeekFilter; label: string }> = [
  { id: 'all', label: 'Tất cả' }, { id: 'open', label: 'Đang mở' },
  { id: 'locked', label: 'Đã khóa' }, { id: 'upcoming', label: 'Sắp tới' },
  { id: 'holiday', label: 'Tuần nghỉ' },
]

function displayStatus(draft: WeekEditorDraft) {
  return draft.holiday ? 'holiday' : lifecycle.value.statuses[draft.id] ?? 'upcoming'
}

const filteredDrafts = computed(() => {
  const term = search.value.trim().toLowerCase()
  return drafts.value.filter(draft => {
    const statusMatches = filter.value === 'all' || displayStatus(draft) === filter.value
    const textMatches = !term || `tuần ${draft.number} ${draft.startDate} ${draft.endDate}`.toLowerCase().includes(term)
    return statusMatches && textMatches
  })
})

function loadDrafts() {
  if (!state.value) return
  const next = buildWeekDrafts(state.value.weeks)
  drafts.value = next
  initialDrafts.value = structuredClone(next)
  firstWeekStart.value = next[0]?.startDate ?? ''
  status.value = 'idle'
  statusMessage.value = ''
  dirtyEditor.markClean()
}

watch(classId, loadDrafts, { immediate: true })
watch(() => auth.legacyState, () => { if (!(isDirty.value && serverChanged.value)) loadDrafts() })
watch(isDirty, value => dirtyEditor.setDirty(value), { immediate: true })

function loadServerVersion(){dirtyEditor.markClean();loadDrafts();status.value='success';statusMessage.value='Đã tải dữ liệu mới từ máy chủ.'}
function keepDraft(){dirtyEditor.acknowledgeServerChange();status.value='success';statusMessage.value='Đang giữ bản chỉnh sửa. Khi lưu, thay đổi sẽ áp dụng lên dữ liệu mới nhất.'}

function replaceDraft(index: number, value: WeekEditorDraft) {
  drafts.value[index] = value
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Chưa lưu được cấu hình tuần.'
}

async function save() {
  if (!classId.value) return
  status.value = 'saving'; statusMessage.value = 'Đang lưu cấu hình tuần…'
  try {
    await saveWeekSettingsMutation(createRuntime(), classId.value, drafts.value)
    loadDrafts()
    status.value = 'success'; statusMessage.value = 'Đã lưu cấu hình tuần.'
  } catch (error) {
    status.value = 'error'; statusMessage.value = errorMessage(error)
  }
}

async function rebase() {
  confirmRebase.value = false
  if (!classId.value) return
  status.value = 'saving'; statusMessage.value = 'Đang xếp lại lịch tuần…'
  try {
    await rebaseWeekCalendarMutation(createRuntime(), classId.value, firstWeekStart.value, deadlineTime.value)
    loadDrafts()
    status.value = 'success'; statusMessage.value = 'Đã xếp lại lịch tuần.'
  } catch (error) {
    status.value = 'error'; statusMessage.value = errorMessage(error)
  }
}

function goCurrentWeek() {
  context.resumeAutoWeek(lifecycle.value.currentWeekId)
}

function viewWeek(id: string) {
  context.selectWeek(id, { manual: true })
}

async function openSchedule(id: string) {
  context.selectWeek(id, { manual: true })
  await router.push('/schedule')
}
</script>

<template>
  <div class="page-stack weeks-page">
    <header class="weeks-header">
      <div><span class="page-context"><CalendarRange /> Tuần học theo lớp</span><h1>Quản lý tuần</h1><p>{{ context.selectedClass?.name || context.selectedClass?.code || 'Lớp đang chọn' }} · trạng thái vận hành được tính tự động</p></div>
      <div class="header-actions">
        <AppButton variant="secondary" @click="goCurrentWeek"><LocateFixed /> Tuần hiện hành</AppButton>
        <AppButton :loading="status === 'saving'" :disabled="!isDirty" @click="save"><Save /> Lưu thay đổi</AppButton>
      </div>
    </header>

    <section class="week-summary">
      <AppCard><span>Đang mở</span><b>{{ summary.open }}</b></AppCard>
      <AppCard><span>Đã khóa</span><b>{{ summary.locked }}</b></AppCard>
      <AppCard><span>Sắp tới</span><b>{{ summary.upcoming }}</b></AppCard>
      <AppCard><span>Tuần nghỉ</span><b>{{ summary.holiday }}</b></AppCard>
      <AppCard><span>Hạn mặc định</span><b class="deadline-value">{{ deadlineTime }}</b><small>tối hôm trước từng buổi</small></AppCard>
    </section>

    <WeekCalendarSetup v-model="firstWeekStart" :deadline-time="deadlineTime" :admin="admin" :disabled="status === 'saving'" @apply="confirmRebase = true" />
    <InlineStatus :state="status" :message="statusMessage" />
    <InlineStatus v-if="serverChanged" state="server-changed" message="Dữ liệu trên máy chủ vừa thay đổi."><div class="conflict-actions"><button type="button" @click="loadServerVersion">Tải bản mới</button><button type="button" @click="keepDraft">Tiếp tục bản đang chỉnh</button></div></InlineStatus>

    <AppCard padding="lg" class="filter-card">
      <div class="filter-chips" role="tablist" aria-label="Lọc tuần">
        <button v-for="item in filterItems" :key="item.id" type="button" role="tab" :aria-selected="filter === item.id" :class="{ active: filter === item.id }" @click="filter = item.id">{{ item.label }}</button>
      </div>
      <label class="week-search"><Search aria-hidden="true" /><input v-model="search" type="search" placeholder="Tìm Tuần 12 hoặc khoảng ngày" /><span class="sr-only">Tìm tuần</span></label>
    </AppCard>

    <section v-if="filteredDrafts.length" class="week-list">
      <WeekEditorCard
        v-for="draft in filteredDrafts"
        :key="draft.id"
        :model-value="draft"
        :operational-status="displayStatus(draft)"
        :current="lifecycle.currentWeekId === draft.id"
        :viewing="context.selectedWeekId === draft.id"
        :deadline-time="deadlineTime"
        :disabled="status === 'saving'"
        @update:model-value="replaceDraft(drafts.findIndex(item => item.id === draft.id), $event)"
        @view="viewWeek(draft.id)"
        @open-schedule="openSchedule(draft.id)"
      />
    </section>
    <AppCard v-else padding="lg" class="empty-weeks"><h2>Không tìm thấy tuần phù hợp</h2><p>Thử đổi bộ lọc hoặc từ khóa tìm kiếm.</p></AppCard>

    <ConfirmDialog
      :open="confirmRebase"
      title="Xếp lại lịch tuần?"
      body="Thao tác sẽ tính lại ngày bắt đầu và kết thúc của các tuần. Trạng thái lớp sẽ được tải lại từ máy chủ."
      confirm-label="Xếp lại lịch tuần"
      cancel-label="Giữ lịch hiện tại"
      @confirm="rebase"
      @cancel="confirmRebase = false"
    />
  </div>
</template>

<style scoped>
.weeks-page{max-width:1500px;margin:0 auto}.weeks-header{display:flex;justify-content:space-between;align-items:flex-start;gap:20px}.weeks-header h1{font-size:clamp(2rem,4vw,3rem);margin:8px 0}.weeks-header p{margin:0;color:var(--text-muted)}.page-context{display:flex;align-items:center;gap:8px;color:var(--color-primary);font-size:.86rem;font-weight:800}.page-context svg,.header-actions :deep(svg){width:18px}.header-actions{display:flex;gap:8px;flex-wrap:wrap}.week-summary{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px}.week-summary :deep(.card){display:grid;gap:4px}.week-summary span,.week-summary small{color:var(--text-muted);font-size:.78rem;font-weight:750}.week-summary b{font-size:1.75rem;font-variant-numeric:tabular-nums}.week-summary .deadline-value{font-size:1.35rem;color:var(--color-primary)}.filter-card{display:flex;align-items:center;justify-content:space-between;gap:16px}.filter-chips{display:flex;gap:8px;flex-wrap:wrap}.filter-chips button{min-height:44px;border:1px solid var(--border);border-radius:999px;padding:8px 12px;background:var(--surface);color:var(--text-muted);font-weight:800;white-space:nowrap}.filter-chips button.active{border-color:var(--color-primary);background:color-mix(in srgb,var(--color-primary) 11%,var(--surface));color:var(--color-primary)}.week-search{display:flex;align-items:center;gap:8px;min-width:min(332px,100%);padding:0 12px;border:1px solid var(--border);border-radius:11px;background:var(--input)}.week-search svg{width:18px;color:var(--text-muted)}.week-search input{width:100%;height:44px;border:0;outline:0;background:transparent;color:var(--text)}.week-list{display:grid;gap:12px}.empty-weeks{text-align:center}.empty-weeks h2{margin-top:0}.empty-weeks p{margin-bottom:0;color:var(--text-muted)}.conflict-actions{display:flex;gap:8px;margin-left:auto}.conflict-actions button{min-height:44px;border:1px solid currentColor;border-radius:8px;padding:8px;background:transparent;color:inherit;font-weight:800;white-space:nowrap}@media(max-width:1050px){.week-summary{grid-template-columns:repeat(3,minmax(0,1fr))}.filter-card{align-items:stretch;flex-direction:column}.week-search{width:100%}}@media(max-width:720px){.weeks-header{flex-direction:column}.header-actions{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);width:100%}.week-summary{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:450px){.header-actions{grid-template-columns:1fr}.week-summary{grid-template-columns:repeat(2,minmax(0,1fr))}.filter-chips{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}.filter-chips button:last-child{grid-column:1/-1}}
</style>
