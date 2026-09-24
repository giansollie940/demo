// Platform-independent core: production R2 and deterministic failure tests share this code.
export const MAX_IMAGE_BYTES = 500000;
export async function validateWebP(bytes, meta) {
  const invalid = () => { throw new Error('Ảnh không hợp lệ: cần WebP tối đa 500 KB, cạnh dài tối đa 1600 px.'); };
  if (!(bytes instanceof Uint8Array) || bytes.length < 20 || bytes.length > MAX_IMAGE_BYTES || bytes.length !== meta.size_bytes) invalid();
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = at => String.fromCharCode(...bytes.slice(at, at + 4));
  if (tag(0) !== 'RIFF' || tag(8) !== 'WEBP' || v.getUint32(4, true) + 8 !== bytes.length) invalid();
  let frame = null, canvas = null, offset = 12;
  while (offset + 8 <= bytes.length) {
    const kind = tag(offset), size = v.getUint32(offset + 4, true), p = offset + 8;
    if (p + size > bytes.length) invalid();
    if (kind === 'VP8X') {
      if (size !== 10 || canvas || (bytes[p] & 2)) invalid(); // animation is not a still image
      const uint24 = i => bytes[i] + (bytes[i+1] << 8) + (bytes[i+2] << 16);
      canvas = [1 + uint24(p + 4), 1 + uint24(p + 7)];
    } else if (kind === 'VP8 ') {
      if (frame || size < 10 || bytes[p] & 1 || bytes[p+3] !== 0x9d || bytes[p+4] !== 1 || bytes[p+5] !== 0x2a) invalid();
      frame = [v.getUint16(p + 6, true) & 0x3fff, v.getUint16(p + 8, true) & 0x3fff];
    } else if (kind === 'VP8L') {
      if (frame || size < 5 || bytes[p] !== 0x2f || (bytes[p+4] >> 5) !== 0) invalid();
      const bits = v.getUint32(p+1,true);
      frame = [1 + (bits & 0x3fff), 1 + ((bits >>> 14) & 0x3fff)];
    } else if (!['ALPH', 'ICCP'].includes(kind)) invalid(); // no animation or EXIF/GPS metadata
    offset = p + size + (size & 1);
  }
  if (offset !== bytes.length || !frame || frame.some(d=>d<1||d>1600) || (canvas && canvas.some((d,i)=>d!==frame[i])) || frame[0]!==meta.width || frame[1]!==meta.height) invalid();
  const checksum = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))).map(v=>v.toString(16).padStart(2,'0')).join('');
  if (checksum !== meta.checksum) throw new Error('Ảnh tải lên không khớp bản đã chọn. Hãy chọn lại ảnh.');
}
export async function promoteMedia(store, meta) {
  // A client PUT grant only targets staging. Never overwrite the immutable key.
  const existing = await store.get(meta.object_key);
  if (existing) { await validateWebP(existing, meta); return; }
  const bytes = await store.get(meta.staging_key);
  if (!bytes) throw new Error('Ảnh chưa tải lên xong. Hãy thử gửi lại.');
  await validateWebP(bytes, meta);
  await store.putImmutable(meta.object_key, bytes);
  const saved = await store.get(meta.object_key);
  if (!saved) throw new Error('Chưa xác nhận được ảnh đã lưu.');
  await validateWebP(saved, meta);
}
export async function runCleanup(rpc, store) {
  const jobs = await rpc('jobs', {});
  let succeeded = 0, failed = 0;
  // The SQL outbox survives failures and processes each key idempotently.
  for (const job of jobs) {
    let success = false;
    try {
      await store.delete(job.staging_key);
      if (job.kind === 'purge') await store.delete(job.object_key);
      success = true; succeeded++;
    } catch { failed++; }
    await rpc('ack', { attachment_id: job.id, token: job.token, success });
  }
  return { processed: jobs.length, succeeded, failed };
}
