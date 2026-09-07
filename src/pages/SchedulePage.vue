<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { CalendarClock, RotateCcw, Save, Sparkles } from 'lucide-vue-next'
import AppButton from '../components/ui/AppButton.vue'
import AppCard from '../components/ui/AppCard.vue'
import ConfirmDialog from '../components/ui/ConfirmDialog.vue'
import InlineStatus, { type InlineStatusState } from '../components/ui/InlineStatus.vue'
import ScheduleGrid from '../components/schedule/ScheduleGrid.vue'
import ScheduleModeTabs from '../components/schedule/ScheduleModeTabs.vue'
import { useAuthStore } from '../stores/auth'
import { useContextStore } from '../stores/context'
import {
  createWeekScheduleDraft,
  diffSchedule,
  effectiveScheduleForWeek,
  resolvedTimetableDays,
  timetablePeriodUnion,
} from '../features/schedule/schedule-model'
import {
  resetWeekScheduleMutation,
  saveDefaultScheduleMutation,
  saveWeekScheduleMutation,
} from '../features/schedule/schedule-mutations'
import { useLegacyMutationRuntime } from '../features/shared/useLegacyMutationRuntime'
import { useDirtyEditor } from '../features/shared/dirty-registry'
import type { ScheduleSlot } from '../types/legacy'
import { appDialog } from '../features/shared/app-dialog'

const auth = useAuthStore()
const context = useContextStore()
const createRuntime = useLegacyMutationRuntime()
const dirtyEditor = useDirtyEditor('schedule')
const mode = ref<'default' | 'week'>('default')
const slots = ref<ScheduleSlot[]>([])
const initialSlots = ref<ScheduleSlot[]>([])
const weekDraftCreated = ref(false)
const confirmReset = ref(false)
const status = ref<InlineStatusState>('idle')
const statusMessage = ref('')

const state = computed(() => auth.legacyState)
const isMonitor = computed(() => auth.currentUser?.role === 'monitor')
const readOnly = computed(() => isMonitor.value)
const classId = computed(() => context.selectedClassId)
const weekId = computed(() => context.selectedWeekId)
const weekNumber = computed(() => context.selectedWeek?.number ?? '–')
const hasWeekOverride = computed(() => Boolean(
  weekId.value && state.value?.overrides.some(row => row.weekId === weekId.value),
))
const canEditWeek = computed(() => hasWeekOverride.value || weekDraftCreated.value)
const normalizedKey = (value: ScheduleSlot[]) => JSON.stringify(
  [...value].sort((a, b) => a.dow - b.dow || a.period - b.period),
)
const isDirty = computed(() => normalizedKey(slots.value) !== normalizedKey(initialSlots.value))
const serverChanged = computed(() => dirtyEditor.state.serverChanged)
const selectedByDay = computed(() => [0, 1, 2, 3, 4].map(dow => slots.value.filter(slot => slot.dow === dow).length))
const differences = computed(() => diffSchedule(state.value?.schedule ?? [], slots.value))
const resolvedPeriods = computed(() => state.value ? timetablePeriodUnion(state.value) : [])
const generatedDayPeriods = computed(() => state.value ? resolvedTimetableDays(state.value, context.selectedWeek) : {})

function loadDraft() {
  const current = state.value
  if (!current) return
  if (isMonitor.value) mode.value = 'week'
  const next = isMonitor.value
    ? (weekId.value ? createWeekScheduleDraft(current, weekId.value) : structuredClone(current.schedule))
    : mode.value === 'default'
      ? structuredClone(current.schedule)
      : weekId.value
        ? createWeekScheduleDraft(current, weekId.value)
        : []
  slots.value = next
  initialSlots.value = structuredClone(next)
  weekDraftCreated.value = mode.value === 'week' && hasWeekOverride.value
  status.value = 'idle'
  statusMessage.value = ''
  dirtyEditor.markClean()
}

watch([weekId, classId], loadDraft, { immediate: true })
watch(() => auth.legacyState, () => { if (!(isDirty.value && serverChanged.value)) loadDraft() })
watch(isDirty, value => dirtyEditor.setDirty(value), { immediate: true })

async function changeMode(next:'default'|'week') {
  if (readOnly.value || next === mode.value) return
  if (isDirty.value && !await appDialog.confirm({title:'Thay đổi chưa lưu',body:'Bỏ thay đổi chưa lưu và đổi chế độ TKB?',confirmLabel:'Bỏ thay đổi',danger:true})) return
  dirtyEditor.markClean()
  mode.value = next
  loadDraft()
}

