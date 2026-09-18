<script setup lang="ts">
// FEAT-007 — Kho lưu trữ: đóng gói cuối năm, xác nhận và giải phóng dung lượng.
//
// The screen exists to make one irreversible decision safe. Its shape follows
// the gate, not the other way round: an Admin can only reach "xoá dữ liệu trên
// cloud" by walking through preflight → đóng gói → kiểm tra đạt → mở lại tệp đã
// lưu. Each step is either done or visibly not done; none of them can be
// asserted by ticking a box (RB-708/DEC-062).
import { computed, onMounted, ref } from 'vue'
import { Archive, CheckCheck, CircleAlert, FileDown, Lock, ShieldAlert, Trash2, TriangleAlert } from 'lucide-vue-next'
import AppButton from '../ui/AppButton.vue'
import AppCard from '../ui/AppCard.vue'
import InlineStatus, { type InlineStatusState } from '../ui/InlineStatus.vue'
import ArchiveViewer from './ArchiveViewer.vue'
import { appDialog } from '../../features/shared/app-dialog'
import { useContextStore } from '../../stores/context'
import {
  beginArchive, beginPurge, completeArchive, confirmDownload, exportEntity, listArchives,
  preflightYear, purgeStatus, purgeStep, reportMedia, setYearReadOnly, signMediaPage,
  type ArchiveRow, type ArchiveStep, type Preflight,
} from '../../features/archive/api'
import { buildArchive, ArchiveIncomplete, type BuildProgress } from '../../features/archive/builder'
import { createMemorySink, createZipWriter, type ChunkSink } from '../../features/archive/zip-sink'
import { archiveFileName, formatBytes } from '../../features/archive/format'

const context = useContextStore()
const selectedYear = ref<string>('')
const preflight = ref<Preflight | null>(null)
const archives = ref<ArchiveRow[]>([])
const busy = ref('')
const status = ref<InlineStatusState>('idle')
const statusMessage = ref('')
const progress = ref<BuildProgress | null>(null)
const purgeSteps = ref<ArchiveStep[]>([])

const years = computed(() => context.schoolYears ?? [])
const countRows = computed(() => Object.entries(preflight.value?.counts ?? {}))

const BLOCKER_TEXT: Record<string, string> = {
  pending_media: 'ảnh đã tải lên nhưng chưa gắn vào bài nào. Hãy dọn ở mục Dung lượng trước, vì chúng không thuộc dữ liệu năm học.',
  deleting_media: 'ảnh đang chờ xoá. Hãy đợi tiến trình nền chạy xong rồi đóng gói lại.',
  media_without_key: 'ảnh không còn đường dẫn trong kho. Không đóng gói được đầy đủ.',
  open_correction: 'yêu cầu chỉnh sửa chưa kết thúc. Hãy đóng lại trước khi chốt năm học.',
  notice_pending_review: 'bài đang chờ duyệt trùng. Hãy xử lý trước khi đóng gói.',
}

function report(error: unknown, fallback: string) {
  status.value = 'error'
  statusMessage.value = error instanceof Error && error.message ? error.message : fallback
}

async function load() {
  busy.value = 'load'
  try {
    archives.value = (await listArchives()).archives
    if (!selectedYear.value && years.value.length) selectedYear.value = String(years.value[0].id)
    if (selectedYear.value) preflight.value = await preflightYear(selectedYear.value)
  } catch (error) { report(error, 'Không đọc được kho lưu trữ.') } finally { busy.value = '' }
}

async function refreshPreflight() {
  if (!selectedYear.value) return
  busy.value = 'preflight'
  try { preflight.value = await preflightYear(selectedYear.value) }
  catch (error) { report(error, 'Không kiểm tra được năm học.') } finally { busy.value = '' }
}

/**
 * Where the ZIP is written. With the File System Access API the bytes go
 * straight to the file the Admin chose, so a year of images never has to fit in
 * a tab's memory; without it they are collected and handed over as a download,
 * which is the best the platform allows.
 */
