import type {ActorProfile} from "./auth.ts";

function forbidden(message:string,code="CLASS_FORBIDDEN"){
  return Object.assign(new Error(message),{status:403,code});
}

export async function assertActiveClass(admin:any,classId:string){
  const {data,error}=await admin.from("classes").select("id,active").eq("id",classId).maybeSingle();
  if(error)throw error;
  if(!data)throw Object.assign(new Error("Không tìm thấy lớp"),{status:404,code:"CLASS_NOT_FOUND"});
  if(data.active!==true)throw Object.assign(new Error("Lớp đang bị khóa"),{status:409,code:"CLASS_INACTIVE"});
  return data;
}

export async function assignedClassIds(admin:any,actor:ActorProfile):Promise<string[]>{
  if(actor.role==="admin"){
    const {data,error}=await admin.from("classes").select("id").eq("active",true);
    if(error)throw error;
    return (data||[]).map((x:any)=>x.id);
  }
  if(actor.role!=="teacher")return actor.class_id?[actor.class_id]:[];
  const {data,error}=await admin.from("class_teachers").select("class_id").eq("teacher_id",actor.id).eq("active",true);
  if(error)throw error;
  const ids=(data||[]).map((x:any)=>x.class_id).filter(Boolean);
  if(!ids.length)return [];
  const {data:classes,error:classError}=await admin.from("classes").select("id").in("id",ids).eq("active",true);
  if(classError)throw classError;
  return (classes||[]).map((x:any)=>x.id);
}

export async function assertCanManageClass(admin:any,actor:ActorProfile,classId:string){
  if(actor.role==="admin")return;
  if(actor.role!=="teacher")throw forbidden("Bạn không có quyền quản lý lớp");
  await assertActiveClass(admin,classId);
  const {data,error}=await admin.from("class_teachers").select("class_id").eq("teacher_id",actor.id).eq("class_id",classId).eq("active",true).maybeSingle();
  if(error)throw error;
  if(!data)throw forbidden("Bạn chưa được phân quyền lớp này");
}

export async function loadTargetProfile(admin:any,userId:string){
  const {data,error}=await admin.from("profiles").select("id,student_code,full_name,email,role,active,class_id,deleted_at").eq("id",userId).single();
  if(error||!data)throw Object.assign(new Error("Không tìm thấy tài khoản"),{status:404,code:"USER_NOT_FOUND"});
  return data;
}

export async function assertCanManageTarget(admin:any,actor:ActorProfile,target:any){
  if(target.role==="admin")throw forbidden("Tài khoản quản trị viên gốc không thể được quản lý tại đây","ROOT_ADMIN_IMMUTABLE");
  if(actor.role==="admin")return;
  if(!["student","monitor"].includes(target.role)||!target.class_id)throw forbidden("Giáo viên chỉ được quản lý học sinh/cán sự thuộc lớp được phân công","TARGET_FORBIDDEN");
  await assertCanManageClass(admin,actor,target.class_id);
}
