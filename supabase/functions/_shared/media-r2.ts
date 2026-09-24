import { AwsClient } from 'npm:aws4fetch@1.0.20';
import { MAX_IMAGE_BYTES } from './media-storage.js';
export function createR2() {
  const account = Deno.env.get('R2_ACCOUNT_ID') || '';
  const bucket = Deno.env.get('R2_HOMEWORK_BUCKET') || '';
  const accessKeyId = Deno.env.get('R2_ACCESS_KEY_ID') || '';
  const secretAccessKey = Deno.env.get('R2_SECRET_ACCESS_KEY') || '';
  if (!/^[a-f0-9]{32}$/.test(account) || !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket) || !accessKeyId || !secretAccessKey)
    throw Object.assign(new Error('Chưa cấu hình lưu ảnh. Bạn vẫn có thể gửi bài dạng chữ.'), { status: 503 });
  const client = new AwsClient({ accessKeyId, secretAccessKey, region: 'auto', service: 's3', retries: 0 });
  const url = (key: string) => `https://${account}.r2.cloudflarestorage.com/${bucket}/${key.split('/').map(encodeURIComponent).join('/')}`;
  async function request(key: string, init: RequestInit) {
    // Time bounded, no provider response body/secrets in logs or user errors.
    const response = await client.fetch(url(key), { ...init, signal: AbortSignal.timeout(20000) });
    return response;
  }
  return {
    async sign(key: string, method: 'GET' | 'PUT', seconds: number, sizeBytes?: number) {
      const address = new URL(url(key)); address.searchParams.set('X-Amz-Expires', String(seconds));
      const signed = await client.sign(address.toString(), { method,
        headers: method === 'PUT' ? { 'Content-Type': 'image/webp', 'Content-Length': String(sizeBytes) } : {},
        aws: { signQuery: true, allHeaders: true } });
      return signed.url;
    },
    async get(key: string): Promise<Uint8Array | null> {
      const res = await request(key, { method: 'GET' });
      if (res.status === 404) return null;
      if (!res.ok || !res.body) throw new Error('Không đọc được ảnh từ kho lưu trữ.');
      const reader = res.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
      try {
        while (true) {
          const { value, done } = await reader.read(); if (done) break;
          size += value.byteLength;
          if (size > MAX_IMAGE_BYTES) { await reader.cancel(); throw new Error('Ảnh vượt 500 KB.'); }
          chunks.push(value);
        }
      } finally { reader.releaseLock(); }
      const bytes = new Uint8Array(size); let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk,offset); offset+=chunk.length; }
      return bytes;
    },
    async putImmutable(key: string, bytes: Uint8Array) {
      const res = await request(key, { method: 'PUT', headers: { 'Content-Type': 'image/webp', 'If-None-Match': '*', 'Cache-Control': 'private, no-store' }, body: bytes });
      if (!res.ok && res.status !== 412) throw new Error('Chưa lưu được ảnh. Bạn có thể thử lại hoặc gửi bài dạng chữ.');
    },
    async delete(key: string) {
      const res = await request(key, { method: 'DELETE' });
      if (!res.ok && res.status !== 404) throw new Error('R2_DELETE_FAILED');
    },
    /**
     * FEAT-008: sum what the bucket actually holds, including objects the
     * application has no metadata row for. Bounded by `maxPages` so a storage
     * dashboard can never turn into an unbounded walk of a full bucket; when the
     * budget runs out the caller is told the figure is partial and must not use
     * it as the authoritative total.
     */
    async usage(maxPages = 20): Promise<{ bytes: number; objects: number; partial: boolean }> {
      let bytes = 0, objects = 0, token: string | undefined, pages = 0;
      do {
        const address = new URL(`https://${account}.r2.cloudflarestorage.com/${bucket}`);
        address.searchParams.set('list-type', '2');
        address.searchParams.set('max-keys', '1000');
        if (token) address.searchParams.set('continuation-token', token);
        const res = await client.fetch(address.toString(), { method: 'GET', signal: AbortSignal.timeout(20000) });
        if (!res.ok) throw new Error('R2_USAGE_UNAVAILABLE');
        const body = await res.text();
        for (const size of body.matchAll(/<Size>(\d+)<\/Size>/g)) { bytes += Number(size[1]); objects += 1; }
        token = body.match(/<NextContinuationToken>([^<]+)<\/NextContinuationToken>/)?.[1];
        pages += 1;
      } while (token && pages < maxPages);
      return { bytes, objects, partial: Boolean(token) };
    },
  };
}
