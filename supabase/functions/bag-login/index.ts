// AUTH-BAG-001 — sign in with the school-bag passcode.
// On success it returns a one-time magic-link token hash; the browser exchanges it with
// supabase.auth.verifyOtp({ type: "magiclink", token_hash }) for a normal Supabase session, so
// refresh, sign-out and RLS behave exactly as after a password sign-in. Nothing is emailed and
// the password is untouched. Deploy with verify_jwt = false: the caller has no session yet.
import { createAdminClient, loginDomain } from "../_shared/config.ts";
import { json, preflight, readJson } from "../_shared/http.ts";
import { CATALOG_SIZE, CATALOG_VERSION, toInputHex } from "../_shared/bag-catalog.ts";

// Pilot thresholds: 5 failures in 15 min pause the account for 15 min; a higher per-IP ceiling
// because a whole school network can share one address.
const LIMITS = {
  p_account_max: 5, p_account_window: 900, p_account_lock: 900,
  p_ip_max: 30, p_ip_window: 900, p_ip_lock: 900,
};

// One answer for every refusal: wrong sequence, unknown, unenrolled or ineligible account, or a lock.
function refuse(req: Request) {
  return json(req, 401, {
    ok: false,
    code: "BAG_LOGIN_FAILED",
    error: "Không thể đăng nhập bằng cách này. Kiểm tra thông tin hoặc dùng mật khẩu.",
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return preflight(req);
  if (req.method !== "POST") return json(req, 405, { ok: false, error: "Method not allowed" });

  // Any storage or auth error fails closed: there is no fallback path into an account.
  try {
    const body = await readJson(req);
    const code = typeof body?.code === "string" ? body.code.trim().toLowerCase() : "";
    const valid = /^[a-z0-9._-]{2,32}$/.test(code);
    const email = `${valid ? code : "invalid"}@${loginDomain()}`;
    const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0]?.trim() || "unknown";

    const admin = createAdminClient();
    const { data: attempt, error } = await admin.rpc("bag_auth_attempt", {
      p_email: email,
      p_code: valid ? code : "invalid",
      p_input_hex: toInputHex(body) ?? "",
      p_ip: ip,
      p_catalog: CATALOG_VERSION,
      p_catalog_size: CATALOG_SIZE,
      ...LIMITS,
    });
    if (error) throw error;
    if (!valid || !attempt?.ok) return refuse(req);

    // Re-check right before issuing, so a change or disable racing this login wins.
    const { data: stillValid, error: recheckError } = await admin.rpc("bag_auth_still_valid", {
      p_user: attempt.user_id,
      p_version: attempt.credential_version,
    });
    if (recheckError) throw recheckError;
    if (!stillValid) return refuse(req);

    const { data, error: linkError } = await admin.auth.admin.generateLink({ type: "magiclink", email });
    const tokenHash = data?.properties?.hashed_token;
    if (linkError || !tokenHash) throw new Error(`generateLink: ${linkError?.message ?? "no token"}`);

    return json(req, 200, { ok: true, type: "magiclink", token_hash: tokenHash });
  } catch (error) {
    console.error("bag-login failed", (error as Error)?.message);
    return json(req, 503, { ok: false, code: "UNAVAILABLE", error: "Chưa đăng nhập được bằng chiếc cặp lúc này. Hãy dùng mật khẩu." });
  }
});
