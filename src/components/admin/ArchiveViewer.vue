<script setup lang="ts">
// FEAT-007 — Archive Viewer.
//
// Opens a ZIP the Admin picked off their own disk and shows it. Three rules
// shape everything here:
//  1. Nothing leaves the machine. The file is read in the browser; no upload,
//     no server call, no request to R2 (RB-715/AC-714). Images come out of the
//     ZIP, which is what makes the archive still readable after the bucket has
//     been emptied (AC-716).
//  2. Nothing can be changed. There is no action on this screen that writes
//     anywhere — not a heart, not a report, not a correction (RB-716/AC-718).
//  3. The file is treated as untrusted until checksums say otherwise. An
//     archive that fails verification is still shown, but labelled, because an
//     Admin looking at a damaged archive needs to see what survived.
import { computed, onBeforeUnmount, ref } from 'vue'
import { AlertTriangle, Download, FileSearch, FolderOpen, ImageOff, ShieldCheck } from 'lucide-vue-next'
import AppButton from '../ui/AppButton.vue'
import AppCard from '../ui/AppCard.vue'
import InlineStatus, { type InlineStatusState } from '../ui/InlineStatus.vue'
import { openArchive, type OpenedArchive } from '../../features/archive/reader'
import { formatBytes } from '../../features/archive/format'

const emit = defineEmits<{ (e: 'opened', payload: { fingerprint: string; archiveId: string; verified: boolean }): void }>()

const archive = ref<OpenedArchive | null>(null)
const status = ref<InlineStatusState>('idle')
const statusMessage = ref('')
const busy = ref(false)
const query = ref('')
const section = ref<'notices' | 'media' | 'audit' | 'files'>('notices')
const preview = ref<{ path: string; url: string; revoke: () => void } | null>(null)

function releasePreview() { preview.value?.revoke(); preview.value = null }
onBeforeUnmount(releasePreview)

async function pick(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  busy.value = true; status.value = 'saving'; statusMessage.value = 'Đang đọc và kiểm tra bản lưu…'
  releasePreview()
  try {
    const bytes = new Uint8Array(await file.arrayBuffer())
    const opened = await openArchive(bytes)
    archive.value = opened
    status.value = opened.verified ? 'success' : 'error'
    statusMessage.value = opened.verified
      ? `Đã kiểm tra: ${opened.checks.length} tệp dữ liệu khớp checksum.`
      : `Bản lưu KHÔNG khớp checksum ở ${opened.checks.filter(c => !c.ok).length} tệp. Dữ liệu hiển thị bên dưới có thể đã bị sửa hoặc hỏng.`
    emit('opened', { fingerprint: opened.fingerprint, archiveId: opened.manifest.archive_id, verified: opened.verified })
  } catch (error) {
    archive.value = null
    status.value = 'error'
    statusMessage.value = error instanceof Error ? error.message : 'Không mở được bản lưu.'
  } finally {
    busy.value = false
    ;(event.target as HTMLInputElement).value = ''
  }
}

const notices = computed(() => {
  const rows = (archive.value?.data.homework_notices ?? []) as Array<Record<string, unknown>>
  const needle = query.value.trim().toLowerCase()
  if (!needle) return rows
  return rows.filter(row => JSON.stringify(row).toLowerCase().includes(needle))
})
const audit = computed(() => (archive.value?.data.audit ?? []) as Array<Record<string, unknown>>)
const mediaIndex = computed(() => (archive.value?.data.media_index ?? []) as Array<Record<string, unknown>>)
const failed = computed(() => archive.value?.checks.filter(check => !check.ok) ?? [])

async function show(path: string) {
  releasePreview()
  try {
    const handle = await archive.value!.openMedia(path)
    preview.value = { path, ...handle }
  } catch (error) {
    status.value = 'error'
    statusMessage.value = error instanceof Error ? error.message : 'Không mở được ảnh trong bản lưu.'
  }
}

