import { legacyApi } from '../../services/legacy-supabase'

/** FEAT-007 client. Every call here is Admin-only on the database side. */

export type ArchiveStatus = 'building' | 'verified' | 'failed' | 'purging' | 'purged'

export interface ArchiveRow {
  id: string
  school_year_id: string
  school_year_name: string
  archive_format_version: string
  status: ArchiveStatus
  counts: Record<string, number>
  media_count: number
  media_bytes: number
  archive_size_bytes: number | null
  checksum: string | null
  failure_reason: string | null
  created_at: string
  created_by: string | null
  verified_at: string | null
  download_confirmed_at: string | null
  purge_reason: string | null
  purge_started_at: string | null
  purged_at: string | null
  purged_by: string | null
}

export interface ArchiveStep {
  step: string; seq: number; state: 'pending' | 'running' | 'done'
  rows_removed: number; started_at: string | null; finished_at: string | null
}

export interface Preflight {
  school_year_id: string
  school_year_name: string
  is_active: boolean
  archive_state: 'active' | 'archived_read_only'
  counts: Record<string, number>
  media_bytes: number
  blockers: Array<{ code: string; detail: number }>
  archives: ArchiveRow[]
}

export interface SignedMedia {
  attachment_id: string; archive_path: string; size_bytes: number; url: string
}

interface Result { data: unknown; error: { message?: string; code?: string } | null }
interface ArchiveClient {
  rpc(name: string, args: Record<string, unknown>): Promise<Result>
  functions: { invoke(name: string, args: { body: unknown }): Promise<Result> }
}

async function client() { return (await legacyApi.init()) as ArchiveClient }

async function call<T>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await (await client()).rpc('homework_archive', { p_action: action, p_data: payload })
  if (error) throw Object.assign(new Error(error.message || 'Không thao tác được với kho lưu trữ.'), { code: error.code })
  return data as T
}

export const preflightYear = (schoolYearId: string) => call<Preflight>('preflight', { school_year_id: schoolYearId })
export const listArchives = () => call<{ archives: ArchiveRow[] }>('list')
export const beginArchive = (schoolYearId: string, version: string) =>
  call<ArchiveRow>('begin', { school_year_id: schoolYearId, archive_format_version: version })
export const reportMedia = (archiveId: string, items: Array<{ attachment_id: string; checksum: string; bytes: number }>) =>
  call<{ ok: boolean; reported: number; total: number }>('report_media', { archive_id: archiveId, items })
export const completeArchive = (archiveId: string, checksum: string, archiveSizeBytes: number) =>
  call<ArchiveRow>('complete', { archive_id: archiveId, checksum, archive_size_bytes: String(archiveSizeBytes) })
export const confirmDownload = (archiveId: string, checksum: string) =>
  call<ArchiveRow>('confirm_download', { archive_id: archiveId, checksum })
export const setYearReadOnly = (archiveId: string) =>
  call<{ ok: boolean; school_year_id: string }>('set_read_only', { archive_id: archiveId })
export const beginPurge = (archiveId: string, reason: string) =>
  call<ArchiveRow>('purge_begin', { archive_id: archiveId, reason, confirm_irreversible: true })
export const purgeStep = (archiveId: string) =>
  call<{ done: boolean; step?: string; rows_removed?: number; remaining?: number; steps?: ArchiveStep[]; status?: ArchiveStatus }>('purge_step', { archive_id: archiveId })
export const purgeStatus = (archiveId: string) =>
  call<ArchiveRow & { steps: ArchiveStep[]; media_pending: number }>('purge_status', { archive_id: archiveId })

export async function exportEntity(archiveId: string, entity: string, after: string | null, limit = 500)
  : Promise<{ entity: string; rows: Record<string, unknown>[] }> {
  const { data, error } = await (await client()).rpc('homework_archive_export',
    { p_archive: archiveId, p_entity: entity, p_after: after, p_limit: limit })
  if (error) throw Object.assign(new Error(error.message || 'Không đọc được dữ liệu để đóng gói.'), { code: error.code })
  return data as { entity: string; rows: Record<string, unknown>[] }
}

/**
 * One page of image URLs. The URLs expire in minutes and are used immediately;
 * none of them is ever written into the archive (AC-704/AC-729).
 */
export async function signMediaPage(archiveId: string, after: string | null)
  : Promise<{ items: SignedMedia[]; next: string | null }> {
  const { data, error } = await (await client()).functions.invoke('archive-media', { body: { archive_id: archiveId, after } })
  if (error) throw new Error(error.message || 'Chưa lấy được ảnh của năm học.')
  const result = data as { ok?: boolean; items?: SignedMedia[]; next?: string | null; error?: string }
  if (!result.ok) throw new Error(result.error || 'Chưa lấy được ảnh của năm học.')
  return { items: result.items ?? [], next: result.next ?? null }
}