async function openSink(fileName: string): Promise<{ sink: ChunkSink; deliver: () => Promise<void> }> {
  const picker = (window as unknown as { showSaveFilePicker?: (options: unknown) => Promise<FileSystemFileHandle> }).showSaveFilePicker
  if (picker) {
    const handle = await picker({ suggestedName: fileName, types: [{ description: 'Bản lưu năm học', accept: { 'application/zip': ['.zip'] } }] })
    const writable = await (handle as unknown as { createWritable(): Promise<{ write(chunk: Uint8Array): Promise<void>; close(): Promise<void> }> }).createWritable()
    return { sink: { write: chunk => writable.write(chunk), close: () => writable.close() }, deliver: async () => {} }
  }
  const memory = createMemorySink()
  return {
    sink: memory.sink,
    deliver: async () => {
      const url = URL.createObjectURL(new Blob([memory.concat() as unknown as BlobPart], { type: 'application/zip' }))
      const anchor = document.createElement('a')
      anchor.href = url; anchor.download = fileName; anchor.click()
      URL.revokeObjectURL(url)
    },
  }
}

async function runArchive() {
  if (!preflight.value || preflight.value.blockers.length) return
  const ok = await appDialog.confirm({
    title: 'Đóng gói năm học ' + preflight.value.school_year_name,
    body: 'Trình duyệt sẽ tải toàn bộ dữ liệu và ảnh của năm học rồi ghi thành một tệp ZIP trên máy bạn. Hãy giữ tab này mở cho tới khi xong. Tệp chứa dữ liệu học sinh và nhật ký — đừng chia sẻ công khai.',
    confirmLabel: 'Bắt đầu đóng gói',
  })
  if (!ok) return
  busy.value = 'archive'; status.value = 'saving'; statusMessage.value = 'Đang chuẩn bị…'; progress.value = null
  try {
    const { sink, deliver } = await openSink(archiveFileName(preflight.value.school_year_name))
    const result = await buildArchive({
      beginArchive, exportEntity, signMediaPage, reportMedia, completeArchive,
      fetchBytes: async (url: string) => {
        const response = await fetch(url)
        if (!response.ok) throw new Error('MEDIA_FETCH_FAILED')
        return new Uint8Array(await response.arrayBuffer())
      },
      appVersion: '8.8.0',
      actorName: 'Admin',
      now: () => new Date().toISOString(),
    }, createZipWriter(sink), selectedYear.value, value => { progress.value = value })
    await deliver()
    status.value = result.archive.status === 'verified' ? 'success' : 'error'
    statusMessage.value = result.archive.status === 'verified'
      ? `Đã đóng gói ${formatBytes(result.sizeBytes)} và kiểm tra đạt. Hãy lưu tệp ở nơi an toàn, rồi mở lại tệp đó ở bước tiếp theo.`
      : `Bản lưu chưa đạt: ${result.archive.failure_reason ?? 'không rõ'}. Hãy đóng gói lại.`
  } catch (error) {
    if (error instanceof ArchiveIncomplete) report(error, 'Bản lưu thiếu ảnh.')
    else report(error, 'Không hoàn tất được việc đóng gói.')
  } finally { busy.value = ''; progress.value = null; await load() }
}

/**
 * The purge gate. The Admin re-opens the file they saved; the viewer recomputes
 * its fingerprint and that value — not a promise — is what the server matches.
 */
async function onViewerOpened(payload: { fingerprint: string; archiveId: string; verified: boolean }) {
  const target = archives.value.find(row => row.id === payload.archiveId)
  if (!target || target.status !== 'verified' || target.download_confirmed_at) return
  if (!payload.verified) {
    status.value = 'error'
    statusMessage.value = 'Tệp vừa mở không khớp checksum nên chưa dùng làm xác nhận được.'
    return
  }
  try {
    await confirmDownload(payload.archiveId, payload.fingerprint)
    status.value = 'success'
    statusMessage.value = 'Đã xác nhận tệp bản lưu có trên máy và đọc được. Giờ mới mở được bước xoá dữ liệu cloud.'
    await load()
  } catch (error) { report(error, 'Không xác nhận được tệp bản lưu.') }
}

async function lockYear(row: ArchiveRow) {
  const ok = await appDialog.confirm({
    title: 'Khoá năm học ' + row.school_year_name,
    body: 'Sau khi khoá, năm học này chỉ còn xem được: không đăng bài, không thả tim, không báo lỗi, không thêm ảnh. Ảnh và bài cũ vẫn xem bình thường.',
    confirmLabel: 'Khoá chỉ xem',
  })
  if (!ok) return
  busy.value = `lock:${row.id}`
  try { await setYearReadOnly(row.id); status.value = 'success'; statusMessage.value = 'Đã chuyển năm học sang chế độ chỉ xem.'; await load() }
  catch (error) { report(error, 'Không khoá được năm học.') } finally { busy.value = '' }
}

