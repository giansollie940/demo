import {createAdminClient} from "../_shared/config.ts";
import {requireActor,requireRootAdmin} from "../_shared/auth.ts";
import {assertActiveClass} from "../_shared/permissions.ts";
import {tryConsumeRateLimit} from "../_shared/rate-limit.ts";
import {writeAudit} from "../_shared/audit.ts";
import {json,preflight,errorResponse,readJson} from "../_shared/http.ts";
import {assertUuid,clean} from "../_shared/validation.ts";

async function cleanupCreatedClass(admin:any,classId:string){
  const {error}=await admin.from("classes").delete().eq("id",classId);
  if(error)console.error("admin-manage-classes rollback cleanup failed",error);
}

async function exactCount(admin:any,table:string,classId:string,configure?:(query:any)=>any){
  let query=admin.from(table).select("*",{count:"exact",head:true}).eq("class_id",classId);
  if(configure)query=configure(query);
  const {count,error}=await query;
  if(error)throw error;
  return count||0;
}

async function classUsage(admin:any,classId:string){
  const [profileCount,learnerCount,registrationCount,notificationCount,aiFeedbackCount,activeTeacherCount]=await Promise.all([
    exactCount(admin,"profiles",classId),
    exactCount(admin,"profiles",classId,(q:any)=>q.eq("active",true).in("role",["student","monitor"])),
    exactCount(admin,"registrations",classId),
    exactCount(admin,"teacher_notifications",classId),
    exactCount(admin,"ai_review_feedback",classId),
    exactCount(admin,"class_teachers",classId,(q:any)=>q.eq("active",true))
  ]);
  const deleteBlockers:string[]=[];
  if(profileCount>0)deleteBlockers.push(`${profileCount} hồ sơ tài khoản`);
  if(registrationCount>0)deleteBlockers.push(`${registrationCount} đăng ký`);
  if(notificationCount>0)deleteBlockers.push(`${notificationCount} thông báo giáo viên`);
  if(aiFeedbackCount>0)deleteBlockers.push(`${aiFeedbackCount} phản hồi AI`);
  if(activeTeacherCount>0)deleteBlockers.push(`${activeTeacherCount} phân công giáo viên`);
  return {
    profileCount,
    learnerCount,
    registrationCount,
    notificationCount,
    aiFeedbackCount,
    activeTeacherCount,
    canDelete:deleteBlockers.length===0,
    deleteBlockers
  };
}

async function ensureCanDeactivateClass(admin:any,classId:string){
  const {learnerCount}=await classUsage(admin,classId);
  if(learnerCount>0){
    throw Object.assign(new Error("Hãy chuyển hoặc khóa học sinh/cán sự trước khi khóa lớp."),{
      status:409,code:"ACTIVE_LEARNERS_EXIST"
    });
  }
}

