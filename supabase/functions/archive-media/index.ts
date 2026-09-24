import { createClient } from 'npm:@supabase/supabase-js@2.95.0';
import { createAdminClient, getServerConfig } from '../_shared/config.ts';
import { requireActor, requireRootAdmin } from '../_shared/auth.ts';
import { json, preflight, errorResponse, readJson } from '../_shared/http.ts';
import { createR2 } from '../_shared/media-r2.ts';

/**
 * FEAT-007 — hands the Admin's browser short-lived GET URLs for the images of
 * one school year so it can pack them into the archive ZIP.
 *
 * Why this exists instead of reusing FEAT-006 `homework_media('read')`:
 * that path authorises image by image against the notice it hangs off, and it
 * deliberately refuses Admin for correction-round images (they are private
 * between author and teacher). An archive that quietly skipped those would be
 * incomplete, and RB-706 says an incomplete archive must fail rather than be
 * silently partial. So the archive reads the year's inventory through
 * `homework_archive('media_manifest')`, which is Admin-only by construction and
 * scoped to one recorded archive run.
 *
 * The R2 credentials never leave this function. What the browser receives is a
 * URL that expires in minutes, which is why no such URL is ever written into the
 * archive itself (BR-711/AC-729/AC-704) — the ZIP references `archive_path`.
 */
const MAX_BATCH = 50;
const URL_TTL_SECONDS = 300;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return preflight(req);
  if (req.method !== 'POST') return json(req, 405, { error: 'Chỉ hỗ trợ POST' });
  try {
    const admin = createAdminClient();
    requireRootAdmin(await requireActor(req, admin));
    const { url, key } = getServerConfig();
    // The manifest is read as the caller, so Postgres re-checks the Admin role
    // rather than this function's own service credentials vouching for it.
    const user = createClient(url, key, {
      global: { headers: { Authorization: req.headers.get('Authorization')! } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const body = await readJson(req);
    const archiveId = String(body.archive_id ?? '');
    if (!/^[0-9a-f-]{36}$/.test(archiveId)) return json(req, 400, { error: 'Thiếu mã bản lưu.' });

    const { data, error } = await user.rpc('homework_archive', {
      p_action: 'media_manifest',
      p_data: { archive_id: archiveId, after: body.after ?? null, limit: MAX_BATCH },
    });
    if (error) throw Object.assign(new Error(error.message), { status: 400, code: error.code });

    const items = (data?.items ?? []) as Array<{ attachment_id: string; object_key: string; size_bytes: number; archive_path: string }>;
    const store = createR2();
    const signed = [];
    for (const item of items) {
      signed.push({
        attachment_id: item.attachment_id,
        archive_path: item.archive_path,
        size_bytes: item.size_bytes,
        url: await store.sign(item.object_key, 'GET', URL_TTL_SECONDS),
      });
    }
    return json(req, 200, {
      ok: true,
      items: signed,
      next: items.length === MAX_BATCH ? items[items.length - 1].attachment_id : null,
      expires_in: URL_TTL_SECONDS,
    });
  } catch (error) {
    return errorResponse(req, error, 'Chưa lấy được ảnh của năm học để đóng gói.');
  }
});