async function purge(row: ArchiveRow) {
  const reason = await appDialog.prompt({
    title: 'Xoá dữ liệu năm học trên cloud',
    body: 'Thao tác này KHÔNG hoàn tác được. Dữ liệu chi tiết và ảnh của năm học sẽ bị xoá khỏi Supabase và Cloudflare R2; chỉ còn lại thông tin tóm tắt của bản lưu. Sau đó cách duy nhất để xem lại là tệp ZIP bạn đang giữ — nên giữ ít nhất hai bản ở hai nơi khác nhau trước khi tiếp tục.',
    label: 'Lý do xoá (bắt buộc)',
    placeholder: 'ví dụ: kết thúc năm học 2026-2027, đã lưu 2 bản',
    required: true,
    danger: true,
    confirmLabel: 'Tôi hiểu, xoá dữ liệu cloud',
    validate: (value: string) => (value.trim().length >= 5 ? '' : 'Hãy nêu lý do rõ ràng.'),
  })
  if (reason === null) return
  busy.value = `purge:${row.id}`; status.value = 'saving'; statusMessage.value = 'Đang xoá…'
  try {
    await beginPurge(row.id, reason.trim())
    for (let guard = 0; guard < 200; guard += 1) {
      const step = await purgeStep(row.id)
      purgeSteps.value = step.steps ?? purgeSteps.value
      statusMessage.value = step.done ? 'Đang hoàn tất…' : `Đã xong bước ${step.step} (${step.rows_removed} bản ghi), còn ${step.remaining}.`
      if (step.done) break
    }
    const final = await purgeStatus(row.id)
    purgeSteps.value = final.steps
    status.value = 'success'
    statusMessage.value = final.status === 'purged'
      ? 'Đã xoá xong dữ liệu năm học. Ảnh trong kho được xếp hàng xoá và sẽ biến mất khi tiến trình nền chạy xong.'
      : 'Chưa xoá xong. Bấm lại để tiếp tục từ bước đang dở.'
    await load()
  } catch (error) { report(error, 'Không xoá được dữ liệu năm học.') } finally { busy.value = '' }
}

async function resumePurge(row: ArchiveRow) {
  busy.value = `purge:${row.id}`; status.value = 'saving'; statusMessage.value = 'Đang tiếp tục…'
  try {
    for (let guard = 0; guard < 200; guard += 1) {
      const step = await purgeStep(row.id)
      purgeSteps.value = step.steps ?? purgeSteps.value
      if (step.done) break
    }
    status.value = 'success'; statusMessage.value = 'Đã tiếp tục và hoàn tất việc xoá.'
    await load()
  } catch (error) { report(error, 'Không tiếp tục được việc xoá.') } finally { busy.value = '' }
}

const statusLabels: Record<string, string> = {
  building: 'Đang đóng gói', verified: 'Đã kiểm tra đạt', failed: 'Không đạt',
  purging: 'Đang xoá cloud', purged: 'Đã xoá cloud',
}

onMounted(load)
</script>

