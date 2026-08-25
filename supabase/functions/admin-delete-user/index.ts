import { createAdminClient } from "../_shared/config.ts";
import { requireActor, requireManager } from "../_shared/auth.ts";
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

    const rate=await tryConsumeRateLimit(admin,actor.id,"admin_deactivate_user",20,600);
    if(rate.ok===false) return json(req,rate.status,rate.body);

    const body=await readJson(req);
    const userId=assertUuid(body?.userId,"userId");
    const target=await loadTargetProfile(admin,userId);
    await assertCanManageTarget(admin,actor,target);

    const confirmCode=String(body?.confirmCode||"").trim().toUpperCase();
    if(!target.student_code||confirmCode!==String(target.student_code).trim().toUpperCase()){
      throw fail("Mã xác nhận không khớp",400,"CONFIRM_CODE_MISMATCH");
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

    // Teacher assignments are atomically deactivated by the profile trigger.
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
      softDeleted:true
    });
  }catch(error){
    return errorResponse(req,error);
  }
});
