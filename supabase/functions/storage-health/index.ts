import { createAdminClient } from '../_shared/config.ts';
import { requireActor, requireRootAdmin } from '../_shared/auth.ts';
import { json, preflight, errorResponse, readJson } from '../_shared/http.ts';
import { createR2 } from '../_shared/media-r2.ts';

/**
 * FEAT-008 — reads Cloudflare R2 usage and hands the figure to Postgres.
 *
 * The R2 credentials live only here; nothing about them reaches the browser.
 * The response carries usage numbers and nothing else.
 *
 * A storage dashboard must not fail closed: if R2 cannot be reached, or the
 * bucket is larger than one bounded walk, the database-side state is still
 * returned and the R2 figure stays on the application's own metadata
 * aggregate. Admin sees `source` and knows which number they are looking at.
 */
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return preflight(req);
  if (req.method !== 'POST') return json(req, 405, { error: 'Chỉ hỗ trợ POST' });
  try {
    const admin = createAdminClient();
    requireRootAdmin(await requireActor(req, admin));
    const body = await readJson(req);

    const service = async (action: string, p: Record<string, unknown> = {}) => {
      const { data, error } = await admin.rpc('homework_storage_service', { p_action: action, p_data: p });
      if (error) throw error;
      return data;
    };

    // Always refresh the in-database measurements first; they never depend on a
    // third party and are what the dashboard falls back to.
    let state = await service('measure');
    if (body.action === 'state') return json(req, 200, { ok: true, state, r2: { attempted: false } });

    let report: { attempted: true; ok: boolean; partial?: boolean; objects?: number; reason?: string };
    try {
      const usage = await createR2().usage();
      if (usage.partial) {
        report = { attempted: true, ok: false, partial: true, objects: usage.objects, reason: 'R2_USAGE_PARTIAL' };
      } else {
        state = await service('record_usage', { provider: 'r2', provider_bytes: String(usage.bytes) });
        report = { attempted: true, ok: true, partial: false, objects: usage.objects };
      }
    } catch (error) {
      // Not fatal. Never surface the provider's own message: it can carry
      // request signatures and bucket detail.
      report = { attempted: true, ok: false, reason: (error as { message?: string })?.message === 'R2_USAGE_UNAVAILABLE' ? 'R2_USAGE_UNAVAILABLE' : 'R2_NOT_CONFIGURED' };
    }
    return json(req, 200, { ok: true, state, r2: report });
  } catch (error) {
    return errorResponse(req, error, 'Chưa đọc được dung lượng lưu trữ.');
  }
});
