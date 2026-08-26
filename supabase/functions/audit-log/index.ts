import { createAdminClient } from "../_shared/config.ts";
import { requireActor } from "../_shared/auth.ts";
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
import { clean, validUuid } from "../_shared/validation.ts";

function safeIso(value: unknown) {
  const date = new Date(String(value || ""));
  return Number.isFinite(date.getTime())
    ? date.toISOString()
    : new Date().toISOString();
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return preflight(req);
  if (req.method !== "POST") {
    return json(req, 405, { ok: false, error: "Method not allowed" });
  }

  try {
    const admin = createAdminClient();
    const actor = await requireActor(req, admin);
    const rate = await tryConsumeRateLimit(
      admin,
      actor.id,
      "client_audit",
      100,
      600,
    );
    if (rate.ok === false) return json(req, rate.status, rate.body);

    const body = await readJson(req);
    const incoming = Array.isArray(body?.entries) ? body.entries.slice(0, 20) : [];
    if (!incoming.length) return json(req, 200, { ok: true, count: 0 });

    const teacherClassIds = actor.role === "teacher"
      ? await assignedClassIds(admin, actor)
      : [];
    const rows: any[] = [];

    for (const entry of incoming) {
      let classId = String(entry?.classId || "").trim() || actor.class_id || null;

      if (actor.role === "teacher") {
        if (!classId && teacherClassIds.length === 1) classId = teacherClassIds[0];
        if (!classId) {
          throw Object.assign(
            new Error("Giáo viên phải chọn lớp trước khi ghi nhật ký."),
            { status: 400, code: "AUDIT_CLASS_REQUIRED" },
          );
        }
        await assertCanManageClass(admin, actor, classId);
      } else if (actor.role === "admin") {
        if (classId && !validUuid(classId)) {
          throw Object.assign(new Error("classId không hợp lệ"), {
            status: 400,
            code: "INVALID_CLASS_ID",
          });
        }
      } else {
        classId = actor.class_id || null;
      }

      rows.push({
        actor_id: actor.id,
        class_id: classId,
        action: clean(entry?.action || "CLIENT_EVENT", 80),
        entity_type: clean(entry?.entityType || "web_app", 80),
        entity_id: validUuid(entry?.entityId) ? String(entry.entityId) : null,
        new_data: {
          detail: clean(entry?.detail, 1000),
          client_entity_id: clean(entry?.entityId, 120),
          client_created_at: safeIso(entry?.createdAt),
        },
        source: "client",
        created_at: new Date().toISOString(),
      });
    }

    const { error } = await admin.from("audit_logs").insert(rows);
    if (error) throw error;

    return json(req, 200, { ok: true, count: rows.length });
  } catch (error) {
    return errorResponse(req, error);
  }
});
