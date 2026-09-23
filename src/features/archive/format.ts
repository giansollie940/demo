export { formatBytes } from '../shared/format'

/**
 * FEAT-007 archive format.
 *
 * Everything in this file is deliberately free of browser APIs beyond WebCrypto
 * so the format rules can be tested directly rather than through a component.
 * The archive is the only copy of a purged school year, so the rules that decide
 * whether a file is readable are the rules that decide whether the data still
 * exists.
 */

/**
 * Bumped major when a reader that does not know about the change would
 * misinterpret the archive; minor when older data is still read correctly.
 * DEC-069/RB-718: a viewer must refuse what it cannot read, never guess.
 */
export const ARCHIVE_FORMAT_VERSION = '1.0'

export const MANIFEST_FILE = 'manifest.json'
export const CHECKSUMS_FILE = 'checksums.txt'
export const MEDIA_PREFIX = 'media/'

/** entity name in the RPC → file in the ZIP. */
export const ENTITY_FILES: Record<string, string> = {
  classes: 'classes.json',
  students: 'students.json',
  subjects: 'subjects.json',
  class_subjects: 'class_subjects.json',
  english_groups: 'english_groups.json',
  english_group_memberships: 'english_group_memberships.json',
  homework_notices: 'homework_notices.json',
  homework_reactions: 'homework_reactions.json',
  homework_reminders: 'homework_reminders.json',
  homework_reports: 'homework_reports.json',
  homework_corrections: 'homework_corrections.json',
  homework_revisions: 'homework_revisions.json',
  homework_duplicate_reviews: 'homework_duplicate_reviews.json',
  homework_tombstones: 'homework_tombstones.json',
  audit: 'audit.json',
  moderation: 'moderation.json',
  media_index: 'archive_index.json',
}

export const ENTITIES = Object.keys(ENTITY_FILES)

export interface ArchiveManifest {
  archive_format_version: string
  app_version: string
  archive_id: string
  school_year_id: string
  school_year_name: string
  created_at: string
  created_by: string
  created_by_name: string
  checksum_algorithm: 'sha-256'
  record_counts: Record<string, number>
  media_count: number
  media_bytes: number
  files: string[]
  schema: { migration: string; entities: Record<string, string> }
}

export function parseVersion(value: string): { major: number; minor: number } | null {
  const match = /^(\d+)\.(\d+)$/.exec(String(value ?? '').trim())
  return match ? { major: Number(match[1]), minor: Number(match[2]) } : null
}

/**
 * AC-719/EC-708. A newer major version may have changed what a field means, and
 * a newer minor version may contain records this build would silently drop, so
 * both are refused with a reason rather than partially rendered.
 */
export function versionSupport(value: string): { ok: boolean; reason?: string } {
  const found = parseVersion(value)
  const mine = parseVersion(ARCHIVE_FORMAT_VERSION)!
  if (!found) return { ok: false, reason: 'Bản lưu không ghi rõ phiên bản định dạng.' }
  if (found.major !== mine.major)
    return { ok: false, reason: `Bản lưu dùng định dạng ${value}, phiên bản app này chỉ đọc ${mine.major}.x. Hãy mở bằng phiên bản app tương ứng.` }
  if (found.minor > mine.minor)
    return { ok: false, reason: `Bản lưu dùng định dạng ${value}, mới hơn ${ARCHIVE_FORMAT_VERSION} mà phiên bản app này đọc được.` }
  return { ok: true }
}

const ALLOWED_NAME = /^[A-Za-z0-9._-]+$/

/**
 * EC-709. A ZIP is an untrusted list of names chosen by whoever produced the
 * file. Nothing here is written to disk, but a name like `../index.html` or a
 * name that differs from what the manifest lists still lets a tampered archive
 * pass one file off as another, so the reader accepts only the shapes it writes:
 * a known top-level file, or `media/<name>`.
 */
export function safeArchivePath(path: string): boolean {
  if (typeof path !== 'string' || path.length === 0 || path.length > 200) return false
  if (path.includes('\\') || path.includes('\0') || path.startsWith('/')) return false
  if (/^[A-Za-z]:/.test(path)) return false
  const parts = path.split('/')
  if (parts.some(part => part === '' || part === '.' || part === '..')) return false
  if (parts.length === 1) return ALLOWED_NAME.test(parts[0])
  if (parts.length === 2 && parts[0] === 'media') return ALLOWED_NAME.test(parts[1])
  return false
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const view = new Uint8Array(bytes.byteLength)
  view.set(bytes)
  const digest = await crypto.subtle.digest('SHA-256', view.buffer)
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

const encoder = new TextEncoder()
export const encodeText = (text: string): Uint8Array => encoder.encode(text)
export const decodeText = (bytes: Uint8Array): string => new TextDecoder().decode(bytes)

/**
 * `<sha256>  <path>`, two spaces, sorted by path — the same shape `sha256sum`
 * writes, so an Admin can verify the archive with a command line tool and does
 * not have to trust this application to check its own work.
 */
export function buildChecksumsFile(entries: Array<{ path: string; checksum: string }>): string {
  return [...entries]
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
    .map(entry => `${entry.checksum}  ${entry.path}`)
    .join('\n') + '\n'
}

export function parseChecksumsFile(text: string): Array<{ path: string; checksum: string }> {
  return text.split('\n')
    .map(line => /^([a-f0-9]{64})\s\s(.+)$/.exec(line.trimEnd()))
    .filter((match): match is RegExpExecArray => match !== null)
    .map(match => ({ checksum: match[1], path: match[2] }))
}

export function archiveFileName(schoolYearName: string): string {
  const safe = String(schoolYearName ?? 'nam-hoc').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'nam-hoc'
  return `TU-HOC-${safe}.zip`
}

