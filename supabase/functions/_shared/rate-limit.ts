export type RateLimitResult =
  | { ok: true }
  | {
      ok: false;
      status: 429;
      body: { ok: false; code: "RATE_LIMITED"; error: string };
    };

export async function tryConsumeRateLimit(
  admin: any,
  actorId: string,
  action: string,
  maxCalls: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  try {
    const { data, error } = await admin.rpc("consume_server_rate_limit", {
      p_actor_id: actorId,
      p_action: action,
      p_max_calls: maxCalls,
      p_window_seconds: windowSeconds,
    });

    if (error) throw error;
    if (data !== true) {
      return {
        ok: false,
        status: 429,
        body: {
          ok: false,
          code: "RATE_LIMITED",
          error: "Bạn thao tác quá nhanh. Vui lòng thử lại sau ít phút.",
        },
      };
    }
  } catch (error) {
    // Rate limiting is defense-in-depth. A database/RPC outage must not turn
    // every protected endpoint into HTTP 500; log loudly for operations.
    console.warn("Rate limit soft-fail", action, error);
  }

  return { ok: true };
}
