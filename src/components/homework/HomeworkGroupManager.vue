<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { Users, Search, ArrowRight, Plus, RefreshCw, ListFilter } from 'lucide-vue-next'
import AppCard from '../ui/AppCard.vue'
import AppButton from '../ui/AppButton.vue'
import { homeworkRpc, type HomeworkData, type EnglishGroup } from '../../features/homework/api'
import { legacyApi } from '../../services/legacy-supabase'
import { directoryUsersFromResponse } from '../../features/students/student-directory'
import type { DirectoryUser } from '../../types/legacy'
import '../../features/homework/management.css'
const props = defineProps<{ classId: string; weekId?: string; role: string; data: HomeworkData }>()
const emit = defineEmits<{ updated: [data: HomeworkData]; busy: [value: boolean] }>()
const directory = ref<DirectoryUser[]>([]), loading = ref(true), loadError = ref(''), stale = ref(false)
const search = ref(''), sort = ref('code'), unassigned = ref(false), groupFilter = ref('')
const selected = ref<string[]>([]), target = ref(''), working = ref(false)
const feedback = ref(''), failures = ref<string[]>([]), hasError = ref(false)
const editorOpen = ref(false), editor = reactive({ id: '', name: '', is_active: true })
let alive = true, directoryRequest = 0
onBeforeUnmount(() => { alive = false; directoryRequest++; if (working.value) emit('busy', false) })
const collator = new Intl.Collator('vi', { numeric: true, sensitivity: 'base' })
const groupMap = computed(() => new Map(props.data.groups.map(g => [g.id, g])))
const membership = computed(() => new Map(props.data.members.map(m => [m.student_id, m.english_group_id])))
const activeGroups = computed(() => props.data.groups.filter(g => g.is_active))
const roster = computed(() => {
  const codes = new Map(directory.value.filter(u => u.classId === props.classId && u.active && !u.deletedAt && ['student', 'monitor'].includes(u.role)).map(u => [u.id, u.code]))
  return props.data.learners.map(s => ({ ...s, code: codes.get(s.id) || '', groupId: membership.value.get(s.id) || '', group: groupMap.value.get(membership.value.get(s.id) || '') }))
})
const visible = computed(() => {
  const query = search.value.trim().toLocaleLowerCase('vi')
  return roster.value.filter(s => (!groupFilter.value || s.groupId === groupFilter.value) && (!unassigned.value || !s.groupId) && (!query || `${s.code}\n${s.name}`.toLocaleLowerCase('vi').includes(query))).sort((a,b) => {
    const left = sort.value === 'name' ? a.name : sort.value === 'group' ? a.group?.name || '' : a.code
    const right = sort.value === 'name' ? b.name : sort.value === 'group' ? b.group?.name || '' : b.code
    return (left ? right ? collator.compare(left,right) : -1 : right ? 1 : 0) || collator.compare(a.code,b.code) || collator.compare(a.name,b.name) || a.id.localeCompare(b.id)
  })
})
const selectedVisible = computed(() => visible.value.filter(s => selected.value.includes(s.id)))
const allVisible = computed(() => visible.value.length > 0 && selectedVisible.value.length === visible.value.length)
const unavailable = computed(() => working.value || loading.value || !!loadError.value || stale.value)
const missingCodes = computed(() => roster.value.filter(s => !s.code).length)
watch([search, unassigned, groupFilter, () => visible.value.map(s => s.id).sort().join('|')], () => { selected.value = [] })
watch(unassigned, enabled => { if (enabled) groupFilter.value = '' })
function chooseGroup(id: string) { if (working.value) return; groupFilter.value = id; unassigned.value = false }
function selectVisible(event: Event) { selected.value = (event.target as HTMLInputElement).checked ? visible.value.map(s => s.id) : [] }
function countMembers(id: string) { return props.data.members.filter(m => m.english_group_id === id).length }
function messageOf(e: unknown) { return e instanceof Error ? e.message : 'Không thực hiện được thao tác. Vui lòng thử lại.' }
async function loadDirectory() {
  const request = ++directoryRequest, expectedClass = props.classId
  loading.value = true; loadError.value = ''
  try {
    const result = await legacyApi.teacherListUsers(expectedClass)
    if (!alive || request !== directoryRequest || props.classId !== expectedClass || props.role !== 'teacher') return
    if (!Array.isArray(result.users)) throw new Error('Chưa tải được danh sách mã đăng nhập. Vui lòng thử lại.')
    directory.value = directoryUsersFromResponse(result)
  } catch (e) { if (alive && request === directoryRequest) loadError.value = messageOf(e) }
  finally { if (alive && request === directoryRequest) loading.value = false }
}
async function refreshData(expectedClass: string) {
  const fresh = await homeworkRpc<HomeworkData>('load', expectedClass, { week_id: props.weekId || null })
  if (alive && props.classId === expectedClass && props.role === 'teacher') { emit('updated', fresh); stale.value = false }
}
async function refresh() {
  if (working.value || props.role !== 'teacher') return
  working.value = true; emit('busy', true); selected.value = []
  try { await refreshData(props.classId); await loadDirectory() }
  catch (e) { stale.value = true; loadError.value = `Chưa tải lại được phân nhóm: ${messageOf(e)}` }
  finally { working.value = false; if (alive) emit('busy', false) }
}
function editGroup(group?: EnglishGroup) {
  Object.assign(editor, group || { id: '', name: '', is_active: true }); editorOpen.value = true
  feedback.value = ''; failures.value = []
}
async function saveGroup() {
  if (working.value || props.role !== 'teacher' || !editor.name.trim()) return
  working.value = true; emit('busy', true); feedback.value = ''; failures.value = []; hasError.value = false
  const expectedClass = props.classId
  try {
    await homeworkRpc('group_save', expectedClass, { ...editor, id: editor.id || null })
    // A completed mutation must be confirmed against the server before showing success.
    stale.value = true
    await refreshData(expectedClass)
    if (alive) { feedback.value = 'Đã lưu nhóm Tiếng Anh.'; editorOpen.value = false }
  } catch (e) { if (alive) { hasError.value = true; feedback.value = messageOf(e) } }
  finally { working.value = false; if (alive) emit('busy', false) }
}
async function assignGroup() {
  if (unavailable.value || props.role !== 'teacher' || !selectedVisible.value.length || !activeGroups.value.some(g => g.id === target.value)) return
  const students = [...selectedVisible.value], destination = target.value, expectedClass = props.classId
  working.value = true; emit('busy', true); feedback.value = ''; failures.value = []; hasError.value = false
  let succeeded = 0
  for (const student of students) {
    // Changing class/role or leaving this screen stops unsent requests; an in-flight request remains server-authorized.
    if (!alive || props.classId !== expectedClass || props.role !== 'teacher') break
    try {
      await homeworkRpc('group_assign', expectedClass, { student_id: student.id, english_group_id: destination })
      succeeded++
    } catch (e) { failures.value.push(`${student.code || student.name} · ${student.name}: ${messageOf(e)}`) }
  }
  if (!alive) return
  selected.value = []; target.value = ''; hasError.value = failures.value.length > 0
  const result = failures.value.length ? `${succeeded} thành công · ${failures.value.length} thất bại. Xem chi tiết lỗi và phân nhóm được tải lại bên dưới.` : `Đã chuyển ${succeeded} học sinh.`
  feedback.value = 'Đang tải lại phân nhóm…'
  try { await refreshData(expectedClass); if (alive) feedback.value = result }
  catch (e) { stale.value = true; hasError.value = true; feedback.value = `${succeeded} yêu cầu thành công · ${failures.value.length} yêu cầu thất bại. Chưa tải lại được phân nhóm: ${messageOf(e)}. Hãy làm mới trước khi thao tác tiếp.` }
  finally { working.value = false; if (alive) emit('busy', false) }
}
onMounted(() => { if (props.role === 'teacher') void loadDirectory() })
</script>
<template>
  <div v-if="role === 'teacher'" class="hw3-groups-layout">
    <AppCard class="hw3-card" padding="lg">
      <header class="hw3-heading"><div class="hw3-title"><span class="hw3-icon"><Users :size="24" aria-hidden="true" /></span><div><p class="hw3-eyebrow">QUẢN LÝ THÀNH VIÊN</p><h2>Nhóm Tiếng Anh</h2><p>Chọn một nhóm để xem thành viên. Dùng danh sách bên dưới để gán hoặc chuyển nhóm.</p></div></div><AppButton variant="secondary" :disabled="working" @click="editGroup()"><Plus :size="18" aria-hidden="true" />Thêm nhóm</AppButton></header>
      <div class="hw3-group-grid" aria-label="Lọc học sinh theo nhóm">
        <button id="group-all" type="button" class="hw3-group-chip" :aria-pressed="!groupFilter && !unassigned" :disabled="working" @click="chooseGroup('')"><strong>Tất cả học sinh</strong><span>{{ data.learners.length }} học sinh</span></button>
        <button v-for="g in data.groups" :id="`group-${g.id}`" :key="g.id" type="button" class="hw3-group-chip" :aria-pressed="groupFilter === g.id" :disabled="working" @click="chooseGroup(g.id)"><strong>{{ g.name }}</strong><span>{{ countMembers(g.id) }} thành viên{{ g.is_active ? '' : ' · Tạm ngưng' }}</span></button>
      </div>
      <p v-if="!data.groups.length" class="hw3-empty">Chưa có nhóm Tiếng Anh. Thêm nhóm để bắt đầu phân nhóm.</p>
      <div v-if="groupFilter" class="hw3-row-actions"><button class="hw3-ghost" :disabled="working" @click="editGroup(groupMap.get(groupFilter))">Chỉnh sửa nhóm đang chọn</button><button class="hw3-ghost" :disabled="working" @click="chooseGroup('')">Xem tất cả học sinh</button></div>
      <form v-if="editorOpen" class="hw3-editor" @submit.prevent="saveGroup"><h3>{{ editor.id ? 'Chỉnh sửa nhóm' : 'Thêm nhóm Tiếng Anh' }}</h3><div class="hw3-editor-fields"><label class="hw3-field">Tên nhóm<input v-model="editor.name" maxlength="100" required :disabled="working" /></label><label class="hw3-check"><input v-model="editor.is_active" type="checkbox" :disabled="working" />Hoạt động</label></div><div class="hw3-row-actions"><AppButton type="submit" :loading="working" :disabled="!editor.name.trim()">Lưu nhóm</AppButton><button class="hw3-ghost" type="button" :disabled="working" @click="editorOpen = false">Hủy</button></div></form>
    </AppCard>
    <AppCard class="hw3-card" padding="lg">
      <header class="hw3-heading"><div class="hw3-title"><span class="hw3-icon"><ListFilter :size="24" aria-hidden="true" /></span><div><h2>Danh sách học sinh</h2><p>Tìm theo mã đăng nhập hoặc họ tên, chọn học sinh rồi chuyển vào nhóm.</p></div></div><AppButton variant="secondary" :disabled="working || loading" @click="refresh"><RefreshCw :size="18" aria-hidden="true" />Làm mới danh sách</AppButton></header>
      <div class="hw3-toolbar"><label class="hw3-field" for="student-search">Tìm học sinh<input id="student-search" v-model="search" type="search" placeholder="Mã đăng nhập hoặc họ tên…" :disabled="working" /></label><label class="hw3-field" for="student-sort">Sắp xếp theo<select id="student-sort" v-model="sort" :disabled="working"><option value="code">Mã đăng nhập — tăng dần</option><option value="name">Họ tên — tăng dần</option><option value="group">Nhóm hiện tại — tăng dần</option></select></label><label class="hw3-check"><input id="unassigned-only" v-model="unassigned" type="checkbox" :disabled="working" />Chưa có nhóm</label></div>
      <p v-if="feedback" id="assignment-feedback" class="hw3-feedback" :class="hasError ? 'is-error' : 'is-success'" role="status" aria-live="polite">{{ feedback }}</p><ul v-if="failures.length" class="hw3-failures"><li v-for="failure in failures" :key="failure">{{ failure }}</li></ul>
      <p v-if="loading" class="hw3-empty" role="status">Đang tải danh sách học sinh…</p>
      <div v-else-if="loadError" role="alert" class="hw3-feedback is-error">{{ loadError }} <button class="hw3-ghost" :disabled="working" @click="refresh">Thử lại</button></div>
      <template v-else>
        <p v-if="stale" role="alert" class="hw3-feedback is-error">Phân nhóm chưa được xác nhận lại. Hãy làm mới danh sách trước khi chuyển nhóm.</p>
        <p v-if="missingCodes" class="hw3-note">{{ missingCodes }} học sinh chưa tải được mã đăng nhập. Có thể làm mới danh sách để kiểm tra.</p>
        <div class="hw3-selection-meta"><label class="hw3-check"><input id="select-visible" type="checkbox" :checked="allVisible" :indeterminate="selectedVisible.length > 0 && !allVisible" :disabled="unavailable || !visible.length" @change="selectVisible" />Chọn tất cả đang hiển thị ({{ visible.length }})</label><span v-if="!selectedVisible.length">Chưa chọn học sinh</span></div>
        <section v-if="selectedVisible.length" id="assignment-bar" class="hw3-action-bar" aria-label="Thanh thao tác gán nhóm"><strong>Đã chọn {{ selectedVisible.length }} học sinh</strong><form id="assignment-form" @submit.prevent="assignGroup"><label class="hw3-field" for="assignment-target">Chuyển vào nhóm<select id="assignment-target" v-model="target" :disabled="unavailable" required><option value="">Chọn nhóm đích</option><option v-for="g in activeGroups" :key="g.id" :value="g.id">{{ g.name }}</option></select></label><AppButton type="submit" :loading="working" :disabled="unavailable || !activeGroups.some(g => g.id === target)"><ArrowRight :size="18" aria-hidden="true" />{{ working ? 'Đang chuyển…' : 'Chuyển vào nhóm' }}</AppButton><AppButton variant="secondary" :disabled="working" @click="selected = []">Bỏ chọn</AppButton></form></section>
        <div v-if="visible.length" class="hw3-roster-container"><table class="hw3-roster"><thead><tr><th scope="col"><span class="sr-only">Chọn học sinh</span></th><th scope="col">Mã đăng nhập</th><th scope="col">Họ tên</th><th scope="col">Nhóm hiện tại</th></tr></thead><tbody><tr v-for="student in visible" :key="student.id" :data-student-id="student.id" :class="{'is-selected': selected.includes(student.id)}"><td><label class="hw3-select-box"><input :id="`select-${student.id}`" v-model="selected" type="checkbox" :value="student.id" :aria-label="`Chọn ${student.code} ${student.name}`" :disabled="unavailable" /></label></td><td data-label="Mã đăng nhập"><code>{{ student.code || 'Chưa có mã' }}</code></td><td data-label="Họ tên">{{ student.name }}</td><td data-label="Nhóm hiện tại"><span class="hw3-badge" :class="{'is-unassigned': !student.groupId}">{{ student.group?.name || (student.groupId ? 'Nhóm không còn khả dụng' : 'Chưa có nhóm') }}{{ student.group && !student.group.is_active ? ' · Tạm ngưng' : '' }}</span></td></tr></tbody></table></div>
        <div v-else class="hw3-empty" role="status"><Search :size="28" aria-hidden="true" /><p>{{ search.trim() ? 'Không có kết quả tìm kiếm. Thử mã đăng nhập hoặc tên khác.' : unassigned ? 'Không có học sinh chưa gán nhóm.' : groupFilter ? 'Nhóm chưa có thành viên.' : 'Lớp chưa có học sinh để phân nhóm.' }}</p></div>
      </template>
    </AppCard>
  </div>
</template>