<template>
  <div class="archive">
    <AppCard padding="md" class="bar">
      <div>
        <span class="kicker"><Archive aria-hidden="true" />KHO LƯU TRỮ CUỐI NĂM</span>
        <p>Đóng gói toàn bộ dữ liệu một năm học thành tệp trên máy, kiểm tra tính toàn vẹn, rồi mới giải phóng dung lượng cloud.</p>
      </div>
      <div class="bar-actions">
        <select v-model="selectedYear" @change="refreshPreflight">
          <option v-for="year in years" :key="year.id" :value="year.id">{{ year.name }}</option>
        </select>
        <AppButton variant="secondary" :loading="busy === 'preflight'" @click="refreshPreflight">Kiểm tra lại</AppButton>
      </div>
    </AppCard>

    <InlineStatus :state="status" :message="statusMessage" />

    <AppCard padding="md" class="alert warn">
      <ShieldAlert aria-hidden="true" />
      <div>
        <b>Bản lưu là dữ liệu nhạy cảm</b>
        <p>
          Tệp ZIP chứa thông tin học sinh và nhật ký hệ thống. Đừng chia sẻ công khai, hãy lưu ở nơi được phép, và
          <b>nên giữ ít nhất hai bản ở hai nơi khác nhau</b> — hệ thống không kiểm tra được bản sao thứ hai, đó là
          trách nhiệm của bạn. Sau khi xoá cloud, mất tệp là mất dữ liệu chi tiết.
        </p>
      </div>
    </AppCard>

    <AppCard v-if="preflight" padding="lg" class="preflight">
      <header>
        <div>
          <h2>{{ preflight.school_year_name }}</h2>
          <p>
            {{ preflight.is_active ? 'Đang là năm học hiện hành — có thể đóng gói, nhưng chưa xoá được dữ liệu cloud.' : 'Năm học đã kết thúc.' }}
            <template v-if="preflight.archive_state === 'archived_read_only'"> · Đã khoá chỉ xem.</template>
          </p>
        </div>
        <AppButton :loading="busy === 'archive'" :disabled="!!preflight.blockers.length" @click="runArchive">
          <FileDown aria-hidden="true" />Đóng gói và tải về
        </AppButton>
      </header>

      <div v-if="progress" class="progress">
        <b>{{ progress.phase === 'data' ? 'Đang xuất dữ liệu' : progress.phase === 'media' ? 'Đang tải ảnh' : 'Đang chốt gói' }}</b>
        <span>{{ progress.label }} — {{ progress.done }}/{{ progress.total }}</span>
        <div class="meter"><span :style="{ width: `${Math.min(100, (progress.done / Math.max(1, progress.total)) * 100)}%` }" /></div>
      </div>

      <AppCard v-if="preflight.blockers.length" padding="md" class="alert danger">
        <CircleAlert aria-hidden="true" />
        <div>
          <b>Chưa đóng gói được</b>
          <ul>
            <li v-for="blocker in preflight.blockers" :key="blocker.code">
              {{ blocker.detail }} {{ BLOCKER_TEXT[blocker.code] ?? blocker.code }}
            </li>
          </ul>
        </div>
      </AppCard>

      <dl>
        <div v-for="[key, value] in countRows" :key="key"><dt>{{ key }}</dt><dd>{{ value }}</dd></div>
        <div class="wide"><dt>Dung lượng ảnh</dt><dd>{{ formatBytes(preflight.media_bytes) }}</dd></div>
      </dl>
    </AppCard>

    <AppCard padding="lg" class="runs">
      <h2>Các bản lưu đã tạo</h2>
      <p class="muted">Thông tin này ở lại máy chủ kể cả sau khi xoá dữ liệu cloud, nhưng nó chỉ là tóm tắt — không chứa nội dung đã xoá.</p>
      <ul v-if="archives.length" class="rows">
        <li v-for="row in archives" :key="row.id">
          <div class="run-head">
            <b>{{ row.school_year_name }}</b>
            <span class="tag" :data-status="row.status">{{ statusLabels[row.status] ?? row.status }}</span>
            <em>{{ new Date(row.created_at).toLocaleString('vi-VN') }}</em>
          </div>
          <p class="run-meta">
            {{ row.media_count }} ảnh · {{ formatBytes(row.media_bytes) }} ·
            gói {{ formatBytes(row.archive_size_bytes) }} · định dạng {{ row.archive_format_version }}
            <template v-if="row.checksum"> · vân tay <code>{{ row.checksum.slice(0, 12) }}…</code></template>
            <template v-if="row.failure_reason"> · lý do không đạt: {{ row.failure_reason }}</template>
            <template v-if="row.purged_at"> · đã xoá cloud {{ new Date(row.purged_at).toLocaleString('vi-VN') }} ({{ row.purge_reason }})</template>
          </p>
          <ol class="gate">
            <li :data-done="row.status !== 'building' && row.status !== 'failed'"><CheckCheck aria-hidden="true" />Đóng gói và kiểm tra đạt</li>
            <li :data-done="!!row.download_confirmed_at"><CheckCheck aria-hidden="true" />Mở lại tệp đã lưu để xác nhận</li>
            <li :data-done="row.status === 'purged'"><CheckCheck aria-hidden="true" />Xoá dữ liệu cloud</li>
          </ol>
          <div class="run-actions">
            <AppButton v-if="row.status === 'verified'" variant="secondary" :loading="busy === `lock:${row.id}`" @click="lockYear(row)">
              <Lock aria-hidden="true" />Khoá năm học (chỉ xem)
            </AppButton>
            <AppButton v-if="row.status === 'verified' && row.download_confirmed_at" :loading="busy === `purge:${row.id}`" @click="purge(row)">
              <Trash2 aria-hidden="true" />Xoá dữ liệu cloud
            </AppButton>
            <AppButton v-else-if="row.status === 'purging'" :loading="busy === `purge:${row.id}`" @click="resumePurge(row)">
              <Trash2 aria-hidden="true" />Tiếp tục xoá
            </AppButton>
            <p v-else-if="row.status === 'verified'" class="hint">
              <TriangleAlert aria-hidden="true" />Hãy mở lại tệp ZIP đã lưu ở phần dưới. Chỉ khi tệp mở được và khớp vân tay thì nút xoá mới hiện ra.
            </p>
          </div>
        </li>
      </ul>
      <p v-else class="muted">Chưa có bản lưu nào.</p>
    </AppCard>

    <ArchiveViewer @opened="onViewerOpened" />
  </div>
