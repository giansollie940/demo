<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { Sparkles, Save, Check, Info } from 'lucide-vue-next'
import AppCard from '../ui/AppCard.vue'
import AppButton from '../ui/AppButton.vue'
import { homeworkRpc, type HomeworkData } from '../../features/homework/api'
import '../../features/homework/management.css'
type Settings = NonNullable<HomeworkData['ai_settings']>
const props = defineProps<{ classId: string; weekId?: string; role: string; settings?: Settings }>()
const emit = defineEmits<{ updated: [data: HomeworkData]; busy: [value: boolean] }>()
const baseline = ref<Settings | null>(props.settings ? { ...props.settings } : null)
const form = reactive({ enabled: props.settings?.semantic_duplicate_enabled ?? true, lower: props.settings?.duplicate_review_threshold ?? 70 as number | string, upper: props.settings?.duplicate_auto_threshold ?? 90 as number | string })
const saving = ref(false), error = ref('')
let alive = true
onBeforeUnmount(() => { alive = false; if (saving.value) emit('busy', false) })
const valid = computed(() => typeof form.lower === 'number' && typeof form.upper === 'number' && Number.isInteger(form.lower) && Number.isInteger(form.upper) && form.lower >= 0 && form.lower < form.upper && form.upper <= 100)
const payload = computed<Settings>(() => ({ semantic_duplicate_enabled: form.enabled, duplicate_review_threshold: Number(form.lower), duplicate_auto_threshold: Number(form.upper) }))
const dirty = computed(() => !baseline.value || !valid.value || payload.value.semantic_duplicate_enabled !== baseline.value.semantic_duplicate_enabled || payload.value.duplicate_review_threshold !== baseline.value.duplicate_review_threshold || payload.value.duplicate_auto_threshold !== baseline.value.duplicate_auto_threshold)
const preview = ref({ lower: Number(form.lower), upper: Number(form.upper) })
watch(() => [form.lower, form.upper], () => { if (valid.value) preview.value = { lower: Number(form.lower), upper: Number(form.upper) } })
function adopt(value: Settings) {
  error.value = ''
  baseline.value = { ...value }
  Object.assign(form, { enabled: value.semantic_duplicate_enabled, lower: value.duplicate_review_threshold, upper: value.duplicate_auto_threshold })
}
watch(() => props.settings, value => { if (value && !saving.value && (!baseline.value || !dirty.value)) adopt(value) })
const state = computed(() => saving.value ? 'saving' : error.value ? 'error' : dirty.value ? 'dirty' : 'saved')
async function save() {
  if (saving.value || !valid.value || !props.settings || props.role !== 'teacher') return
  saving.value = true; error.value = ''; emit('busy', true)
  const expectedClass = props.classId
  try {
    await homeworkRpc('ai_settings', expectedClass, { ...payload.value })
    const fresh = await homeworkRpc<HomeworkData>('load', expectedClass, { week_id: props.weekId || null })
    if (!alive || props.classId !== expectedClass || props.role !== 'teacher') return
    if (!fresh.ai_settings) throw new Error('Đã gửi yêu cầu nhưng chưa tải lại được cài đặt AI. Hãy làm mới để kiểm tra.')
    adopt(fresh.ai_settings); emit('updated', fresh)
  } catch (e) {
    if (alive) error.value = e instanceof Error ? e.message : 'Không lưu được cài đặt. Vui lòng thử lại.'
  } finally { saving.value = false; if (alive) emit('busy', false) }
}
</script>
<template>
  <AppCard v-if="role === 'teacher'" class="hw3-card hw3-ai" padding="lg">
    <form id="ai-settings-form" novalidate @submit.prevent="save">
      <header class="hw3-heading">
        <div class="hw3-title"><span class="hw3-icon"><Sparkles :size="24" aria-hidden="true" /></span><div><p class="hw3-eyebrow">HỖ TRỢ GIÁO VIÊN</p><h2>Cài đặt AI</h2><p>Điều chỉnh cách phát hiện các Báo bài có nội dung tương tự.</p></div></div>
        <label class="hw3-toggle"><input v-model="form.enabled" type="checkbox" role="switch" :disabled="saving || !settings" /><span class="hw3-switch" aria-hidden="true"></span><span>Bật AI phát hiện trùng theo ngữ nghĩa</span></label>
      </header>
      <p v-if="!settings" role="alert" class="hw3-feedback is-error">Chưa tải được cài đặt AI. Hãy làm mới để thử lại.</p>
      <div class="hw3-thresholds">
        <label class="hw3-threshold" for="ai-lower"><span>Chờ GV từ (%)</span><div class="hw3-number"><input id="ai-lower" v-model.number="form.lower" inputmode="numeric" type="number" min="0" max="99" step="1" :disabled="saving" :aria-invalid="!valid" aria-describedby="ai-validation" /><span>%</span></div><small>Từ mốc này, bài nghi trùng cần giáo viên xem xét.</small></label>
        <label class="hw3-threshold" for="ai-upper"><span>Xác định trùng từ (%)</span><div class="hw3-number"><input id="ai-upper" v-model.number="form.upper" inputmode="numeric" type="number" min="1" max="100" step="1" :disabled="saving" :aria-invalid="!valid" aria-describedby="ai-validation" /><span>%</span></div><small>Từ mốc này, bài được xác định là trùng nội dung.</small></label>
      </div>
      <p v-if="!valid" id="ai-validation" role="alert" class="hw3-validation">Nhập số nguyên thỏa mãn 0 ≤ ngưỡng chờ GV &lt; ngưỡng trùng ≤ 100.</p>
      <div class="hw3-preview">
        <div class="hw3-section-line"><h3>Cách xử lý theo mức độ tương đồng</h3><span>0–100%</span></div>
        <div id="ai-scale" class="hw3-scale" role="img" :aria-label="`Đăng bình thường dưới ${preview.lower}%; chờ GV từ ${preview.lower} đến dưới ${preview.upper}%; xác định trùng từ ${preview.upper} đến 100%.`">
          <span class="hw3-band is-normal" :style="{width: preview.lower + '%'}"></span><span class="hw3-band is-review" :style="{width: (preview.upper - preview.lower) + '%'}"></span><span class="hw3-band is-duplicate" :style="{width: (100 - preview.upper) + '%'}"></span>
          <i class="hw3-boundary" :style="{left: preview.lower + '%'}"></i><i class="hw3-boundary" :style="{left: preview.upper + '%'}"></i>
        </div>
        <div class="hw3-legend">
          <div><i class="is-normal"></i><strong>Đăng bình thường</strong><small>{{ preview.lower === 0 ? 'Không có vùng dưới ngưỡng' : `0 đến dưới ${preview.lower}%` }}</small></div>
          <div><i class="is-review"></i><strong>Chờ GV</strong><small>{{ preview.lower }} đến dưới {{ preview.upper }}%</small></div>
          <div><i class="is-duplicate"></i><strong>Xác định trùng</strong><small>{{ preview.upper }}–100%</small></div>
        </div>
      </div>
      <p class="hw3-note"><Info :size="18" aria-hidden="true" /><span>{{ form.enabled ? 'Các ngưỡng áp dụng cho kết quả so sánh trùng. Kiểm tra trùng chính xác vẫn luôn hoạt động.' : 'AI ngữ nghĩa đang tắt. Kiểm tra trùng chính xác và chuẩn hóa vẫn hoạt động; các ngưỡng vẫn được giữ.' }}</span></p>
      <footer class="hw3-save-footer">
        <div id="ai-save-state" :data-state="state" role="status" aria-live="polite" class="hw3-save-state" :class="{'is-success': state === 'saved', 'is-error': state === 'error'}">
          <span v-if="saving">Đang lưu…</span><span v-else-if="error">{{ error }}</span><span v-else-if="dirty">● Chưa lưu thay đổi</span><span v-else><Check :size="18" aria-hidden="true" /> Đã lưu</span>
        </div>
        <AppButton type="submit" :loading="saving" :disabled="!valid || !settings || (!dirty && !error)"><Save :size="18" aria-hidden="true" />{{ saving ? 'Đang lưu…' : 'Lưu cài đặt' }}</AppButton>
      </footer>
    </form>
  </AppCard>
</template>