function loadServerVersion(){dirtyEditor.markClean();loadDraft();status.value='success';statusMessage.value='Đã tải dữ liệu mới từ máy chủ.'}
function keepDraft(){dirtyEditor.acknowledgeServerChange();status.value='success';statusMessage.value='Đang giữ bản chỉnh sửa. Khi lưu, thay đổi sẽ áp dụng lên dữ liệu mới nhất.'}

function createWeekDraft() {
  if (!state.value || !weekId.value) return
  slots.value = structuredClone(state.value.schedule)
  initialSlots.value = effectiveScheduleForWeek(state.value, weekId.value)
  weekDraftCreated.value = true
  status.value = 'success'
  statusMessage.value = 'Đã sao chép TKB mặc định. Hãy chỉnh và bấm Lưu TKB.'
}

function cancelChanges() {
  slots.value = structuredClone(initialSlots.value)
  status.value = 'idle'
  statusMessage.value = ''
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Chưa lưu được thời khóa biểu.'
}

async function save() {
  if (readOnly.value || !classId.value || !state.value) return
  status.value = 'saving'
  statusMessage.value = 'Đang lưu thời khóa biểu…'
  try {
    if (mode.value === 'default') {
      await saveDefaultScheduleMutation(createRuntime(), classId.value, slots.value)
    } else {
      if (!weekId.value || !canEditWeek.value) throw new Error('Hãy tạo TKB riêng trước khi lưu.')
      await saveWeekScheduleMutation(createRuntime(), classId.value, weekId.value, slots.value)
    }
    loadDraft()
    status.value = 'success'
    statusMessage.value = mode.value === 'default'
      ? 'Đã lưu TKB mặc định. Các TKB riêng được giữ nguyên.'
      : `Đã lưu TKB riêng của Tuần ${weekNumber.value}.`
  } catch (error) {
    status.value = 'error'
    statusMessage.value = errorMessage(error)
  }
}

async function resetToDefault() {
  if (readOnly.value) return
  confirmReset.value = false
  if (!classId.value || !weekId.value) return
  status.value = 'saving'
  statusMessage.value = 'Đang đưa tuần về TKB mặc định…'
  try {
    await resetWeekScheduleMutation(createRuntime(), classId.value, weekId.value)
    loadDraft()
    status.value = 'success'
    statusMessage.value = `Tuần ${weekNumber.value} đã dùng lại TKB mặc định.`
  } catch (error) {
    status.value = 'error'
    statusMessage.value = errorMessage(error)
  }
}
</script>

