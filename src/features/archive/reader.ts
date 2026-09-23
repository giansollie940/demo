import { unzip, unzipSync } from 'fflate'
import {
  CHECKSUMS_FILE, ENTITY_FILES, MANIFEST_FILE, MEDIA_PREFIX,
  decodeText, parseChecksumsFile, safeArchivePath, sha256Hex, versionSupport, type ArchiveManifest,
} from './format'

/**
 * Reads an archive the Admin picked off their own disk.
 *
 * Two things shape this file. First, the ZIP is untrusted input: it may have
 * been edited, truncated, renamed or built by something else entirely, so every
 * name is checked before it is used and every byte is checked against
 * checksums.txt before the contents are shown as data. Second, a year's images
 * do not fit comfortably in memory, so nothing inflates the whole archive at
 * once: the small JSON members are read up front and images are handled one at a
 * time, then released (EC-710/AC-727/AC-728).
 *
 * `verified` covers **every** member, images included. An earlier version
 * verified only the text members and left images to be checked when they were
 * displayed, which meant a saved ZIP missing an image still reported itself as
 * verified — and that result is what unlocks an irreversible purge. Lazy display
 * is still lazy; the verdict is not.
 */

export class ArchiveRejected extends Error {
  constructor(message: string, readonly code: string) { super(message); this.name = 'ArchiveRejected' }
}

export interface ArchiveCheck {
  path: string
  ok: boolean
  reason?: 'missing' | 'mismatch'
}

export interface OpenedArchive {
  manifest: ArchiveManifest
  /** SHA-256 of checksums.txt: the value `confirm_download` is matched against. */
  fingerprint: string
  data: Record<string, unknown[]>
  mediaPaths: string[]
  /** One entry per member listed in checksums.txt, images included. */
  checks: ArchiveCheck[]
  /** True only when every member — text and image — matched its checksum. */
  verified: boolean
  /** Inflates and verifies one image, returning an object URL and its revoker. */
  openMedia(path: string): Promise<{ url: string; revoke: () => void }>
}

export interface OpenOptions {
  makeObjectUrl?: (blob: Blob) => string
  revokeObjectUrl?: (url: string) => void
  /** Progress while images are checked; a year's worth takes a visible moment. */
  onProgress?: (progress: { done: number; total: number; path: string }) => void
  /** Test seam for asserting that images are never inflated concurrently. */
  inflateMember?: (bytes: Uint8Array, path: string) => Promise<Uint8Array>
}

const JSON_MEMBERS = new Set([MANIFEST_FILE, CHECKSUMS_FILE, ...Object.values(ENTITY_FILES)])

function inflateOne(bytes: Uint8Array, path: string): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    unzip(bytes, { filter: file => file.name === path }, (error, files) => {
      if (error) return reject(new ArchiveRejected('Không giải nén được tệp trong bản lưu.', 'unreadable'))
      const found = files[path]
      if (!found) return reject(new ArchiveRejected('Không tìm thấy tệp trong bản lưu.', 'missing_member'))
      resolve(found)
    })
  })
}

