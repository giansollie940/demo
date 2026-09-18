import { legacyApi } from '../../services/legacy-supabase'

/**
 * FEAT-008 client. Capacity is deployment configuration, so every number here
 * can legitimately be null: a provider whose capacity nobody has set yet has no
 * percentage and no level, and must be shown as unconfigured rather than as 0%.
 */
export type StorageLevel = 'unconfigured' | 'unknown' | 'normal' | 'info' | 'warning' | 'critical'

export interface StorageProvider {
  configured_bytes: number | null
  note: string | null
  total_bytes: number | null
  metadata_bytes: number | null
  active_bytes: number | null
  pending_bytes: number | null
  /**
   * Bytes on their way out: the row is queued for purge but the object is still
   * in the bucket until the worker confirms the delete, so these still count as
   * used. Shown separately so Admin can tell "full" from "about to free up".
   */
  deleting_bytes: number | null
  media_count: number | null
  provider_bytes: number | null
  provider_measured_at: string | null
  measured_at: string | null
  /**
   * Which number actually produced `percent`. A provider reading is used only
   * while it is recent, and the app's own accounting is a floor under it, so
   * this can be 'metadata' even when a provider figure exists.
   */
  source: 'provider' | 'metadata' | 'none'
  /** A provider reading exists but is too old to count towards protection. */
  provider_stale: boolean
  percent: number | null
  /** No measurement at all for over 24h — reported, never escalated. */
  stale: boolean
  level: StorageLevel
}

export interface StorageCandidate {
  school_year_id: string
  media_count: number
  media_bytes: number
  notice_count: number
  archived: boolean
}

export interface StorageState {
  providers: { database: StorageProvider; r2: StorageProvider }
  flags: { protection_mode: boolean; r2_upload_locked: boolean }
  measured_at: string | null
  candidates?: StorageCandidate[]
  queued?: number
}

/** SQLSTATE disk_full. The database raises it for every capacity hold. */
export const CAPACITY_HOLD = '53100'

export function isCapacityHold(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === CAPACITY_HOLD
}

export const CAPACITY_HOLD_MESSAGE =
  'Hệ thống đang ở chế độ bảo vệ dung lượng. Bài dạng chữ, chỉnh sửa và báo cáo vẫn hoạt động.'

interface Result { data: unknown; error: { message?: string; code?: string } | null }
interface StorageClient {
  rpc(name: string, args: Record<string, unknown>): Promise<Result>
  functions: { invoke(name: string, args: { body: unknown }): Promise<Result> }
}

async function client() { return (await legacyApi.init()) as StorageClient }

async function call<T>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await (await client()).rpc('homework_storage', { p_action: action, p_data: payload })
  if (error) {
    // Preserve the SQLSTATE so callers can branch on the hold instead of on text.
    throw Object.assign(new Error(error.message || 'Không đọc được dung lượng lưu trữ.'), { code: error.code })
  }
  return data as T
}

export const storageStatus = () => call<StorageState>('status')
export const refreshStorage = () => call<StorageState>('refresh')
export const cleanupPendingMedia = () => call<StorageState>('cleanup_pending')
export const setStorageCapacity = (provider: 'database' | 'r2', configuredBytes: number | null, note?: string) =>
  call<StorageState>('set_capacity', { provider, configured_bytes: configuredBytes === null ? '' : String(configuredBytes), note })

/**
 * Asks the Edge Function to read R2 itself. Only this path can produce an
 * authoritative R2 total; it is allowed to fail, and when it does the caller
 * keeps the database-side state rather than showing nothing.
 */
export async function measureProviders(): Promise<{ state: StorageState; r2: { attempted: boolean; ok?: boolean; partial?: boolean; reason?: string } }> {
  const { data, error } = await (await client()).functions.invoke('storage-health', { body: { action: 'measure' } })
  if (error) throw new Error(error.message || 'Chưa đọc được dung lượng từ kho ảnh.')
  const result = data as { ok?: boolean; state: StorageState; r2: { attempted: boolean; ok?: boolean; partial?: boolean; reason?: string }; error?: string }
  if (!result.ok) throw new Error(result.error || 'Chưa đọc được dung lượng từ kho ảnh.')
  return { state: result.state, r2: result.r2 }
}

export function formatBytes(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let size = Number(value), unit = 0
  while (size >= 1024 && unit < units.length - 1) { size /= 1024; unit += 1 }
  return `${size.toFixed(size >= 100 || unit === 0 ? 0 : 1)} ${units[unit]}`
}

export const levelLabels: Record<StorageLevel, string> = {
  unconfigured: 'Chưa đặt dung lượng',
  unknown: 'Chưa đo được',
  normal: 'Bình thường',
  info: 'Theo dõi',
  warning: 'Cảnh báo',
  critical: 'Nguy cấp',
}

export const levelTones: Record<StorageLevel, 'neutral' | 'info' | 'warning' | 'danger' | 'success'> = {
  unconfigured: 'neutral',
  unknown: 'neutral',
  normal: 'success',
  info: 'info',
  warning: 'warning',
  critical: 'danger',
}