</template>

<style scoped>
.archive{display:grid;gap:14px}
.bar{display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap}
.bar p{margin:4px 0 0;color:var(--text-muted);max-width:60ch}
.bar-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.bar-actions select{padding:9px 13px;border-radius:999px;border:1px solid var(--border);background:var(--surface-soft);font-weight:850}
.kicker{display:flex;align-items:center;gap:7px;color:var(--color-primary);font-size:var(--font-size-ui-min);font-weight:900;letter-spacing:.04em}
.kicker svg,.alert>svg{width:18px}
.alert{display:flex;align-items:flex-start;gap:11px}
.alert>svg{flex:none;margin-top:2px}
.alert p,.alert ul{margin:4px 0 0;color:var(--text-muted);line-height:1.55}
.alert ul{padding-left:18px}
.alert.warn{border-color:color-mix(in srgb,var(--color-warning) 34%,var(--border));background:color-mix(in srgb,var(--color-warning) 8%,var(--surface))}
.alert.warn>svg{color:var(--color-warning)}
.alert.danger{border-color:color-mix(in srgb,var(--color-danger) 34%,var(--border));background:color-mix(in srgb,var(--color-danger) 7%,var(--surface))}
.alert.danger>svg{color:var(--color-danger)}
.preflight{display:grid;gap:12px}
.preflight header{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;flex-wrap:wrap}
.preflight h2,.runs h2{margin:0 0 4px}
.preflight header p{margin:0;color:var(--text-muted)}
.progress{display:grid;gap:5px}
.progress span{color:var(--text-muted);font-size:var(--font-size-ui-min)}
.meter{height:8px;border-radius:999px;background:var(--surface-soft);overflow:hidden}
.meter span{display:block;height:100%;border-radius:999px;background:var(--color-primary)}
dl{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:7px;margin:0}
dl>div{display:grid;gap:2px;padding:8px 10px;border-radius:12px;background:var(--surface-soft)}
dt{color:var(--text-muted);font-size:var(--font-size-ui-min);font-weight:800}
dd{margin:0;font-weight:850}
.runs p.muted{margin:0;color:var(--text-muted)}
.rows{list-style:none;display:grid;gap:10px;margin:14px 0 0;padding:0}
.rows>li{display:grid;gap:8px;padding:13px;border:1px solid var(--border);border-radius:16px;background:var(--surface-soft)}
.run-head{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.run-head em{font-style:normal;color:var(--text-muted);font-size:var(--font-size-ui-min)}
.tag{padding:3px 10px;border-radius:999px;font-size:var(--font-size-ui-min);font-weight:850;background:var(--surface);color:var(--text-muted)}
.tag[data-status="verified"]{color:var(--color-success)}
.tag[data-status="failed"]{color:var(--color-danger)}
.tag[data-status="purging"]{color:var(--color-warning)}
.run-meta{margin:0;color:var(--text-muted);font-size:var(--font-size-ui-min);line-height:1.6}
.gate{list-style:none;display:flex;gap:14px;flex-wrap:wrap;margin:0;padding:0}
.gate li{display:flex;align-items:center;gap:6px;color:var(--text-muted);font-weight:800;font-size:var(--font-size-ui-min)}
.gate li svg{width:15px;opacity:.35}
.gate li[data-done="true"]{color:var(--color-success)}
.gate li[data-done="true"] svg{opacity:1}
.run-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.hint{display:flex;align-items:center;gap:7px;margin:0;color:var(--text-muted);font-size:var(--font-size-ui-min)}
.hint svg{width:15px;color:var(--color-warning)}
code{font-size:.85em}
@media(max-width:900px){.bar{align-items:stretch;flex-direction:column}}
</style>
