// AUTH-BAG-001 — set up, change, disable or read the status of the signed-in user's
// school-bag passcode. The Supabase password is never read or changed: the sequence becomes a
// separate bcrypt verifier (public.bag_auth_* in database/upgrade/18-AUTH-BAG-001-...).
import { createAdminClient } from "../_shared/config.ts";
import { requireActor } from "../_shared/auth.ts";
import { errorResponse, json, preflight, readJson } from "../_shared/http.ts";
import { CATALOG_SIZE, CATALOG_VERSION, policyIssue, toInputHex } from "../_shared/bag-catalog.ts";

const REAUTH_SECONDS = 300; // Changing or disabling needs a password sign-in from the last 5 minutes.
const ELIGIBLE = ["student", "monitor"];

function tokenClaims(req: Request): Record<string, unknown> {
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  const part = token.split(".")[1] || "";
  const base64 = part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "=");
  try { return JSON.parse(atob(base64)); } catch { return {}; }
}

function passwordIsFresh(req: Request) {
  const amr = tokenClaims(req).amr;
  if (!Array.isArray(amr)) return false;
  const entry = amr.find(item => item?.method === "password");
  const at = Number(entry?.timestamp || 0);
  return at > 0 && Date.now() / 1000 - at <= REAUTH_SECONDS;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return preflight(req);
  if (req.method !== "POST") return json(req, 405, { ok: false, error: "Method not allowed" });

  try {
    const admin = createAdminClient();
    // requireActor validates the token with the Auth server, so its claims can be trusted below.
    const actor = await requireActor(req, admin);
    if (!ELIGIBLE.includes(actor.role)) {
      return json(req, 403, { ok: false, code: "NOT_ELIGIBLE", error: "Tài khoản này chưa dùng được đăng nhập bằng chiếc cặp." });
    }

    const body = await readJson(req);
    if (body?.action === "status") {
      const { data, error } = await admin.rpc("bag_auth_status", { p_user: actor.id });
      if (error) throw error;
      return json(req, 200, { ok: true, ...(data || { enabled: false, updated_at: null }) });
    }

    if (!passwordIsFresh(req)) {
      return json(req, 403, { ok: false, code: "REAUTH_REQUIRED", error: "Hãy nhập lại mật khẩu để tiếp tục." });
    }

    if (body?.action === "disable") {
      const { error } = await admin.rpc("bag_auth_disable", { p_user: actor.id });
      if (error) throw error;
      return json(req, 200, { ok: true, enabled: false });
    }

    if (body?.action === "enroll") {
      const hex = toInputHex(body);
      if (!hex) return json(req, 400, { ok: false, code: "INVALID_SEQUENCE", error: "Chuỗi dụng cụ không hợp lệ." });
      const issue = policyIssue(body.items as string[]);
      if (issue) return json(req, 400, { ok: false, code: "WEAK_SEQUENCE", issue, error: "Chuỗi này quá dễ đoán. Hãy chọn chuỗi khác." });
      const { data, error } = await admin.rpc("bag_auth_enroll", {
        p_user: actor.id,
        p_input_hex: hex,
        p_catalog: CATALOG_VERSION,
        p_catalog_size: CATALOG_SIZE,
      });
      if (error) throw error;
      return json(req, 200, { ok: true, enabled: true, credential_version: data });
    }

    return json(req, 400, { ok: false, code: "UNKNOWN_ACTION", error: "Thao tác không hợp lệ." });
  } catch (error) {
    return errorResponse(req, error, "Chưa lưu được. Vui lòng thử lại sau.");
  }
});
