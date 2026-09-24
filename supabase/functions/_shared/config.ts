import { createClient } from "npm:@supabase/supabase-js@2.95.0";

function usableKey(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 20;
}

function isServiceRoleJwt(value: string) {
  if (!value || value.startsWith("sb_publishable_")) return false;
  if (value.startsWith("sb_secret_")) return true;

  const parts = value.split(".");
  if (parts.length !== 3) return false;
  try {
    const normalized = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const payload = JSON.parse(atob(padded));
    return payload?.role === "service_role";
  } catch {
    return false;
  }
}

function parseSecretMap(): Record<string, string> {
  try {
    const parsed = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, string>;
    }
  } catch (error) {
    console.warn("SUPABASE_SECRET_KEYS parse failed", error);
  }
  return {};
}

export function getServerConfig() {
  const url = (Deno.env.get("SUPABASE_URL") || "").trim();
  const map = parseSecretMap();
  const candidates = Object.values(map).filter(usableKey).map(value => value.trim());

  // Accept only a modern sb_secret_ key or a legacy JWT whose payload
  // explicitly declares role=service_role. Never guess based on key length.
  const secretKey = candidates.find(value => value.startsWith("sb_secret_"));
  const namedServiceKey = [map.service_role, map.serviceRole]
    .filter(usableKey)
    .map(value => value.trim())
    .find(isServiceRoleJwt);
  const envServiceKey = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "").trim();
  const verifiedEnvServiceKey = isServiceRoleJwt(envServiceKey) ? envServiceKey : "";
  const defaultKey = usableKey(map.default) && isServiceRoleJwt(map.default.trim())
    ? map.default.trim()
    : "";

  const key = secretKey || namedServiceKey || verifiedEnvServiceKey || defaultKey || "";
  if (!url || !key) {
    throw Object.assign(new Error("Thiếu cấu hình máy chủ Supabase"), {
      status: 500,
      code: "SERVER_CONFIG",
    });
  }

  return { url, key };
}

export function createAdminClient() {
  const { url, key } = getServerConfig();
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function loginDomain() {
  return (Deno.env.get("LOGIN_DOMAIN") || "users.example.com")
    .trim()
    .toLowerCase();
}
