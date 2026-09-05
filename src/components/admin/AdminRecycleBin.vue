<script setup lang="ts">
// Thùng rác: app vốn xoá mềm (registrations.is_deleted, profiles.deleted_at)
// nên dữ liệu GV lỡ xoá vẫn còn nguyên trong database — trước đây chỉ là không
// có đường nào để xem hay lấy lại. Trang này là đường đó, và chỉ Admin dùng
// được: quyền được kiểm ngay trong RPC (is_root_admin), không chỉ ẩn nút.
import { computed, ref } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { AlertTriangle, RefreshCw, RotateCcw, Search, Trash2, UserRound } from 'lucide-vue-next'
import AppButton from '../ui/AppButton.vue'
import AppCard from '../ui/AppCard.vue'
import InlineStatus, { type InlineStatusState } from '../ui/InlineStatus.vue'
import { appDialog } from '../../features/shared/app-dialog'
import { legacyApi } from '../../services/legacy-supabase'
import type { DeletedRegistrationRecord, DeletedUserRecord } from '../../types/legacy'

const kind = ref<'registrations' | 'users'>('registrations')
const search = ref('')
const busyId = ref<string | null>(null)
const status = ref<InlineStatusState>('idle')
const statusMessage = ref('')
const days = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ nhật']

const registrations = useQuery({
  queryKey: ['admin-deleted-registrations'],
  queryFn: () => legacyApi.adminListDeletedRegistrations(200),
  staleTime: 10_000,
  retry: 1,
})
const users = useQuery({
  queryKey: ['admin-deleted-users'],
  queryFn: () => legacyApi.adminListDeletedUsers(200),
  staleTime: 10_000,
  retry: 1,
})

const active = computed(() => (kind.value === 'registrations' ? registrations : users))
const loading = computed(() => active.value.isFetching.value)

// supabase-js ném thẳng PostgrestError — một object thường, không phải Error —
// nên `error instanceof Error` là false và trang sẽ im lặng như thể thùng rác
// trống. Đọc message theo kiểu vịt để lỗi nào cũng nói ra được.
// Riêng PGRST202 nghĩa là đã cập nhật frontend nhưng chưa chạy phần SQL: nói
// đúng việc cần làm thay vì ném câu tiếng Anh của PostgREST.
const MISSING_SQL = 'Chưa cài phần database của Thùng rác. Hãy mở Supabase → SQL Editor và chạy 2-THUNG-RAC-ADMIN.sql, rồi tải lại trang.'
function describeError(error: unknown, fallback: string): string {
  if (!error) return ''
  const source = error as { message?: unknown; code?: unknown; hint?: unknown }
  const raw = typeof error === 'string' ? error : String(source.message ?? '')
  const code = String(source.code ?? '')
  if (code === 'PGRST202' || /could not find the function|schema cache/i.test(raw)) return MISSING_SQL
  return raw || fallback
}
const errorMessage = computed(() => describeError(active.value.error.value, 'Không tải được danh sách đã xoá.'))

function matches(haystack: Array<string | number | null | undefined>) {
  const q = search.value.trim().toLowerCase()
  if (!q) return true
  return haystack.some(value => String(value ?? '').toLowerCase().includes(q))
}

const visibleRegistrations = computed<DeletedRegistrationRecord[]>(() =>
  (registrations.data.value ?? []).filter(row =>
    matches([row.studentCode, row.studentName, row.content, row.deletedByName, row.weekNumber])),
)
const visibleUsers = computed<DeletedUserRecord[]>(() =>
  (users.data.value ?? []).filter(row => matches([row.code, row.fullName, row.classCode, row.role])),
)

const roleLabels: Record<string, string> = {
  student: 'Học sinh', monitor: 'Cán sự lớp', teacher: 'Giáo viên', admin: 'Quản trị viên',
}
function when(value: string | null) {
  if (!value) return 'Không rõ thời điểm'
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? 'Không rõ thời điểm'
    : date.toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' })
}

