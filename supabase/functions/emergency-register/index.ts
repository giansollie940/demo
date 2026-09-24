import { createAdminClient } from "../_shared/config.ts";
import { requireActor } from "../_shared/auth.ts";
import { tryConsumeRateLimit } from "../_shared/rate-limit.ts";
import { writeAudit } from "../_shared/audit.ts";
import {
  json,
  preflight,
  errorResponse,
  readJson,
} from "../_shared/http.ts";
import { assertUuid, clean } from "../_shared/validation.ts";

function fail(message: string, status: number, code = "INVALID_REQUEST") {
  return Object.assign(new Error(message), { status, code });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return preflight(req);
  if (req.method !== "POST") {
    return json(req, 405, { ok: false, error: "Method not allowed" });
  }

  try {
    const admin = createAdminClient();
    const actor = await requireActor(req, admin);

    if (!["student", "monitor"].includes(actor.role) || !actor.class_id) {
      throw fail("Tài khoản không có quyền đăng ký bổ sung", 403, "ROLE_FORBIDDEN");
    }

    const rate = await tryConsumeRateLimit(
      admin,
      actor.id,
      "emergency_registration",
      4,
      3600,
    );
    if (rate.ok === false) return json(req, rate.status, rate.body);

    const body = await readJson(req);
    const weekId = assertUuid(body?.weekId, "weekId");
    const weekday = Number(body?.weekday);
    const periodNumber = Number(body?.periodNumber);
    const content = clean(body?.content, 500);
    const note = clean(body?.note, 800);
    const reason = clean(body?.reason, 300);
    const usesElectronicDevice = body?.usesElectronicDevice;

    if (!Number.isInteger(weekday) || weekday < 1 || weekday > 5) {
      throw fail("Ngày học không hợp lệ", 400, "INVALID_WEEKDAY");
    }
    if (!Number.isInteger(periodNumber) || periodNumber < 1 || periodNumber > 20) {
      throw fail("Tiết học không hợp lệ", 400, "INVALID_PERIOD");
    }
    if (!content) throw fail("Cần nhập nội dung tự học", 400, "CONTENT_REQUIRED");
    if (reason.length < 5) {
      throw fail("Hãy ghi lý do cần đăng ký bổ sung", 400, "REASON_REQUIRED");
    }
    if (typeof usesElectronicDevice !== "boolean") {
      throw fail(
        "Hãy chọn có hoặc không sử dụng thiết bị điện tử",
        400,
        "DEVICE_CHOICE_REQUIRED",
      );
    }

    const { data: open, error: openError } = await admin.rpc(
      "week_registration_is_open",
      { p_class_id: actor.class_id, p_week_id: weekId },
    );
    if (openError) throw openError;
    if (open !== true) {
      throw fail(
        "Tuần này không nằm trong cửa sổ đăng ký hiện tại",
        403,
        "WEEK_NOT_OPEN",
      );
    }

    const { data: override, error: overrideError } = await admin
      .from("week_schedule_overrides")
      .select("is_study_period")
      .eq("class_id", actor.class_id)
      .eq("week_id", weekId)
      .eq("weekday", weekday)
      .eq("period_number", periodNumber)
      .maybeSingle();
    if (overrideError) throw overrideError;

    let activeSlot = override ? override.is_study_period === true : false;
    if (!override) {
      const { data: schedule, error: scheduleError } = await admin
        .from("study_schedule")
        .select("id")
        .eq("class_id", actor.class_id)
        .eq("weekday", weekday)
        .eq("period_number", periodNumber)
        .eq("is_study_period", true)
        .maybeSingle();
      if (scheduleError) throw scheduleError;
      activeSlot = !!schedule;
    }

    if (!activeSlot) {
      throw fail("Tiết này không phải tiết tự học của lớp", 403, "NOT_STUDY_SLOT");
    }

    const [deadlineResult, sessionResult] = await Promise.all([
      admin.rpc("registration_deadline_for_slot", {
        p_class_id: actor.class_id,
        p_week_id: weekId,
        p_weekday: weekday,
      }),
      admin.rpc("study_session_start", {
        p_week_id: weekId,
        p_weekday: weekday,
        p_period_number: periodNumber,
      }),
    ]);

    if (deadlineResult.error) throw deadlineResult.error;
    if (sessionResult.error) throw sessionResult.error;

    const now = Date.now();
    const deadlineMs = deadlineResult.data
      ? new Date(deadlineResult.data).getTime()
      : Number.NaN;
    const sessionMs = sessionResult.data
      ? new Date(sessionResult.data).getTime()
      : Number.NaN;

    if (!Number.isFinite(sessionMs) || now >= sessionMs) {
      throw fail("Buổi tự học đã bắt đầu hoặc đã qua", 403, "SESSION_STARTED");
    }
    if (!Number.isFinite(deadlineMs) || now <= deadlineMs) {
      throw fail(
        "Buổi này vẫn còn trong hạn; hãy dùng đăng ký bình thường",
        409,
        "REGULAR_WINDOW_OPEN",
      );
    }

    const { data: existing, error: existingError } = await admin
      .from("registrations")
      .select("id")
      .eq("student_id", actor.id)
      .eq("week_id", weekId)
      .eq("weekday", weekday)
      .eq("period_number", periodNumber)
      .eq("is_deleted", false)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing) {
      throw fail("Buổi này đã có đăng ký đang hoạt động", 409, "REGISTRATION_EXISTS");
    }

    const nowIso = new Date().toISOString();
    const { data: registration, error: insertError } = await admin
      .from("registrations")
      .insert({
        class_id: actor.class_id,
        student_id: actor.id,
        week_id: weekId,
        weekday,
        period_number: periodNumber,
        content,
        note: note || null,
        status: "submitted",
        approval_source: "manual",
        is_emergency: true,
        emergency_reason: reason,
        emergency_requested_at: nowIso,
        uses_electronic_device: usesElectronicDevice,
        submitted_at: nowIso,
        updated_at: nowIso,
      })
      .select("*")
      .single();
    if (insertError) throw insertError;

    await writeAudit(admin, {
      actorId: actor.id,
      classId: actor.class_id,
      action: "EMERGENCY_REGISTRATION",
      entityType: "registration",
      entityId: registration.id,
      newData: { weekId, weekday, periodNumber, reason },
    });

    return json(req, 200, { ok: true, registration });
  } catch (error) {
    return errorResponse(req, error);
  }
});
