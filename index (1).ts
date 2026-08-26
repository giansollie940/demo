import { createAdminClient } from "../_shared/config.ts";
import { requireActor, requireManager } from "../_shared/auth.ts";
import {
  assertCanManageTarget,
  loadTargetProfile,
} from "../_shared/permissions.ts";
import { tryConsumeRateLimit } from "../_shared/rate-limit.ts";
import { writeAudit } from "../_shared/audit.ts";
import {
  json,
  preflight,
  errorResponse,
  readJson,
} from "../_shared/http.ts";
import { assertPassword, assertUuid } from "../_shared/validation.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return preflight(req);
  if (req.method !== "POST") {
    return json(req, 405, { ok: false, error: "Method not allowed" });
  }

  try {
    const admin = createAdminClient();
    const actor = await requireActor(req, admin);
    requireManager(actor);

    const rate = await tryConsumeRateLimit(
      admin,
      actor.id,
      "admin_reset_password",
      12,
      600,
    );
    if (rate.ok === false) return json(req, rate.status, rate.body);

    const body = await readJson(req);
    const userId = assertUuid(body?.userId, "userId");
    const newPassword = assertPassword(body?.newPassword);
    const target = await loadTargetProfile(admin, userId);
    await assertCanManageTarget(admin, actor, target);

    const { error } = await admin.auth.admin.updateUserById(userId, {
      password: newPassword,
    });
    if (error) throw error;

    await writeAudit(admin, {
      actorId: actor.id,
      classId: target.class_id,
      action: "ADMIN_RESET_PASSWORD",
      entityType: "profile",
      entityId: userId,
      newData: { passwordReset: true },
    });

    return json(req, 200, {
      ok: true,
      studentCode: target.student_code,
    });
  } catch (error) {
    return errorResponse(req, error);
  }
});