async function restoreRegistration(row: DeletedRegistrationRecord) {
  if (!row.canRestore) return
  const ok = await appDialog.confirm({
    title: 'Khôi phục đăng ký',
    body: `Đưa đăng ký của ${row.studentName} (${days[row.dow] ?? ''} · Tiết ${row.period}) trở lại? Đăng ký sẽ hiện lại đúng trạng thái trước khi bị xoá.`,
    confirmLabel: 'Khôi phục',
  })
  if (!ok) return
  busyId.value = row.id
  status.value = 'saving'
  statusMessage.value = 'Đang khôi phục…'
  try {
    await legacyApi.adminRestoreRegistration(row.id)
    await registrations.refetch()
    status.value = 'success'
    statusMessage.value = `Đã khôi phục đăng ký của ${row.studentName}.`
  } catch (error) {
    status.value = 'error'
    statusMessage.value = describeError(error, 'Không khôi phục được đăng ký.')
  } finally {
    busyId.value = null
  }
}

async function restoreUser(row: DeletedUserRecord) {
  const ok = await appDialog.confirm({
    title: 'Khôi phục tài khoản',
    body: `Khôi phục ${row.fullName} (${row.code})? Tài khoản sẽ hoạt động trở lại và đăng nhập được như cũ.`,
    confirmLabel: 'Khôi phục',
  })
  if (!ok) return
  busyId.value = row.id
  status.value = 'saving'
  statusMessage.value = 'Đang khôi phục…'
  try {
    await legacyApi.adminRestoreUser(row.id)
    await users.refetch()
    status.value = 'success'
    statusMessage.value = `Đã khôi phục tài khoản ${row.code}.`
  } catch (error) {
    status.value = 'error'
    statusMessage.value = describeError(error, 'Không khôi phục được tài khoản.')
  } finally {
    busyId.value = null
  }
}

function refresh() {
  status.value = 'idle'
  statusMessage.value = ''
  active.value.refetch()
}
</script>

<template>
  <div class="recycle-bin">
    <AppCard padding="md" class="bin-toolbar">
      <div class="kind-tabs" role="tablist" aria-label="Loại dữ liệu đã xoá">
        <button type="button" role="tab" :aria-selected="kind === 'registrations'" :class="{ active: kind === 'registrations' }" @click="kind = 'registrations'">
          <Trash2 aria-hidden="true" />Đăng ký · {{ (registrations.data.value ?? []).length }}
        </button>
        <button type="button" role="tab" :aria-selected="kind === 'users'" :class="{ active: kind === 'users' }" @click="kind = 'users'">
          <UserRound aria-hidden="true" />Tài khoản · {{ (users.data.value ?? []).length }}
        </button>
      </div>
      <label class="bin-search"><Search aria-hidden="true" /><input v-model="search" type="search" placeholder="Tìm tên, mã, nội dung…"></label>
      <AppButton variant="secondary" :loading="loading" @click="refresh"><RefreshCw aria-hidden="true" />Làm mới</AppButton>
    </AppCard>

    <InlineStatus :state="status" :message="statusMessage" />
    <InlineStatus v-if="errorMessage" state="error" :message="errorMessage" />

    <AppCard padding="md" class="bin-explain">
      <AlertTriangle aria-hidden="true" />
      <p>Đây là những gì giáo viên đã xoá. App xoá mềm nên dữ liệu vẫn còn nguyên và khôi phục được. Xoá vĩnh viễn ở trang Học sinh / Giáo viên thì không nằm ở đây và không lấy lại được.</p>
    </AppCard>

    <template v-if="kind === 'registrations'">
      <div v-if="visibleRegistrations.length" class="bin-list">
        <AppCard v-for="row in visibleRegistrations" :key="row.id" padding="md" class="bin-row">
          <div class="row-main">
            <div class="row-head">
              <b>{{ row.studentName }}</b><span class="code">{{ row.studentCode }}</span>
              <span class="slot">Tuần {{ row.weekNumber ?? '?' }} · {{ days[row.dow] ?? `Ngày ${row.dow + 1}` }} · Tiết {{ row.period }}</span>
            </div>
            <p class="content">{{ row.content || 'Không có nội dung' }}</p>
            <small class="meta">Xoá bởi <b>{{ row.deletedByName }}</b> · {{ when(row.deletedAt) }}</small>
            <small v-if="!row.canRestore" class="blocked">{{ row.blockedReason }}</small>
          </div>
          <AppButton :disabled="!row.canRestore" :loading="busyId === row.id" @click="restoreRegistration(row)">
            <RotateCcw aria-hidden="true" />Khôi phục
          </AppButton>
        </AppCard>
      </div>
      <AppCard v-else padding="lg" class="bin-empty">
        <h2>Thùng rác đăng ký trống</h2>
        <p>{{ search ? 'Không có mục nào khớp từ khoá đang tìm.' : 'Chưa có đăng ký nào bị xoá.' }}</p>
      </AppCard>
    </template>

    <template v-else>
      <div v-if="visibleUsers.length" class="bin-list">
        <AppCard v-for="row in visibleUsers" :key="row.id" padding="md" class="bin-row">
          <div class="row-main">
            <div class="row-head">
              <b>{{ row.fullName }}</b><span class="code">{{ row.code }}</span>
              <span class="slot">{{ roleLabels[row.role] ?? row.role }}{{ row.classCode ? ` · ${row.classCode}` : '' }}</span>
            </div>
            <small class="meta">Xoá lúc {{ when(row.deletedAt) }}</small>
          </div>
          <AppButton :loading="busyId === row.id" @click="restoreUser(row)">
            <RotateCcw aria-hidden="true" />Khôi phục
          </AppButton>
        </AppCard>
      </div>
      <AppCard v-else padding="lg" class="bin-empty">
        <h2>Thùng rác tài khoản trống</h2>
        <p>{{ search ? 'Không có mục nào khớp từ khoá đang tìm.' : 'Chưa có tài khoản nào bị xoá mềm.' }}</p>
      </AppCard>
    </template>
  </div>