/** RB-716 allows exporting what is already on screen; it writes nothing back. */
function exportCsv() {
  const rows = notices.value
  if (!rows.length) return
  const columns = [...new Set(rows.flatMap(row => Object.keys(row)))]
  const escape = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`
  const csv = [columns.join(','), ...rows.map(row => columns.map(column => escape(row[column])).join(','))].join('\n')
  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${archive.value?.manifest.school_year_name ?? 'ban-luu'}-bai-tap.csv`
  anchor.click()
  URL.revokeObjectURL(url)
}
</script>

<template>
  <section class="viewer">
    <AppCard padding="md" class="bar">
      <div>
        <span class="kicker"><FolderOpen aria-hidden="true" />MỞ BẢN LƯU</span>
        <p>Chọn tệp ZIP đã tải về. Tệp được đọc ngay trong trình duyệt và không được gửi lên máy chủ.</p>
      </div>
      <label class="picker">
        <input type="file" accept=".zip,application/zip" :disabled="busy" @change="pick" />
        <span class="picker-button"><FileSearch aria-hidden="true" />Chọn tệp bản lưu</span>
      </label>
    </AppCard>

    <InlineStatus :state="status" :message="statusMessage" />

    <template v-if="archive">
      <AppCard padding="md" class="banner" :data-verified="archive.verified">
        <ShieldCheck v-if="archive.verified" aria-hidden="true" />
        <AlertTriangle v-else aria-hidden="true" />
        <div>
          <b>DỮ LIỆU LƯU TRỮ — CHỈ XEM</b>
          <p>
            {{ archive.manifest.school_year_name }} · định dạng {{ archive.manifest.archive_format_version }} ·
            đóng gói {{ new Date(archive.manifest.created_at).toLocaleString('vi-VN') }} ·
            {{ archive.manifest.media_count }} ảnh ({{ formatBytes(archive.manifest.media_bytes) }}).
            Màn hình này không sửa, không xoá và không gửi gì lên máy chủ.
          </p>
        </div>
      </AppCard>

      <AppCard v-if="failed.length" padding="md" class="alert danger">
        <AlertTriangle aria-hidden="true" />
        <div>
          <b>Bản lưu không khớp checksum</b>
          <p>{{ failed.map(f => f.path).join(', ') }} — nội dung bên dưới có thể đã bị sửa hoặc hỏng. Hãy dùng bản sao khác nếu có.</p>
        </div>
      </AppCard>

      <nav class="tabs">
        <button v-for="entry in [['notices','Bài tập'],['media','Ảnh'],['audit','Nhật ký'],['files','Tệp trong gói']]" :key="entry[0]"
          type="button" :class="{ on: section === entry[0] }" @click="section = (entry[0] as typeof section)">{{ entry[1] }}</button>
      </nav>

      <AppCard v-if="section === 'notices'" padding="lg">
        <div class="tools">
          <input v-model="query" type="search" placeholder="Tìm trong bài tập đã lưu…" />
          <AppButton variant="secondary" :disabled="!notices.length" @click="exportCsv"><Download aria-hidden="true" />Xuất CSV</AppButton>
        </div>
        <p class="muted">{{ notices.length }} bài</p>
        <ul class="rows">
          <li v-for="row in notices.slice(0, 200)" :key="String(row.id)">
            <b>{{ row.title }}</b>
            <span>{{ row.content }}</span>
            <em>{{ row.status }} · {{ row.due_at ? new Date(String(row.due_at)).toLocaleString('vi-VN') : '—' }}</em>
          </li>
        </ul>
        <p v-if="notices.length > 200" class="muted">Hiển thị 200 bài đầu; dùng ô tìm kiếm để thu hẹp.</p>
      </AppCard>

      <AppCard v-else-if="section === 'media'" padding="lg">
        <p class="muted">{{ archive.mediaPaths.length }} ảnh trong gói. Ảnh chỉ được giải nén khi bạn mở, và được giải phóng khi mở ảnh khác.</p>
        <div v-if="preview" class="preview">
          <img :src="preview.url" :alt="preview.path" />
          <AppButton variant="secondary" @click="releasePreview"><ImageOff aria-hidden="true" />Đóng ảnh</AppButton>
        </div>
        <ul class="rows">
          <li v-for="item in mediaIndex" :key="String(item.attachment_id)">
            <b>{{ item.archive_path }}</b>
            <span>{{ formatBytes(Number(item.size_bytes)) }}</span>
            <AppButton variant="secondary" @click="show(String(item.archive_path))">Xem ảnh</AppButton>
          </li>
        </ul>
      </AppCard>

      <AppCard v-else-if="section === 'audit'" padding="lg">
        <p class="muted">{{ audit.length }} sự kiện</p>
        <ul class="rows">
          <li v-for="row in audit.slice(0, 300)" :key="String(row.id)">
            <b>{{ row.event_type }}</b>
            <span>{{ row.created_at ? new Date(String(row.created_at)).toLocaleString('vi-VN') : '—' }}</span>
          </li>
        </ul>
      </AppCard>

      <AppCard v-else padding="lg">
        <ul class="rows">
          <li v-for="check in archive.checks" :key="check.path">
            <b>{{ check.path }}</b>
            <em :data-ok="check.ok">{{ check.ok ? 'khớp checksum' : check.reason === 'missing' ? 'thiếu trong gói' : 'sai checksum' }}</em>
          </li>
        </ul>
      </AppCard>
    </template>
  </section>