async function loadClass(admin:any,classId:string){
  const {data,error}=await admin.from("classes")
    .select("id,school_year_id,code,name,active,created_at,updated_at")
    .eq("id",classId).maybeSingle();
  if(error)throw error;
  if(!data)throw Object.assign(new Error("Không tìm thấy lớp"),{status:404,code:"CLASS_NOT_FOUND"});
  return data;
}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return preflight(req);
  if(req.method!=="POST")return json(req,405,{ok:false,error:"Method not allowed"});
  try{
    const admin=createAdminClient();
    const actor=await requireActor(req,admin);
    requireRootAdmin(actor);
    const rate=await tryConsumeRateLimit(admin,actor.id,"admin_manage_classes",60,600);
    if(rate.ok===false)return json(req,rate.status,rate.body);

    const body=await readJson(req);
    const action=String(body?.action||"list");

    if(action==="list"){
      const [classes,teachers,assignments,schoolYears,weeks,periods]=await Promise.all([
        admin.from("classes").select("id,school_year_id,code,name,active,created_at,updated_at").order("code"),
        admin.from("profiles").select("id,student_code,full_name,active").eq("role","teacher").order("full_name"),
        admin.from("class_teachers").select("class_id,teacher_id,active,assigned_at"),
        admin.from("school_years").select("id,name,start_date,end_date,is_active").order("start_date",{ascending:false}),
        admin.from("weeks").select("id,school_year_id,week_number,start_date,end_date,status").order("week_number"),
        admin.from("school_year_periods").select("school_year_id,period_number,start_time,end_time").order("school_year_id").order("period_number")
      ]);
      for(const result of [classes,teachers,assignments,schoolYears,weeks,periods])if(result.error)throw result.error;
      const enriched=await Promise.all((classes.data||[]).map(async(row:any)=>({
        ...row,
        ...(await classUsage(admin,row.id))
      })));
      return json(req,200,{ok:true,classes:enriched,teachers:teachers.data||[],assignments:assignments.data||[],schoolYears:schoolYears.data||[],weeks:weeks.data||[],periods:periods.data||[]});
    }

    if(action==="create_school_year"){
      const name=clean(body?.name,40);
      const startDate=String(body?.startDate||"");
      const endDate=String(body?.endDate||"");
      const setActive=body?.setActive===true;
      if(!name||!/^\d{4}-\d{2}-\d{2}$/.test(startDate)||!/^\d{4}-\d{2}-\d{2}$/.test(endDate)){
        throw Object.assign(new Error("Thông tin năm học không hợp lệ"),{status:400,code:"INVALID_SCHOOL_YEAR"});
      }
      const {data,error}=await admin.rpc("admin_create_school_year",{
        p_actor_id:actor.id,p_name:name,p_start_date:startDate,p_end_date:endDate,p_set_active:setActive
      });
      if(error)throw error;
      const schoolYearId=String(data||"");
      await writeAudit(admin,{actorId:actor.id,action:"ADMIN_CREATE_SCHOOL_YEAR",entityType:"school_year",entityId:schoolYearId,newData:{name,startDate,endDate,setActive}});
      return json(req,200,{ok:true,schoolYearId});
    }

    if(action==="set_active_school_year"){
      const schoolYearId=assertUuid(body?.schoolYearId,"schoolYearId");
      const {data:before,error:beforeError}=await admin.from("school_years").select("id,name,is_active").eq("id",schoolYearId).maybeSingle();
      if(beforeError)throw beforeError;
      if(!before)throw Object.assign(new Error("Không tìm thấy năm học"),{status:404,code:"SCHOOL_YEAR_NOT_FOUND"});
      const {error}=await admin.rpc("admin_set_active_school_year",{p_actor_id:actor.id,p_school_year_id:schoolYearId});
      if(error)throw error;
      await writeAudit(admin,{actorId:actor.id,action:"ADMIN_SET_ACTIVE_SCHOOL_YEAR",entityType:"school_year",entityId:schoolYearId,oldData:{active:before.is_active},newData:{active:true,name:before.name}});
      return json(req,200,{ok:true,schoolYearId});
    }


    if(action==="update_school_year_periods"){
      const schoolYearId=assertUuid(body?.schoolYearId,"schoolYearId");
      const periods=Array.isArray(body?.periods)?body.periods:[];
      if(periods.length===0||periods.length>20)throw Object.assign(new Error("Khung giờ tiết học không hợp lệ"),{status:400,code:"INVALID_PERIODS"});
      const normalized=periods.map((row:any)=>({number:Number(row?.number),start:String(row?.start||""),end:String(row?.end||"")}));
      if(normalized.some((row:any)=>!Number.isInteger(row.number)||row.number<1||row.number>20||!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(row.start)||!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(row.end)||row.start>=row.end)){
        throw Object.assign(new Error("Khung giờ tiết học không hợp lệ"),{status:400,code:"INVALID_PERIODS"});
      }
      const ordered=[...normalized].sort((a:any,b:any)=>a.start.localeCompare(b.start));
      for(let i=1;i<ordered.length;i++)if(ordered[i].start<ordered[i-1].end)throw Object.assign(new Error("Các tiết học không được chồng lấn thời gian"),{status:400,code:"PERIODS_OVERLAP"});
      const {error}=await admin.rpc("admin_replace_school_year_periods",{p_actor_id:actor.id,p_school_year_id:schoolYearId,p_periods:normalized});
      if(error)throw error;
      await writeAudit(admin,{actorId:actor.id,action:"ADMIN_UPDATE_SCHOOL_YEAR_PERIODS",entityType:"school_year",entityId:schoolYearId,newData:{periods:normalized}});
      return json(req,200,{ok:true,schoolYearId});
    }

    if(action==="update_school_year_week"){
      const weekId=assertUuid(body?.weekId,"weekId");
      const startDate=String(body?.startDate||"");
      const endDate=String(body?.endDate||"");
      if(!/^\d{4}-\d{2}-\d{2}$/.test(startDate)||!/^\d{4}-\d{2}-\d{2}$/.test(endDate)||endDate<startDate){
        throw Object.assign(new Error("Khoảng ngày của tuần không hợp lệ"),{status:400,code:"INVALID_WEEK_RANGE"});
      }
      const {data:before,error:beforeError}=await admin.from("weeks").select("id,school_year_id,week_number,start_date,end_date").eq("id",weekId).maybeSingle();
      if(beforeError)throw beforeError;
      if(!before)throw Object.assign(new Error("Không tìm thấy tuần"),{status:404,code:"WEEK_NOT_FOUND"});
      const {data,error}=await admin.from("weeks").update({start_date:startDate,end_date:endDate}).eq("id",weekId).select("id,school_year_id,week_number,start_date,end_date,status").single();
      if(error)throw error;
      await writeAudit(admin,{actorId:actor.id,action:"ADMIN_UPDATE_SCHOOL_YEAR_WEEK",entityType:"week",entityId:weekId,oldData:{startDate:before.start_date,endDate:before.end_date},newData:{startDate,endDate,weekNumber:before.week_number}});
      return json(req,200,{ok:true,week:data});
    }

    if(action==="create_class"){
      const code=clean(body?.code,40).toUpperCase();
      const name=clean(body?.name||code,120);
      if(!code||!name)throw Object.assign(new Error("Tên/mã lớp không hợp lệ"),{status:400,code:"INVALID_CLASS"});

      let schoolYearId=String(body?.schoolYearId||"");
      if(!schoolYearId){
        const {data,error}=await admin.from("school_years").select("id").eq("is_active",true).limit(1).maybeSingle();
        if(error)throw error;
        schoolYearId=data?.id||"";
      }
      assertUuid(schoolYearId,"schoolYearId");

      const {data,error}=await admin.from("classes")
        .insert({school_year_id:schoolYearId,code,name,active:true,created_by:actor.id})
        .select().single();
      if(error)throw error;

      try{
        const {error:settingsError}=await admin.from("class_settings").insert({class_id:data.id,updated_by:actor.id});
        if(settingsError)throw settingsError;

        const {data:weeks,error:weekError}=await admin.from("weeks")
          .select("id,status,deadline_mode,registration_deadline,note")
          .eq("school_year_id",schoolYearId);
        if(weekError)throw weekError;

        if(weeks?.length){
          const {error:classWeeksError}=await admin.from("class_weeks").insert(weeks.map((w:any)=>({
            class_id:data.id,
            week_id:w.id,
            status:w.status,
            deadline_mode:w.deadline_mode||"per_session_20",
            registration_deadline:w.registration_deadline,
            note:w.note,
            updated_by:actor.id
          })));
          if(classWeeksError)throw classWeeksError;
        }
      }catch(error){
        await cleanupCreatedClass(admin,data.id);
        throw error;
      }

      await writeAudit(admin,{actorId:actor.id,classId:data.id,action:"ADMIN_CREATE_CLASS",entityType:"class",entityId:data.id,newData:{code,name}});
      return json(req,200,{ok:true,class:data});
    }

    if(action==="update_class"){
      const classId=assertUuid(body?.classId,"classId");
      const before=await loadClass(admin,classId);
      const patch:any={updated_at:new Date().toISOString()};
      if(body?.code!==undefined){
        patch.code=clean(body.code,40).toUpperCase();
        if(!patch.code)throw Object.assign(new Error("Mã lớp không hợp lệ"),{status:400,code:"INVALID_CLASS_CODE"});
      }
      if(body?.name!==undefined){
        patch.name=clean(body.name,120);
        if(!patch.name)throw Object.assign(new Error("Tên lớp không hợp lệ"),{status:400,code:"INVALID_CLASS_NAME"});
      }
      if(body?.active!==undefined){
        patch.active=body.active===true;
        if(patch.active===false)await ensureCanDeactivateClass(admin,classId);
      }
      const {data,error}=await admin.from("classes").update(patch).eq("id",classId).select().single();
      if(error)throw error;
      if(patch.code&&patch.code!==before.code){
        const {error:profileError}=await admin.from("profiles")
          .update({class_name:patch.code})
          .eq("class_id",classId)
          .in("role",["student","monitor"]);
        if(profileError)throw profileError;
      }
      await writeAudit(admin,{
        actorId:actor.id,
        classId,
        action:"ADMIN_UPDATE_CLASS",
        entityType:"class",
        entityId:classId,
        oldData:{code:before.code,name:before.name,active:before.active},
        newData:{code:data.code,name:data.name,active:data.active}
      });
      return json(req,200,{ok:true,class:data});
    }

    if(action==="assign_teacher"||action==="unassign_teacher"){
      const classId=assertUuid(body?.classId,"classId");
      const teacherId=assertUuid(body?.teacherId,"teacherId");
      const active=action==="assign_teacher";
      if(active)await assertActiveClass(admin,classId);
      const {data:teacher,error:teacherError}=await admin.from("profiles")
        .select("id,role,active").eq("id",teacherId).single();
      if(teacherError)throw teacherError;
      if(teacher.role!=="teacher"||teacher.active!==true){
        throw Object.assign(new Error("Chỉ có thể phân quyền giáo viên đang hoạt động"),{status:409,code:"TEACHER_INACTIVE"});
      }
      const {error}=await admin.from("class_teachers").upsert({
        class_id:classId,teacher_id:teacherId,active,assigned_by:actor.id,updated_at:new Date().toISOString()
      },{onConflict:"class_id,teacher_id"});
      if(error)throw error;
      await writeAudit(admin,{
        actorId:actor.id,
        classId,
        action:active?"ADMIN_ASSIGN_TEACHER":"ADMIN_UNASSIGN_TEACHER",
        entityType:"class_teacher",
        entityId:teacherId,
        newData:{classId,active}
      });
      return json(req,200,{ok:true});
    }

    if(action==="transfer_student"){
      const classId=assertUuid(body?.classId,"classId");
      const userId=assertUuid(body?.userId,"userId");
      await assertActiveClass(admin,classId);
      const targetClass=await loadClass(admin,classId);
      const {data:target,error:targetError}=await admin.from("profiles")
        .select("id,role,class_id,class_name,active").eq("id",userId).single();
      if(targetError)throw targetError;
      if(!["student","monitor"].includes(target.role)){
        throw Object.assign(new Error("Chỉ chuyển lớp học sinh/cán sự"),{status:400,code:"TARGET_NOT_LEARNER"});
      }
      if(target.active!==true){
        throw Object.assign(new Error("Chỉ chuyển lớp tài khoản đang hoạt động"),{status:409,code:"TARGET_INACTIVE"});
      }
      const {error}=await admin.from("profiles")
        .update({class_id:classId,class_name:targetClass.code})
        .eq("id",userId);
      if(error)throw error;
      await writeAudit(admin,{
        actorId:actor.id,
        classId,
        action:"ADMIN_TRANSFER_STUDENT",
        entityType:"profile",
        entityId:userId,
        oldData:{classId:target.class_id,classCode:target.class_name},
        newData:{classId,classCode:targetClass.code}
      });
      return json(req,200,{ok:true});
    }

    if(action==="delete_class"){
      const classId=assertUuid(body?.classId,"classId");
      const before=await loadClass(admin,classId);
      const usage=await classUsage(admin,classId);
      if(!usage.canDelete){
        throw Object.assign(new Error(`Không thể xóa lớp vì còn dữ liệu: ${usage.deleteBlockers.join(", ")}.`),{
          status:409,code:"CLASS_NOT_EMPTY",details:{deleteBlockers:usage.deleteBlockers}
        });
      }
      await writeAudit(admin,{
        actorId:actor.id,
        classId,
        action:"ADMIN_DELETE_CLASS",
        entityType:"class",
        entityId:classId,
        oldData:{code:before.code,name:before.name,active:before.active}
      });
      const {error}=await admin.from("classes").delete().eq("id",classId);
      if(error)throw error;
      return json(req,200,{ok:true,deletedClassId:classId});
    }

    throw Object.assign(new Error("Thao tác lớp không hợp lệ"),{status:400,code:"INVALID_ACTION"});
  }catch(error){
    return errorResponse(req,error);
  }
});
