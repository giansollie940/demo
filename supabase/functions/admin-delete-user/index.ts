import { createAdminClient } from "../_shared/config.ts";
import { requireActor, requireManager, requireRootAdmin } from "../_shared/auth.ts";
import { assertCanManageTarget, loadTargetProfile } from "../_shared/permissions.ts";
import { tryConsumeRateLimit } from "../_shared/rate-limit.ts";
import { writeAudit } from "../_shared/audit.ts";
import { json, preflight, errorResponse, readJson } from "../_shared/http.ts";
import { assertUuid } from "../_shared/validation.ts";

function fail(message:string,status=400,code="INVALID_REQUEST"){
  return Object.assign(new Error(message),{status,code});
}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS") return preflight(req);
  if(req.method!=="POST") return json(req,405,{ok:false,error:"Method not allowed"});

  try{
    const admin=createAdminClient();
    const actor=await requireActor(req,admin);
    requireManager(actor);

    const body=await readJson(req);
    const mode=String(body?.mode||"soft").trim().toLowerCase()==="hard"?"hard":"soft";
    const rate=await tryConsumeRateLimit(admin,actor.id,mode==="hard"?"admin_hard_delete_user":"admin_deactivate_user",mode==="hard"?8:20,600);
    if(rate.ok===false) return json(req,rate.status,rate.body);

    const userId=assertUuid(body?.userId,"userId");
    const target=await loadTargetProfile(admin,userId);
    await assertCanManageTarget(admin,actor,target);

    const confirmCode=String(body?.confirmCode||"").trim().toUpperCase();
    if(!target.student_code||confirmCode!==String(target.student_code).trim().toUpperCase()){
      throw fail("Mã xác nhận không khớp",400,"CONFIRM_CODE_MISMATCH");
    }

    if(mode==="hard"){
      requireRootAdmin(actor);
      if(actor.id===userId) throw fail("Không thể xóa vĩnh viễn chính tài khoản đang đăng nhập",409,"SELF_HARD_DELETE_FORBIDDEN");
      if(target.role==="admin") throw fail("Root Admin không thể bị xóa trực tiếp",409,"ROOT_ADMIN_IMMUTABLE");
      const confirmPhrase=String(body?.confirmPhrase||"").trim().toUpperCase();
      if(confirmPhrase!=="XÓA VĨNH VIỄN") throw fail("Cụm xác nhận xóa vĩnh viễn không khớp",400,"HARD_DELETE_PHRASE_MISMATCH");

      if(target.role==="teacher"){
        const {data:assignments,error:assignmentError}=await admin
          .from("class_teachers")
          .select("class_id")
          .eq("teacher_id",userId)
          .eq("active",true)
          .limit(1);
        if(assignmentError) throw assignmentError;
        if(assignments?.length) throw fail("Giáo viên vẫn còn lớp đang phụ trách. Hãy gỡ phân quyền trước khi xóa vĩnh viễn.",409,"TEACHER_HAS_ACTIVE_ASSIGNMENTS");
      }

      const deletedAt=new Date().toISOString();
      const {error:deleteError}=await admin.auth.admin.deleteUser(userId);
      if(deleteError) throw deleteError;

      await writeAudit(admin,{
        actorId:actor.id,
        classId:target.class_id,
        action:"ADMIN_HARD_DELETE_USER",
        entityType:"profile",
        entityId:userId,
        oldData:target,
        newData:{hardDeleted:true,deletedAt,targetRole:target.role}
      });

      return json(req,200,{
        ok:true,
        hardDeleted:true,
        softDeleted:false,
        deletedUser:{id:userId,code:target.student_code,fullName:target.full_name,role:target.role},
        historyPreserved:false,
        auditSnapshotPreserved:true
      });
    }

    if(!target.active) throw fail("Tài khoản đã được khóa",409,"ALREADY_INACTIVE");

    const {error:authError}=await admin.auth.admin.updateUserById(userId,{ban_duration:"876000h"});
    if(authError) throw authError;

    const deletedAt=new Date().toISOString();
    const {error:profileError}=await admin
      .from("profiles")
      .update({active:false,deleted_at:deletedAt})
      .eq("id",userId)
      .select("id")
      .single();

    if(profileError){
      const {error:rollbackError}=await admin.auth.admin.updateUserById(userId,{ban_duration:"none"});
      if(rollbackError) console.error("admin-delete-user rollback failed",rollbackError);
      throw profileError;
    }

    await writeAudit(admin,{
      actorId:actor.id,
      classId:target.class_id,
      action:"ADMIN_DEACTIVATE_USER",
      entityType:"profile",
      entityId:userId,
      oldData:target,
      newData:{active:false,deletedAt}
    });

    return json(req,200,{
      ok:true,
      deactivatedUser:{id:userId,code:target.student_code,fullName:target.full_name},
      historyPreserved:true,
      softDeleted:true,
      hardDeleted:false
    });
  }catch(error){
    return errorResponse(req,error);
  }
});