<template>
  <div class="page-stack schedule-page">
    <header class="schedule-header">
      <div>
        <span class="page-context"><CalendarClock /> Lịch học theo lớp</span>
        <h1>Thời khóa biểu</h1>
        <p>{{ context.selectedClass?.name || context.selectedClass?.code || 'Lớp đang chọn' }} · Tuần {{ weekNumber }}</p>
      </div>
      <div v-if="!readOnly" class="header-actions">
        <AppButton variant="secondary" :disabled="!isDirty || status === 'saving'" @click="cancelChanges"><RotateCcw /> Hủy thay đổi</AppButton>
        <AppButton :loading="status === 'saving'" :disabled="!isDirty || (mode === 'week' && !canEditWeek)" @click="save"><Save /> Lưu TKB</AppButton>
      </div>
    </header>

    <AppCard padding="lg" class="mode-card">
      <ScheduleModeTabs v-if="!readOnly" :model-value="mode" :week-number="weekNumber" @update:model-value="changeMode" />
      <p v-if="readOnly" class="mode-help">Cán sự xem lịch tự học của buổi/tuần đang chọn; cấu trúc giờ do Admin quản lý và GV chọn tiết tự học.</p>
      <p v-else-if="mode === 'default'" class="mode-help">Áp dụng cho mọi tuần chưa có TKB riêng. Việc lưu không xóa các TKB riêng đã có.</p>
      <p v-else class="mode-help">Chỉ áp dụng cho Tuần {{ weekNumber }} và không ảnh hưởng tuần khác.</p>
    </AppCard>

    <InlineStatus :state="status" :message="statusMessage" />
    <InlineStatus v-if="serverChanged" state="server-changed" message="Dữ liệu trên máy chủ vừa thay đổi."><div class="conflict-actions"><button type="button" @click="loadServerVersion">Tải bản mới</button><button type="button" @click="keepDraft">Tiếp tục bản đang chỉnh</button></div></InlineStatus>

    <AppCard v-if="!readOnly && mode === 'week' && !canEditWeek" padding="lg" class="inherit-card">
      <Sparkles aria-hidden="true" />
      <div><h2>Tuần {{ weekNumber }} đang dùng TKB mặc định</h2><p>Tạo một bản riêng từ lịch mặc định rồi chỉ chỉnh những tiết cần thay đổi.</p></div>
      <AppButton @click="createWeekDraft">Tạo TKB riêng</AppButton>
    </AppCard>

    <AppCard v-else padding="lg">
      <div class="grid-heading">
        <div><h2>{{ mode === 'default' ? 'Lịch áp dụng mặc định' : `Lịch riêng Tuần ${weekNumber}` }}</h2><p>{{ readOnly ? 'Cán sự chỉ xem các tiết tự học theo mẫu TKB đang hiệu lực.' : 'Chọn từng ô để bật hoặc tắt tiết tự học.' }}</p></div>
        <strong>{{ slots.length }} tiết/tuần</strong>
      </div>
      <ScheduleGrid v-model="slots" :periods="resolvedPeriods" :day-periods="generatedDayPeriods" :disabled="status === 'saving'" :read-only="readOnly" />
      <div class="schedule-summary">
        <span v-for="(count, dow) in selectedByDay" :key="dow">Thứ {{ dow + 2 }}: <b>{{ count }}</b></span>
      </div>
      <div v-if="!readOnly && mode === 'week'" class="difference-summary">
        <b>Khác TKB mặc định</b>
        <span>Thêm {{ differences.added.length }} tiết</span>
        <span>Bớt {{ differences.removed.length }} tiết</span>
      </div>
      <div v-if="!readOnly && mode === 'week' && hasWeekOverride" class="reset-row">
        <AppButton variant="danger" @click="confirmReset = true">Dùng lại TKB mặc định</AppButton>
      </div>
    </AppCard>

    <ConfirmDialog
      :open="confirmReset"
      title="Xóa TKB riêng?"
      :body="`Tuần ${weekNumber} sẽ quay lại dùng TKB mặc định. Các tuần khác không bị ảnh hưởng.`"
      confirm-label="Dùng lại TKB mặc định"
      cancel-label="Giữ TKB riêng"
      danger
      @confirm="resetToDefault"
      @cancel="confirmReset = false"
    />
  </div>
</template>

<style scoped>
.schedule-page{max-width:1500px;margin:0 auto}.schedule-header{display:flex;align-items:flex-start;justify-content:space-between;gap:20px}.schedule-header h1{font-size:clamp(2rem,4vw,3rem);margin:8px 0}.schedule-header p,.mode-help,.grid-heading p,.inherit-card p{margin:0;color:var(--text-muted)}.page-context{display:flex;align-items:center;gap:8px;color:var(--color-primary);font-size:.86rem;font-weight:800}.page-context svg{width:18px}.header-actions{display:flex;gap:8px;flex-wrap:wrap}.header-actions :deep(svg){width:18px}.mode-card{display:flex;align-items:center;justify-content:space-between;gap:16px}.mode-help{max-width:64ch}.inherit-card{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:16px;background:linear-gradient(135deg,color-mix(in srgb,var(--color-primary) 10%,var(--surface)),var(--surface))}.inherit-card>svg{width:38px;color:var(--color-primary)}.inherit-card h2,.grid-heading h2{margin:0 0 4px}.grid-heading{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;margin-bottom:20px}.grid-heading>strong{padding:8px 12px;border-radius:999px;background:var(--surface-soft);color:var(--color-primary)}.schedule-summary,.difference-summary{display:flex;gap:8px;flex-wrap:wrap;margin-top:20px}.schedule-summary span,.difference-summary span,.difference-summary>b{padding:8px 12px;border-radius:10px;background:var(--surface-soft);color:var(--text-muted);font-size:.83rem}.difference-summary>b{color:var(--text)}.reset-row{display:flex;justify-content:flex-end;margin-top:20px;padding-top:20px;border-top:1px solid var(--border)}@media(max-width:900px){.schedule-header,.mode-card{align-items:stretch;flex-direction:column}.header-actions{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr)}.inherit-card{grid-template-columns:auto minmax(0,1fr)}.inherit-card :deep(button){grid-column:1/-1}}@media(max-width:520px){.header-actions{grid-template-columns:1fr}.grid-heading{align-items:flex-start;flex-direction:column}.inherit-card{grid-template-columns:1fr}.inherit-card>svg{width:32px}}
.conflict-actions{display:flex;gap:8px;margin-left:auto}.conflict-actions button{min-height:44px;border:1px solid currentColor;border-radius:8px;padding:8px;background:transparent;color:inherit;font-weight:800;white-space:nowrap}
</style>
