import { Zip, ZipDeflate, ZipPassThrough } from 'fflate'

/**
 * A ZIP that is written out as it is produced rather than assembled in memory.
 *
 * The archive is the only copy of a purged year, and a year's images can run to
 * hundreds of megabytes, so the writer never holds the whole file: each member
 * is pushed through and the resulting chunks go straight to the sink. Where the
 * browser supports the File System Access API the sink is the file on disk and
 * peak memory stays at one image; otherwise the chunks are collected and handed
 * over as a Blob at the end, which is the best a download can do.
 */
export interface ChunkSink {
  write(chunk: Uint8Array): Promise<void> | void
  close(): Promise<void> | void
}

export interface ZipWriter {
  /** Adds one member. JSON is deflated; images are stored, being compressed already. */
  add(path: string, bytes: Uint8Array): Promise<void>
  finish(): Promise<number>
  bytesWritten(): number
}

export function createZipWriter(sink: ChunkSink): ZipWriter {
  let written = 0
  let failure: Error | null = null
  let pending: Promise<void> = Promise.resolve()
  let ended = false
  let resolveEnd: () => void
  const endPromise = new Promise<void>(resolve => { resolveEnd = resolve })

  const zip = new Zip((error, chunk, final) => {
    if (error) { failure = error as Error; resolveEnd(); return }
    if (chunk && chunk.length) {
      written += chunk.length
      // Serialise writes: the sink may be a file stream that rejects overlap.
      pending = pending.then(() => sink.write(chunk))
    }
    if (final) { ended = true; pending.then(resolveEnd, resolveEnd) }
  })

  return {
    async add(path, bytes) {
      if (failure) throw failure
      const stored = path.endsWith('.json') || path.endsWith('.txt')
      const member = stored ? new ZipDeflate(path, { level: 6 }) : new ZipPassThrough(path)
      zip.add(member)
      member.push(bytes, true)
      await pending
      if (failure) throw failure
    },
    async finish() {
      if (!ended) zip.end()
      await endPromise
      await pending
      if (failure) throw failure
      await sink.close()
      return written
    },
    bytesWritten: () => written,
  }
}

/** Collects the archive in memory; used when the browser has no file picker. */
export function createMemorySink() {
  const chunks: Uint8Array[] = []
  return {
    chunks,
    sink: { write(chunk: Uint8Array) { chunks.push(chunk) }, close() { /* nothing to close */ } } as ChunkSink,
    concat(): Uint8Array {
      const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
      const out = new Uint8Array(total)
      let offset = 0
      for (const chunk of chunks) { out.set(chunk, offset); offset += chunk.length }
      return out
    },
  }
}
