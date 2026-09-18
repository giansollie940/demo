import {
  ARCHIVE_FORMAT_VERSION, CHECKSUMS_FILE, ENTITIES, ENTITY_FILES, MANIFEST_FILE,
  buildChecksumsFile, encodeText, safeArchivePath, sha256Hex, type ArchiveManifest,
} from './format'
import type { ArchiveRow, SignedMedia } from './api'
import type { ZipWriter } from './zip-sink'

/**
 * Runs one archive from `begin` to a verdict.
 *
 * Every dependency is injected. That is not ceremony: the interesting failures
 * here are "an image did not come back", "the bytes were not the bytes" and "the
 * year moved while we were packing", and those have to be reproducible in a test
 * rather than only in front of an Admin at the end of a school year.
 */
export interface BuilderPorts {
  beginArchive(schoolYearId: string, version: string): Promise<ArchiveRow>
  exportEntity(archiveId: string, entity: string, after: string | null, limit: number): Promise<{ rows: Record<string, unknown>[] }>
  signMediaPage(archiveId: string, after: string | null): Promise<{ items: SignedMedia[]; next: string | null }>
  fetchBytes(url: string): Promise<Uint8Array>
  reportMedia(archiveId: string, items: Array<{ attachment_id: string; checksum: string; bytes: number }>): Promise<unknown>
  completeArchive(archiveId: string, checksum: string, sizeBytes: number): Promise<ArchiveRow>
  appVersion: string
  actorName: string
  now(): string
}

export interface BuildProgress {
  phase: 'data' | 'media' | 'sealing' | 'done'
  label: string
  done: number
  total: number
}

const PAGE = 500

/** The `p_after` cursor each entity pages on, mirroring its ORDER BY in SQL. */
function cursorOf(entity: string, row: Record<string, unknown>): string {
  if (entity === 'homework_reactions') return `${row.notice_id}:${row.user_id}`
  if (entity === 'homework_revisions') return `${row.correction_id}:${row.round}`
  if (entity === 'homework_tombstones') return String(row.notice_id)
  if (entity === 'media_index') return String(row.attachment_id)
  return String(row.id)
}

export class ArchiveIncomplete extends Error {
  constructor(message: string, readonly missing: string[]) { super(message); this.name = 'ArchiveIncomplete' }
}

export async function buildArchive(
  ports: BuilderPorts,
  zip: ZipWriter,
  schoolYearId: string,
  onProgress: (progress: BuildProgress) => void = () => {},
): Promise<{ archive: ArchiveRow; fingerprint: string; sizeBytes: number }> {
  const run = await ports.beginArchive(schoolYearId, ARCHIVE_FORMAT_VERSION)
  const checksums: Array<{ path: string; checksum: string }> = []
  const counts: Record<string, number> = {}

  const put = async (path: string, bytes: Uint8Array) => {
    // The writer refuses to produce a name its own reader would reject; a viewer
    // that must sanitise names is one that can be handed a file it cannot open.
    if (!safeArchivePath(path)) throw new Error(`Tên tệp trong gói không hợp lệ: ${path}`)
    checksums.push({ path, checksum: await sha256Hex(bytes) })
    await zip.add(path, bytes)
  }

  // ── data ───────────────────────────────────────────────────────────────────
  let index = 0
  for (const entity of ENTITIES) {
    index += 1
    onProgress({ phase: 'data', label: ENTITY_FILES[entity], done: index, total: ENTITIES.length })
    const rows: Record<string, unknown>[] = []
    let after: string | null = null
    for (;;) {
      const page: { rows: Record<string, unknown>[] } = await ports.exportEntity(run.id, entity, after, PAGE)
      rows.push(...page.rows)
      if (page.rows.length < PAGE) break
      after = cursorOf(entity, page.rows[page.rows.length - 1])
    }
    counts[entity] = rows.length
    await put(ENTITY_FILES[entity], encodeText(JSON.stringify(rows, null, 1)))
  }

  // ── media ──────────────────────────────────────────────────────────────────
  const reported: Array<{ attachment_id: string; checksum: string; bytes: number }> = []
  const missing: string[] = []
  let mediaDone = 0
  let after: string | null = null
  for (;;) {
    const page = await ports.signMediaPage(run.id, after)
    for (const item of page.items) {
      onProgress({ phase: 'media', label: item.archive_path, done: ++mediaDone, total: run.media_count })
      let bytes: Uint8Array | null = null
      try { bytes = await ports.fetchBytes(item.url) } catch { bytes = null }
      if (!bytes || bytes.length === 0) { missing.push(item.attachment_id); continue }
      await put(item.archive_path, bytes)
      // Hashed from the bytes that actually reached the archive, not from
      // anything the server told us to expect — that comparison happens on the
      // server, which is the only side that knows the expected value.
      reported.push({ attachment_id: item.attachment_id, checksum: await sha256Hex(bytes), bytes: bytes.length })
    }
    if (reported.length) { await ports.reportMedia(run.id, reported.splice(0, reported.length)) }
    if (!page.next) break
    after = page.next
  }

  // ── seal ───────────────────────────────────────────────────────────────────
  onProgress({ phase: 'sealing', label: MANIFEST_FILE, done: 1, total: 2 })
  const manifest: ArchiveManifest = {
    archive_format_version: ARCHIVE_FORMAT_VERSION,
    app_version: ports.appVersion,
    archive_id: run.id,
    school_year_id: run.school_year_id,
    school_year_name: run.school_year_name,
    created_at: ports.now(),
    created_by: run.created_by ?? '',
    created_by_name: ports.actorName,
    checksum_algorithm: 'sha-256',
    record_counts: counts,
    media_count: Number(run.media_count),
    media_bytes: Number(run.media_bytes),
    files: [...checksums.map(entry => entry.path), MANIFEST_FILE, CHECKSUMS_FILE],
    schema: { migration: '12-FEAT-007-ARCHIVE-PURGE', entities: ENTITY_FILES },
  }
  await put(MANIFEST_FILE, encodeText(JSON.stringify(manifest, null, 1)))

  onProgress({ phase: 'sealing', label: CHECKSUMS_FILE, done: 2, total: 2 })
  // checksums.txt covers every other member including the manifest, and the
  // archive's fingerprint is the hash of this one file. One value therefore
  // changes if anything in the archive changes (AC-720), which is what makes
  // re-opening the saved file a real proof rather than a gesture.
  const checksumBytes = encodeText(buildChecksumsFile(checksums))
  await zip.add(CHECKSUMS_FILE, checksumBytes)
  const fingerprint = await sha256Hex(checksumBytes)
  const sizeBytes = await zip.finish()

  if (missing.length) {
    // RB-706/EC-702. Reported anyway so the server records the run as failed,
    // and the Admin is told which objects, not just that "something" failed.
    await ports.completeArchive(run.id, fingerprint, sizeBytes).catch(() => {})
    throw new ArchiveIncomplete(`Thiếu ${missing.length} ảnh nên bản lưu không đạt.`, missing)
  }

  const archive = await ports.completeArchive(run.id, fingerprint, sizeBytes)
  onProgress({ phase: 'done', label: archive.status, done: 1, total: 1 })
  return { archive, fingerprint, sizeBytes }
}