export async function openArchive(bytes: Uint8Array, options: OpenOptions = {}): Promise<OpenedArchive> {
  const makeObjectUrl = options.makeObjectUrl ?? ((blob: Blob) => URL.createObjectURL(blob))
  const revokeObjectUrl = options.revokeObjectUrl ?? ((url: string) => URL.revokeObjectURL(url))
  const inflateMember = options.inflateMember ?? inflateOne
  const onProgress = options.onProgress ?? (() => {})

  let small: Record<string, Uint8Array>
  try {
    // Only the text members are inflated here. Media stay compressed in `bytes`
    // until something asks for one.
    small = unzipSync(bytes, { filter: file => JSON_MEMBERS.has(file.name) })
  } catch {
    throw new ArchiveRejected('Tệp này không phải là bản lưu đọc được (ZIP hỏng hoặc sai định dạng).', 'unreadable')
  }

  const manifestBytes = small[MANIFEST_FILE]
  if (!manifestBytes) throw new ArchiveRejected('Bản lưu thiếu manifest.json nên không xác định được nội dung.', 'no_manifest')
  let manifest: ArchiveManifest
  try { manifest = JSON.parse(decodeText(manifestBytes)) } catch {
    throw new ArchiveRejected('manifest.json trong bản lưu không đọc được.', 'bad_manifest')
  }

  // AC-719/EC-708 before anything is interpreted: a reader that guesses at an
  // unknown schema is worse than one that refuses.
  const support = versionSupport(manifest.archive_format_version)
  if (!support.ok) throw new ArchiveRejected(support.reason!, 'unsupported_version')

  const checksumBytes = small[CHECKSUMS_FILE]
  if (!checksumBytes) throw new ArchiveRejected('Bản lưu thiếu checksums.txt nên không kiểm tra được tính toàn vẹn.', 'no_checksums')
  const fingerprint = await sha256Hex(checksumBytes)
  const expected = parseChecksumsFile(decodeText(checksumBytes))
  if (!expected.length) throw new ArchiveRejected('checksums.txt trong bản lưu rỗng hoặc sai định dạng.', 'bad_checksums')

  // EC-709. Refuse the whole archive rather than skipping the odd name: a file
  // list that contains `../something` is evidence the archive was tampered with,
  // and the rest of it cannot be trusted either.
  for (const entry of expected)
    if (!safeArchivePath(entry.path))
      throw new ArchiveRejected(`Bản lưu chứa đường dẫn không hợp lệ: ${entry.path}`, 'unsafe_path')

  // AC-715/AC-720. Every member is checked, text first because it is already
  // inflated, then the images one at a time so peak memory stays at one picture.
  const checks: ArchiveCheck[] = []
  const mediaExpected = new Map<string, string>()
  for (const entry of expected) {
    if (entry.path.startsWith(MEDIA_PREFIX)) { mediaExpected.set(entry.path, entry.checksum); continue }
    const member = small[entry.path]
    if (!member) { checks.push({ path: entry.path, ok: false, reason: 'missing' }); continue }
    const actual = await sha256Hex(member)
    checks.push({ path: entry.path, ok: actual === entry.checksum, reason: actual === entry.checksum ? undefined : 'mismatch' })
  }

  const mediaTotal = mediaExpected.size
  let mediaDone = 0
  for (const [path, want] of mediaExpected) {
    onProgress({ done: ++mediaDone, total: mediaTotal, path })
    let member: Uint8Array | null = null
    try { member = await inflateMember(bytes, path) } catch { member = null }
    if (!member) { checks.push({ path, ok: false, reason: 'missing' }); continue }
    const actual = await sha256Hex(member)
    checks.push({ path, ok: actual === want, reason: actual === want ? undefined : 'mismatch' })
    // Nothing keeps a reference: the next iteration is free to reuse the memory.
    member = null
  }

  const data: Record<string, unknown[]> = {}
  for (const [entity, file] of Object.entries(ENTITY_FILES)) {
    const member = small[file]
    if (!member) { data[entity] = []; continue }
    try {
      const parsed = JSON.parse(decodeText(member))
      data[entity] = Array.isArray(parsed) ? parsed : []
    } catch { checks.push({ path: file, ok: false, reason: 'mismatch' }); data[entity] = [] }
  }

  const verified = checks.every(check => check.ok)

  return {
    manifest,
    fingerprint,
    data,
    mediaPaths: [...mediaExpected.keys()].sort(),
    checks,
    verified,
    async openMedia(path: string) {
      if (!safeArchivePath(path) || !path.startsWith(MEDIA_PREFIX))
        throw new ArchiveRejected('Đường dẫn ảnh không hợp lệ.', 'unsafe_path')
      const want = mediaExpected.get(path)
      if (!want) throw new ArchiveRejected('Ảnh này không nằm trong danh sách checksum của bản lưu.', 'missing')
      const member = await inflateMember(bytes, path)
      if (await sha256Hex(member) !== want)
        throw new ArchiveRejected('Ảnh trong bản lưu không khớp checksum.', 'mismatch')
      const url = makeObjectUrl(new Blob([member as unknown as BlobPart], { type: 'image/webp' }))
      // AC-728: the caller gets the revoker with the URL, so releasing it is not
      // something a component has to remember to arrange separately.
      return { url, revoke: () => revokeObjectUrl(url) }
    },
  }
}
