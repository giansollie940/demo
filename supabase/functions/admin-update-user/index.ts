import { createAdminClient, loginDomain } from "../_shared/config.ts";
import { requireActor, requireManager } from "../_shared/auth.ts";
import { assertActiveClass, assertCanManageTarget, loadTargetProfile } from "../_shared/permissions.ts";
import { tryConsumeRateLimit } from "../_shared/rate-limit.ts";
import { writeAudit } from "../_shared/audit.ts";
import { json, preflight, errorResponse, readJson } from "../_shared/http.ts";
import { assertLoginCode, assertUuid, clean } from "../_shared/validation.ts";

const emailForCode=(code:string)=>`${code.toLowerCase()}@${loginDomain()}`;
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

    const rate=await tryConsumeRateLimit(admin,actor.id,"admin_update_user",45,600);
    if(rate.ok===false) return json(req,rate.status,rate.body);

    const body=await readJson(req);
    const userId=assertUuid(body?.userId,"userId");
    const target=await loadTargetProfile(admin,userId);
    await assertCanManageTarget(admin,actor,target);

    const fullName=clean(body?.fullName??target.full_name,120);
    if(fullName.length<2) throw fail("Họ tên không hợp lệ");

    const role=String(body?.role||target.role);
    if(!["teacher","student","monitor"].includes(role)) throw fail("Vai trò không hợp lệ");
    if(actor.role==="teacher"&&!['student','monitor'].includes(role)){
      throw fail("Giáo viên không thể nâng quyền tài khoản",403,"ROLE_FORBIDDEN");
    }
    if(target.role==="teacher"&&actor.role!=="admin"){
      throw fail("Chỉ admin được sửa giáo viên",403,"TARGET_FORBIDDEN");
    }

    let classId:string|null=target.class_id;
    if(role==="teacher"){
      classId=null;
    }else if(actor.role==="admin"&&body?.classId){
      classId=assertUuid(body.classId,"classId");
      await assertActiveClass(admin,classId);
    }else if(!classId){
      throw fail("Học sinh/cán sự phải thuộc một lớp",400,"CLASS_REQUIRED");
    }

    if(actor.role==="teacher"&&body?.classId&&body.classId!==target.class_id){
      throw fail("Chỉ admin được chuyển học sinh sang lớp khác",403,"CLASS_TRANSFER_FORBIDDEN");
    }

    const active=body?.active!==false;
    if(active&&role!=="teacher") await assertActiveClass(admin,classId as string);

    let code=String(target.student_code||"").trim().toUpperCase();
    const changeCode=body?.changeCode===true;
    if(changeCode){
      code=assertLoginCode(body?.code);
      const {data:duplicate,error:duplicateError}=await admin
        .from("profiles")
        .select("id")
        .eq("student_code",code)
        .neq("id",userId)
        .limit(1);
      if(duplicateError) throw duplicateError;
      if(duplicate?.length) throw fail("Mã đăng nhập đã được sử dụng",409,"LOGIN_CODE_EXISTS");
    }

    const {data:authData,error:authGetError}=await admin.auth.admin.getUserById(userId);
    if(authGetError||!authData.user) throw fail("Không tìm thấy Auth user",404,"AUTH_USER_NOT_FOUND");
    const oldAuth=authData.user;

    const authPayload:any={
      user_metadata:{...(oldAuth.user_metadata||{}),full_name:fullName,login_code:code},
      ban_duration:active?"none":"876000h"
    };
    if(changeCode){
      authPayload.email=emailForCode(code);
      authPayload.email_confirm=true;
    }

    const {error:authError}=await admin.auth.admin.updateUserById(userId,authPayload);
    if(authError) throw authError;

    const profilePatch:any={
      full_name:fullName,
      role,
      class_id:classId,
      active,
      deleted_at:active?null:new Date().toISOString()
    };
    if(changeCode){
      profilePatch.student_code=code;
      profilePatch.email=emailForCode(code);
    }

    const {error:profileError}=await admin
      .from("profiles")
      .update(profilePatch)
      .eq("id",userId)
      .select("id")
      .single();

    if(profileError){
      const rollbackPayload:any={
        user_metadata:oldAuth.user_metadata||{},
        ban_duration:target.active!==false?"none":"876000h"
      };
      if(changeCode&&oldAuth.email){
        rollbackPayload.email=oldAuth.email;
        rollbackPayload.email_confirm=true;
      }
      const {error:rollbackError}=await admin.auth.admin.updateUserById(userId,rollbackPayload);
      if(rollbackError) console.error("admin-update-user rollback failed",rollbackError);
      throw profileError;
    }

    // Teacher assignment cleanup is enforced atomically by database triggers.
    await writeAudit(admin,{
      actorId:actor.id,
      classId:target.class_id||classId,
      action:"ADMIN_UPDATE_USER",
      entityType:"profile",
      entityId:userId,
      oldData:target,
      newData:{code,fullName,role,classId,active}
    });

    return json(req,200,{
      ok:true,
      user:{id:userId,code,fullName,role,classId,active},
      changed:{
        loginCode:changeCode,
        classId:classId!==target.class_id,
        role:role!==target.role,
        active:active!==target.active
      }
    });
  }catch(error){
    return errorResponse(req,error);
  }
});