</template>

<style scoped>
.recycle-bin{display:grid;gap:14px}
.bin-toolbar{display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap}
.kind-tabs{display:flex;gap:8px;flex-wrap:wrap}
.kind-tabs button{display:inline-flex;align-items:center;gap:7px;padding:9px 13px;border:1px solid var(--border);border-radius:999px;background:var(--surface-soft);color:var(--text);font-weight:850;font-size:var(--font-size-ui-min);cursor:pointer;transition:border-color var(--transition-fast),background var(--transition-fast),transform var(--transition-fast)}
.kind-tabs button:hover{transform:translateY(-1px);border-color:color-mix(in srgb,var(--color-primary) 34%,var(--border))}
.kind-tabs button.active{border-color:var(--color-primary);background:color-mix(in srgb,var(--color-primary) 11%,var(--surface));color:var(--color-primary)}
.kind-tabs svg,.bin-search svg,.bin-explain svg{width:16px}
.bin-search{display:flex;align-items:center;gap:8px;flex:1 1 240px;min-width:200px;padding:0 12px;border:1px solid var(--border);border-radius:12px;background:var(--input);color:var(--text-muted)}
.bin-search input{flex:1;min-height:44px;border:0;background:transparent;color:var(--text);font:inherit}
.bin-search input:focus{outline:none}
.bin-explain{display:flex;align-items:flex-start;gap:10px;color:var(--text-muted)}
.bin-explain svg{color:var(--color-warning);flex:none;margin-top:2px}
.bin-explain p{margin:0;line-height:1.55}
.bin-list{display:grid;gap:10px}
.bin-row{display:flex;align-items:center;justify-content:space-between;gap:16px}
.row-main{display:grid;gap:5px;min-width:0}
.row-head{display:flex;align-items:center;gap:9px;flex-wrap:wrap}
.row-head b{font-size:1.02rem}
.code,.slot{font-size:var(--font-size-ui-min);font-weight:850;padding:3px 9px;border-radius:999px;background:var(--surface-soft);color:var(--text-muted)}
.content{margin:0;color:var(--text);white-space:pre-wrap}
.meta{color:var(--text-muted)}
.blocked{color:var(--color-warning);font-weight:800}
.bin-empty{text-align:center;color:var(--text-muted)}
.bin-empty h2{margin:0 0 6px;color:var(--text)}
.bin-empty p{margin:0}
@media(max-width:700px){.bin-row{align-items:stretch;flex-direction:column}.bin-row :deep(.app-button){width:100%}}
</style>