</template>

<style scoped>
.viewer{display:grid;gap:14px}
.bar{display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap}
.bar p{margin:4px 0 0;color:var(--text-muted)}
.kicker{display:flex;align-items:center;gap:7px;color:var(--color-primary);font-size:var(--font-size-ui-min);font-weight:900;letter-spacing:.04em}
.kicker svg,.banner>svg,.alert>svg{width:18px}
.picker input{position:absolute;width:1px;height:1px;opacity:0;pointer-events:none}
.picker-button{display:inline-flex;align-items:center;gap:8px;padding:9px 15px;border-radius:999px;border:1px solid var(--border);background:var(--surface-soft);font-weight:850;cursor:pointer}
.picker-button svg{width:17px}
.banner{display:flex;align-items:flex-start;gap:11px;border-color:color-mix(in srgb,var(--color-warning) 40%,var(--border));background:color-mix(in srgb,var(--color-warning) 9%,var(--surface))}
.banner[data-verified="true"]{border-color:color-mix(in srgb,var(--color-success) 34%,var(--border));background:color-mix(in srgb,var(--color-success) 7%,var(--surface))}
.banner b{letter-spacing:.06em}
.banner p,.alert p{margin:4px 0 0;color:var(--text-muted);line-height:1.55}
.alert{display:flex;align-items:flex-start;gap:11px}
.alert.danger{border-color:color-mix(in srgb,var(--color-danger) 34%,var(--border));background:color-mix(in srgb,var(--color-danger) 7%,var(--surface))}
.alert.danger>svg{color:var(--color-danger)}
.tabs{display:flex;gap:8px;flex-wrap:wrap}
.tabs button{padding:7px 14px;border-radius:999px;border:1px solid var(--border);background:var(--surface);font-weight:850;cursor:pointer}
.tabs button.on{background:var(--color-primary);color:#fff;border-color:transparent}
.tools{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:10px}
.tools input{flex:1;min-width:200px;padding:9px 13px;border-radius:12px;border:1px solid var(--border);background:var(--surface-soft)}
.rows{list-style:none;display:grid;gap:8px;margin:10px 0 0;padding:0}
.rows li{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:10px 13px;border:1px solid var(--border);border-radius:14px;background:var(--surface-soft)}
.rows li span{color:var(--text-muted);font-size:var(--font-size-ui-min);flex:1}
.rows li em{font-style:normal;font-weight:850;color:var(--text-muted)}
.rows li em[data-ok="false"]{color:var(--color-danger)}
.preview{display:grid;gap:10px;justify-items:start;margin:12px 0}
.preview img{max-width:100%;max-height:420px;border-radius:14px;border:1px solid var(--border)}
.muted{color:var(--text-muted);margin:0}
</style>
