import { createAdminClient, loginDomain } from "../_shared/config.ts";
import { requireActor, requireManager } from "../_shared/auth.ts";
import { assertActiveClass, assertCanManageClass } from "../_shared/permissions.ts";
import { tryConsumeRateLimit } from "../_shared/rate-limit.ts";
import { writeAudit } from "../_shared/audit.ts";
import { json, preflight, errorResponse, readJson } from "../_shared/http.ts";
import { assertLoginCode, assertPassword, assertUuid, clean } from "../_shared/validation.ts";

function fail(message:string,status=400,code="INVALID_REQUEST"){
  return Object.assign(new Error(message),{status,code});
}

function randomPassword(){
  const chars="ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes=crypto.getRandomValues(new Uint8Array(12));
  let out="A1@";
  for(const byte of bytes) out+=chars[byte%chars.length];
  return out;
}

function emailForCode(code:string){
  return `${code.toLowerCase()}@${loginDomain()}`;
}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS") return preflight(req);
  if(req.method!=="POST") return json(req,405,{ok:false,error:"Method not allowed"});

  try{
    const admin=createAdminClient();
    const actor=await requireActor(req,admin);
    requireManager(actor);

    const rate=await tryConsumeRateLimit(admin,actor.id,"admin_create_user",15,600);
    if(rate.ok===false) return json(req,rate.status,rate.body);

    const body=await readJson(req);
    const code=assertLoginCode(body?.code);
    const fullName=clean(body?.fullName,120);
    const role=String(body?.role||"student");
    const requestedPassword=assertPassword(body?.password,{allowEmpty:true});

    if(fullName.length<2) throw fail("Họ tên không hợp lệ");
    if(actor.role==="teacher"&&!['student','monitor'].includes(role)){
      throw fail("Giáo viên chỉ được tạo học sinh/cán sự",403,"ROLE_FORBIDDEN");
    }
    if(actor.role==="admin"&&!['teacher','student','monitor'].includes(role)){
      throw fail("Không thể tạo thêm tài khoản admin",400,"ROOT_ADMIN_UNIQUE");
    }

    let classId:string|null=null;
    if(role!=="teacher"){
      classId=assertUuid(body?.classId,"classId");
      await assertActiveClass(admin,classId);
      await assertCanManageClass(admin,actor,classId);
    }

    const {data:duplicate,error:duplicateError}=await admin
      .from("profiles")
      .select("id")
      .eq("student_code",code)
      .limit(1);
    if(duplicateError) throw duplicateError;
    if(duplicate?.length) throw fail("Mã đăng nhập đã tồn tại",409,"LOGIN_CODE_EXISTS");

    const password=requestedPassword||randomPassword();
    const email=emailForCode(code);
    const {data:created,error:createError}=await admin.auth.admin.createUser({
      email,
      password,
      email_confirm:true,
      user_metadata:{full_name:fullName,login_code:code}
    });
    if(createError||!created.user) throw fail("Không tạo được tài khoản đăng nhập",400,"AUTH_CREATE_FAILED");

    const {error:profileError}=await admin
      .from("profiles")
      .update({
        student_code:code,
        full_name:fullName,
        email,
        role,
        class_id:classId,
        active:true,
        deleted_at:null
      })
      .eq("id",created.user.id)
      .select("id")
      .single();

    if(profileError){
      const {error:cleanupError}=await admin.auth.admin.deleteUser(created.user.id);
      if(cleanupError) console.error("admin-create-user Auth cleanup failed",cleanupError);
      throw profileError;
    }

    await writeAudit(admin,{
      actorId:actor.id,
      classId,
      action:"ADMIN_CREATE_USER",
      entityType:"profile",
      entityId:created.user.id,
      newData:{code,fullName,role,classId}
    });

    return json(req,200,{
      ok:true,
      user:{id:created.user.id,code,fullName,role,classId,active:true},
      password,
      generatedPassword:!requestedPassword
    });
  }catch(error){
    return errorResponse(req,error);
  }
});
