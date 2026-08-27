import { createAdminClient } from "../_shared/config.ts";
import { requireActor, requireRootAdmin } from "../_shared/auth.ts";
import { assertCanManageClass, assignedClassIds } from "../_shared/permissions.ts";
import { tryConsumeRateLimit } from "../_shared/rate-limit.ts";
import { json, preflight, errorResponse, readJson } from "../_shared/http.ts";
import { clean, validUuid } from "../_shared/validation.ts";

function safeIso(value: unknown) {
  const date = new Date(String(value || ""));
  return Number.isFinite(date.getTime()) ? date.toISOString() : new Date().toISOString();
}

function boundedLimit(value:unknown){
  const n=Number(value||100);
  if(!Number.isFinite(n))return 100;
  return Math.max(1,Math.min(250,Math.trunc(n)));
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return preflight(req);
  if (req.method !== "POST") return json(req, 405, { ok: false, error: "Method not allowed" });

  try {
    const admin = createAdminClient();
    const actor = await requireActor(req, admin);
    const body = await readJson(req);
    const action=String(body?.action||"").trim().toLowerCase();

    if(action==="list"){
      requireRootAdmin(actor);
      const rate=await tryConsumeRateLimit(admin,actor.id,"admin_list_audit",60,300);
      if(rate.ok===false)return json(req,rate.status,rate.body);
      const limit=boundedLimit(body?.limit);
      let query=admin
        .from("audit_logs")
        .select("id,actor_id,class_id,action,entity_type,entity_id,old_data,new_data,source,created_at")
        .order("created_at",{ascending:false})
        .limit(limit);

      const actorId=String(body?.actorId||"").trim();
      const classId=String(body?.classId||"").trim();
      const entityType=clean(body?.entityType,80);
      const auditAction=clean(body?.auditAction,80);
      const since=String(body?.since||"").trim();
      const until=String(body?.until||"").trim();
      if(actorId&&validUuid(actorId))query=query.eq("actor_id",actorId);
      if(classId&&validUuid(classId))query=query.eq("class_id",classId);
      if(entityType)query=query.eq("entity_type",entityType);
      if(auditAction)query=query.eq("action",auditAction);
      if(since)query=query.gte("created_at",safeIso(since));
      if(until)query=query.lte("created_at",safeIso(until));

      const {data,error}=await query;
      if(error)throw error;
      const rows=data||[];
      const actorIds=[...new Set(rows.map((row:any)=>row.actor_id).filter(Boolean))];
      const classIds=[...new Set(rows.map((row:any)=>row.class_id).filter(Boolean))];
      const [{data:actors,error:actorError},{data:classes,error:classError}]=await Promise.all([
        actorIds.length?admin.from("profiles").select("id,full_name,student_code").in("id",actorIds):Promise.resolve({data:[],error:null}),
        classIds.length?admin.from("classes").select("id,code,name").in("id",classIds):Promise.resolve({data:[],error:null})
      ]);
      if(actorError)throw actorError;
      if(classError)throw classError;
      const actorMap=new Map((actors||[]).map((row:any)=>[row.id,row]));
      const classMap=new Map((classes||[]).map((row:any)=>[row.id,row]));
      const logs=rows.map((row:any)=>({
        id:row.id,
        actorId:row.actor_id,
        actorName:actorMap.get(row.actor_id)?.full_name||actorMap.get(row.actor_id)?.student_code||"Tài khoản đã xóa",
        classId:row.class_id,
        classCode:classMap.get(row.class_id)?.code||null,
        action:row.action,
        entityType:row.entity_type,
        entityId:row.entity_id,
        oldData:row.old_data,
        newData:row.new_data,
        source:row.source,
        createdAt:row.created_at
      }));
      return json(req,200,{ok:true,logs,limit});
    }

    const rate = await tryConsumeRateLimit(admin, actor.id, "client_audit", 100, 600);
    if (rate.ok === false) return json(req, rate.status, rate.body);

    const incoming = Array.isArray(body?.entries) ? body.entries.slice(0, 20) : [];
    if (!incoming.length) return json(req, 200, { ok: true, count: 0 });

    const teacherClassIds = actor.role === "teacher" ? await assignedClassIds(admin, actor) : [];
    const rows: any[] = [];

    for (const entry of incoming) {
      let classId = String(entry?.classId || "").trim() || actor.class_id || null;
      if (actor.role === "teacher") {
        if (!classId && teacherClassIds.length === 1) classId = teacherClassIds[0];
        if (!classId) throw Object.assign(new Error("Giáo viên phải chọn lớp trước khi ghi nhật ký."), { status: 400, code: "AUDIT_CLASS_REQUIRED" });
        await assertCanManageClass(admin, actor, classId);
      } else if (actor.role === "admin") {
        if (classId && !validUuid(classId)) throw Object.assign(new Error("classId không hợp lệ"), { status: 400, code: "INVALID_CLASS_ID" });
      } else {
        classId = actor.class_id || null;
      }
      rows.push({
        actor_id: actor.id,
        class_id: classId,
        action: clean(entry?.action || "CLIENT_EVENT", 80),
        entity_type: clean(entry?.entityType || "web_app", 80),
        entity_id: validUuid(entry?.entityId) ? String(entry.entityId) : null,
        new_data: { detail: clean(entry?.detail, 1000), client_entity_id: clean(entry?.entityId, 120), client_created_at: safeIso(entry?.createdAt) },
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
