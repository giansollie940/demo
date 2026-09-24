import { createAdminClient } from "../_shared/config.ts";
import { requireActor, requireManager } from "../_shared/auth.ts";
import {
  assertCanManageClass,
  assignedClassIds,
} from "../_shared/permissions.ts";
import { tryConsumeRateLimit } from "../_shared/rate-limit.ts";
import {
  json,
  preflight,
  errorResponse,
  readJson,
} from "../_shared/http.ts";
import { assertUuid } from "../_shared/validation.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return preflight(req);
  if (req.method !== "POST") {
    return json(req, 405, { ok: false, error: "Method not allowed" });
  }

  try {
    const admin = createAdminClient();
    const actor = await requireActor(req, admin);
    requireManager(actor);

    const limit = await tryConsumeRateLimit(
      admin,
      actor.id,
      "admin_list_users",
      90,
      300,
    );
    if (limit.ok === false) return json(req, limit.status, limit.body);

    const body = await readJson(req);
    let classId = String(body?.classId || "").trim();
    const classIds = await assignedClassIds(admin, actor);

    if (classId) {
      assertUuid(classId, "classId");
      await assertCanManageClass(admin, actor, classId);
    } else if (actor.role === "teacher" && classIds.length === 1) {
      classId = classIds[0];
    }

    // Avoid emitting an empty PostgREST `in.()` filter when a teacher has
    // not yet been assigned any class.
    if (actor.role === "teacher" && classIds.length === 0) {
      return json(req, 200, { ok: true, users: [], classIds: [] });
    }

    let query = admin
      .from("profiles")
      .select("id,student_code,full_name,role,active,class_id,deleted_at")
      .neq("role", "admin")
      .order("student_code");

    if (actor.role === "teacher") {
      query = query
        .in("class_id", classIds)
        .in("role", ["student", "monitor"]);
    } else if (classId) {
      query = query.eq("class_id", classId);
    }

    const { data, error } = await query;
    if (error) throw error;

    const users = (data || []).map((profile: any) => ({
      id: profile.id,
      code: profile.student_code || "",
      fullName: profile.full_name || "",
      role: profile.role,
      active: profile.active !== false,
      classId: profile.class_id,
      deletedAt: profile.deleted_at || null,
    }));

    return json(req, 200, { ok: true, users, classIds });
  } catch (error) {
    return errorResponse(req, error);
  }
});
