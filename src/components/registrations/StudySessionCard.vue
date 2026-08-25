<script setup lang="ts">
import { AlarmClock, CalendarDays, Laptop2, MessageSquareText, Pencil, Siren, Trash2 } from 'lucide-vue-next'
import { computed } from 'vue'
import AppButton from '../ui/AppButton.vue'
import RegistrationStatusBadge from './RegistrationStatusBadge.vue'
import type { PeriodRecord, RegistrationRecord, WeekRecord } from '../../types/legacy'
import type { RegistrationEligibility } from '../../features/registrations/registration-model'
import { dateForDow } from '../../features/registrations/registration-model'

const props = defineProps<{
  week: WeekRecord
  period: PeriodRecord
  dow: number
  registration: RegistrationRecord | null
  eligibility: RegistrationEligibility
}>()
const emit = defineEmits<{ open: [mode: 'regular' | 'emergency']; 'cancel-emergency': [id: string] }>()
const days = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6']
const status = computed(() => props.eligibility.reported ? 'revision_overdue' : props.registration?.status ?? 'missing')
const actionLabel = computed(() => {
  const row = props.registration
  if (row) {
    if (props.eligibility.reported) return 'Xem báo cáo lỗi'
    if (row.status === 'approved' && props.eligibility.editable) return 'Sửa đăng ký'
    if (row.status === 'needs_revision' && props.eligibility.editable) return 'Sửa theo yêu cầu'
    return props.eligibility.editable ? 'Xem / sửa' : 'Xem'
  }
  if (props.eligibility.regularNewAllowed) return 'Đăng ký ngay'
  if (props.eligibility.emergencyAllowed) return 'Đăng ký bổ sung'
  return ({ started: 'Đã qua buổi', upcoming: 'Chưa mở', holiday: 'Tuần nghỉ', deadline: 'Đã quá hạn', locked: 'Đã khóa' } as const)[props.eligibility.readOnlyReason ?? 'locked']
})
function formatDate(value:string){const[y,m,d]=value.split('-');return`${d}/${m}/${y}`}
</script>

<template>
  <article class="session-card" :class="[`day-${dow}`, { emergency: eligibility.emergencyAllowed || registration?.isEmergency, locked: !registration && !eligibility.regularNewAllowed && !eligibility.emergencyAllowed }]">
    <header><div><span>{{ days[dow] }} · {{ formatDate(dateForDow(week,dow)) }}</span><h2>Tiết {{ period.n }}</h2></div><RegistrationStatusBadge :status="status" /></header>
    <div class="session-time"><AlarmClock aria-hidden="true" />{{ period.start }}–{{ period.end }}</div>
    <div class="session-content"><b>{{ registration?.content || 'Chưa đăng ký nội dung' }}</b><p v-if="registration?.note">{{ registration.note }}</p></div>
    <p v-if="registration?.teacherComment" class="feedback"><MessageSquareText aria-hidden="true" /><span><b>Giáo viên:</b> {{ registration.teacherComment }}</span></p>
    <p v-if="registration?.aiReason" class="ai-note"><span>AI</span>{{ registration.aiReason }}</p>
    <p v-if="registration?.usesElectronicDevice" class="device"><Laptop2 aria-hidden="true" />Có sử dụng thiết bị điện tử</p>
    <p v-if="registration?.isEmergency" class="emergency-note"><Siren aria-hidden="true" /><span><b>Đăng ký bổ sung:</b> {{ registration.emergencyReason }}</span></p>
    <footer>
      <AppButton
        v-if="registration || eligibility.regularNewAllowed || eligibility.emergencyAllowed"
        :variant="eligibility.emergencyAllowed && !registration ? 'warning' : 'primary'"
        @click="emit('open', eligibility.emergencyAllowed && !registration ? 'emergency' : 'regular')"
      ><Siren v-if="eligibility.emergencyAllowed && !registration" aria-hidden="true" /><Pencil v-else aria-hidden="true" />{{ actionLabel }}</AppButton>
      <AppButton v-else variant="secondary" disabled>{{ actionLabel }}</AppButton>
      <AppButton v-if="registration?.isEmergency && !eligibility.started" variant="danger" @click="emit('cancel-emergency', registration.id)"><Trash2 aria-hidden="true" />Hủy bổ sung</AppButton>
    </footer>
  </article>
</template>

<style scoped>
.session-card{--session-accent:var(--color-primary);--session-wash:var(--wash-violet);display:grid;gap:16px;min-width:0;padding:20px;border:1px solid color-mix(in srgb,var(--session-accent) 20%,var(--border));border-radius:19px;background:linear-gradient(145deg,var(--surface),color-mix(in srgb,var(--session-wash) 62%,var(--surface)));box-shadow:var(--shadow-sm);position:relative;overflow:hidden;transition:transform var(--transition-fast),box-shadow var(--transition-fast),border-color var(--transition-fast)}.session-card::before{content:"";position:absolute;left:0;top:0;right:0;height:4px;background:var(--session-accent)}.session-card:hover{transform:translateY(-2px);box-shadow:var(--shadow-md)}.day-0{--session-accent:var(--color-sky);--session-wash:var(--wash-sky)}.day-1{--session-accent:var(--color-mint);--session-wash:var(--wash-mint)}.day-2{--session-accent:var(--color-lilac);--session-wash:var(--wash-violet)}.day-3{--session-accent:var(--color-sun);--session-wash:var(--wash-sun)}.day-4{--session-accent:var(--color-pink);--session-wash:var(--wash-pink)}.session-card.emergency{--session-accent:var(--color-warning);--session-wash:var(--wash-sun);border-color:color-mix(in srgb,var(--color-warning) 38%,var(--border))}.session-card.locked{--session-accent:var(--text-muted);--session-wash:var(--surface-soft);opacity:.82}header{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}header span{color:var(--session-accent);font-size:.8rem;font-weight:850}header h2{margin:4px 0 0;font-size:1.3rem}.session-time,.device{display:flex;align-items:center;gap:8px;color:var(--text-muted);font-size:.88rem;font-weight:750}.session-time svg,.device svg{width:18px;color:var(--session-accent)}.session-content p{margin:4px 0 0;color:var(--text-muted)}.feedback,.emergency-note{display:flex;gap:8px;margin:0;padding:12px;border-radius:12px;background:color-mix(in srgb,var(--wash-sky) 70%,var(--surface));color:var(--text-muted)}.emergency-note{background:var(--wash-sun)}.feedback svg,.emergency-note svg{width:18px;flex:none}.feedback svg{color:var(--color-info)}.emergency-note svg{color:var(--color-warning)}.ai-note{display:flex;gap:8px;margin:0;color:var(--text-muted)}.ai-note>span{align-self:start;padding:4px 8px;border-radius:999px;background:var(--wash-violet);color:var(--color-primary);font-size:.72rem;font-weight:900}footer{display:flex;align-items:center;justify-content:flex-end;gap:8px;flex-wrap:wrap}footer :deep(svg){width:17px}@media(max-width:520px){header{flex-direction:column}footer{display:grid;grid-template-columns:1fr}footer :deep(button){width:100%}}@media(prefers-reduced-motion:reduce){.session-card:hover{transform:none}}
</style>
