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


function validateTimetableConfig(raw:any){
  if(!raw||typeof raw!=="object"||Array.isArray(raw))throw Object.assign(new Error("Cấu hình mẫu TKB không hợp lệ"),{status:400,code:"INVALID_TIMETABLE_CONFIG"});
  const config={...raw};
  const time=(value:any)=>value===null||value===""?null:String(value);
  for(const key of ["morningStart","morningEnd","afternoonStart","afternoonEnd"]){
    const value=time(config[key]);
    if(value!==null&&!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value))throw Object.assign(new Error(`Giờ ${key} không hợp lệ`),{status:400,code:"INVALID_TIMETABLE_TIME"});
    config[key]=value;
  }
  {
    const value=Number(config.defaultPeriodMinutes);
    if(!Number.isInteger(value)||value<1||value>240)throw Object.assign(new Error("Thời lượng defaultPeriodMinutes không hợp lệ"),{status:400,code:"INVALID_TIMETABLE_DURATION"});
    config.defaultPeriodMinutes=value;
  }
  for(const key of ["shortBreakMinutes","longBreakMinutes"]){
    const value=Number(config[key]);
    if(!Number.isInteger(value)||value<0||value>240)throw Object.assign(new Error(`Thời lượng ${key} không hợp lệ`),{status:400,code:"INVALID_TIMETABLE_DURATION"});
    config[key]=value;
  }
  for(const key of ["morningLongBreakEnabled","afternoonLongBreakEnabled"])config[key]=config[key]!==false;
  for(const key of ["morningLongBreakAfterPeriod","afternoonLongBreakAfterPeriod"]){
    const fallback=key.startsWith("morning")?2:7;
    const value=Number(config[key]??fallback);
    if(!Number.isInteger(value)||value<1||value>40)throw Object.assign(new Error(`Vị trí ${key} không hợp lệ`),{status:400,code:"INVALID_TIMETABLE_BREAK_POSITION"});
    config[key]=value;
  }
  config.periodOverrides=Array.isArray(config.periodOverrides)?config.periodOverrides:[];
  config.breakRules=Array.isArray(config.breakRules)?config.breakRules:[];
  config.dayOverrides=config.dayOverrides&&typeof config.dayOverrides==="object"&&!Array.isArray(config.dayOverrides)?config.dayOverrides:{};
  return config;
}

function normalizeGeneratedDays(raw:any){
  if(!Array.isArray(raw)||raw.length===0||raw.length>7)throw Object.assign(new Error("Preview TKB theo ngày không hợp lệ"),{status:400,code:"INVALID_TIMETABLE_DAYS"});
  const seen=new Set<number>();
  return raw.map((day:any)=>{
    const weekday=Number(day?.weekday);
    if(!Number.isInteger(weekday)||weekday<1||weekday>7||seen.has(weekday))throw Object.assign(new Error("Thứ trong tuần không hợp lệ hoặc bị trùng"),{status:400,code:"INVALID_TIMETABLE_WEEKDAY"});
    seen.add(weekday);
    const periods=Array.isArray(day?.periods)?day.periods:[];
    if(periods.length===0||periods.length>40)throw Object.assign(new Error("Mỗi ngày phải có ít nhất một tiết hợp lệ"),{status:400,code:"INVALID_TIMETABLE_PERIODS"});
    const periodSeen=new Set<number>();
    const normalized=periods.map((row:any)=>{
      const number=Number(row?.number??row?.period_number);
      const start=String(row?.start??row?.start_time??"").slice(0,5);
      const end=String(row?.end??row?.end_time??"").slice(0,5);
      const session=String(row?.session||"day");
      if(!Number.isInteger(number)||number<1||number>40||periodSeen.has(number)||!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(start)||!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(end)||start>=end||!["morning","afternoon","day"].includes(session)){
        throw Object.assign(new Error("Tiết được sinh từ mẫu TKB không hợp lệ"),{status:400,code:"INVALID_GENERATED_PERIOD"});
      }
      periodSeen.add(number);return{number,start,end,session};
    }).sort((a:any,b:any)=>a.number-b.number);
    return{weekday,periods:normalized};
  });
}

async function insertVersionPeriods(admin:any,versionId:string,generatedDays:any[]){
  const rows=generatedDays.flatMap(day=>day.periods.map((row:any)=>({version_id:versionId,weekday:day.weekday,period_number:row.number,start_time:row.start,end_time:row.end,session:row.session})));
  const {error}=await admin.from("timetable_version_periods").insert(rows);if(error)throw error;
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
      const [classes,teachers,assignments,schoolYears,weeks,periods,timetableTemplates,timetableVersions,timetableAssignments]=await Promise.all([
        admin.from("classes").select("id,school_year_id,code,name,active,created_at,updated_at").order("code"),
        admin.from("profiles").select("id,student_code,full_name,active").eq("role","teacher").order("full_name"),
        admin.from("class_teachers").select("class_id,teacher_id,active,assigned_at"),
        admin.from("school_years").select("id,name,start_date,end_date,is_active").order("start_date",{ascending:false}),
        admin.from("weeks").select("id,school_year_id,week_number,start_date,end_date,status").order("week_number"),
        admin.from("school_year_periods").select("school_year_id,period_number,start_time,end_time").order("school_year_id").order("period_number"),
        admin.from("timetable_templates").select("id,school_year_id,name,active,created_at,updated_at").order("name"),
        admin.from("timetable_template_versions").select("id,template_id,version_number,config,created_at").order("version_number",{ascending:false}),
        admin.from("class_timetable_assignments").select("id,class_id,school_year_id,template_version_id,effective_from,effective_to,active,created_at,updated_at").order("effective_from",{ascending:false})
      ]);
      for(const result of [classes,teachers,assignments,schoolYears,weeks,periods,timetableTemplates,timetableVersions,timetableAssignments])if(result.error)throw result.error;
      const versions=timetableVersions.data||[];
      const enrichedTemplates=(timetableTemplates.data||[]).map((row:any)=>{
        const latest=versions.filter((v:any)=>v.template_id===row.id).sort((a:any,b:any)=>Number(b.version_number)-Number(a.version_number))[0];
        return{...row,latest_version_id:latest?.id||null,latest_version_number:Number(latest?.version_number||0)};
      });
      const enriched=await Promise.all((classes.data||[]).map(async(row:any)=>({...row,...(await classUsage(admin,row.id))})));
      return json(req,200,{ok:true,classes:enriched,teachers:teachers.data||[],assignments:assignments.data||[],schoolYears:schoolYears.data||[],weeks:weeks.data||[],periods:periods.data||[],timetableTemplates:enrichedTemplates,timetableVersions:versions,timetableAssignments:timetableAssignments.data||[]});
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


    if(action==="create_timetable_template"){
      const schoolYearId=assertUuid(body?.schoolYearId,"schoolYearId");
      const name=clean(body?.name,120);if(!name)throw Object.assign(new Error("Tên mẫu TKB không hợp lệ"),{status:400,code:"INVALID_TIMETABLE_NAME"});
      const config=validateTimetableConfig(body?.config);const generatedDays=normalizeGeneratedDays(body?.generatedDays);
      const {data:year,error:yearError}=await admin.from("school_years").select("id,name").eq("id",schoolYearId).maybeSingle();if(yearError)throw yearError;if(!year)throw Object.assign(new Error("Không tìm thấy năm học"),{status:404,code:"SCHOOL_YEAR_NOT_FOUND"});
      const {data:template,error:templateError}=await admin.from("timetable_templates").insert({school_year_id:schoolYearId,name,active:true,created_by:actor.id,updated_at:new Date().toISOString()}).select().single();if(templateError)throw templateError;
      try{
        const {data:version,error:versionError}=await admin.from("timetable_template_versions").insert({template_id:template.id,version_number:1,config,created_by:actor.id}).select().single();if(versionError)throw versionError;
        await insertVersionPeriods(admin,version.id,generatedDays);
        await writeAudit(admin,{actorId:actor.id,action:"ADMIN_CREATE_TIMETABLE",entityType:"timetable_template",entityId:template.id,newData:{schoolYearId,name,version:1}});
        return json(req,200,{ok:true,template,version});
      }catch(error){await admin.from("timetable_templates").delete().eq("id",template.id);throw error;}
    }

    if(action==="save_timetable_version"){
      const templateId=assertUuid(body?.templateId,"templateId");const config=validateTimetableConfig(body?.config);const generatedDays=normalizeGeneratedDays(body?.generatedDays);
      const {data:template,error:templateError}=await admin.from("timetable_templates").select("id,school_year_id,name,active").eq("id",templateId).maybeSingle();if(templateError)throw templateError;if(!template)throw Object.assign(new Error("Không tìm thấy mẫu TKB"),{status:404,code:"TIMETABLE_TEMPLATE_NOT_FOUND"});
      const {data:latest,error:latestError}=await admin.from("timetable_template_versions").select("version_number").eq("template_id",templateId).order("version_number",{ascending:false}).limit(1).maybeSingle();if(latestError)throw latestError;
      const versionNumber=Number(latest?.version_number||0)+1;
      const {data:version,error:versionError}=await admin.from("timetable_template_versions").insert({template_id:templateId,version_number:versionNumber,config,created_by:actor.id}).select().single();if(versionError)throw versionError;
      try{await insertVersionPeriods(admin,version.id,generatedDays);}catch(error){await admin.from("timetable_template_versions").delete().eq("id",version.id);throw error;}
      await admin.from("timetable_templates").update({updated_at:new Date().toISOString()}).eq("id",templateId);
      await writeAudit(admin,{actorId:actor.id,action:"ADMIN_SAVE_TIMETABLE_VERSION",entityType:"timetable_template",entityId:templateId,newData:{version:versionNumber,name:template.name}});
      return json(req,200,{ok:true,version});
    }

    if(action==="assign_timetable_template"){
      const classId=assertUuid(body?.classId,"classId"),schoolYearId=assertUuid(body?.schoolYearId,"schoolYearId"),templateVersionId=assertUuid(body?.templateVersionId,"templateVersionId");
      const effectiveFrom=String(body?.effectiveFrom||""),effectiveTo=String(body?.effectiveTo||"");
      if(!/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom)||!/^\d{4}-\d{2}-\d{2}$/.test(effectiveTo)||effectiveTo<effectiveFrom)throw Object.assign(new Error("Khoảng hiệu lực TKB không hợp lệ"),{status:400,code:"INVALID_TIMETABLE_RANGE"});
      const [cls,version,year]=await Promise.all([
        admin.from("classes").select("id,school_year_id,code").eq("id",classId).maybeSingle(),
        admin.from("timetable_template_versions").select("id,template_id,timetable_templates!inner(school_year_id,name)").eq("id",templateVersionId).maybeSingle(),
        admin.from("school_years").select("start_date,end_date").eq("id",schoolYearId).maybeSingle()
      ]);
      if(cls.error)throw cls.error;if(version.error)throw version.error;if(year.error)throw year.error;if(!cls.data||!version.data||!year.data)throw Object.assign(new Error("Không tìm thấy lớp, năm học hoặc phiên bản TKB"),{status:404,code:"TIMETABLE_ASSIGNMENT_TARGET_NOT_FOUND"});
      if(cls.data.school_year_id!==schoolYearId)throw Object.assign(new Error("Lớp không thuộc năm học đã chọn"),{status:409,code:"CLASS_YEAR_MISMATCH"});
      const templateYear=(version.data as any).timetable_templates?.school_year_id;if(templateYear!==schoolYearId)throw Object.assign(new Error("Mẫu TKB không thuộc năm học của lớp"),{status:409,code:"TIMETABLE_YEAR_MISMATCH"});
      if(effectiveFrom<year.data.start_date||effectiveTo>year.data.end_date)throw Object.assign(new Error("Khoảng hiệu lực TKB phải nằm trong năm học đã chọn"),{status:409,code:"TIMETABLE_RANGE_OUTSIDE_SCHOOL_YEAR"});
      const {data,error}=await admin.rpc("admin_assign_timetable_version",{p_actor_id:actor.id,p_class_id:classId,p_school_year_id:schoolYearId,p_template_version_id:templateVersionId,p_effective_from:effectiveFrom,p_effective_to:effectiveTo});if(error)throw error;
      const assignmentId=String(data||"");
      await writeAudit(admin,{actorId:actor.id,classId,action:"ADMIN_ASSIGN_TIMETABLE",entityType:"class_timetable_assignment",entityId:assignmentId,newData:{templateVersionId,effectiveFrom,effectiveTo,historyPreserved:true}});
      return json(req,200,{ok:true,assignmentId});
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
        const {data:year,error:yearError}=await admin.from("school_years").select("start_date,end_date").eq("id",schoolYearId).maybeSingle();if(yearError)throw yearError;
        const {data:templates,error:templateError}=await admin.from("timetable_templates").select("id").eq("school_year_id",schoolYearId).eq("active",true).order("created_at").limit(1);if(templateError)throw templateError;
        const templateId=templates?.[0]?.id;
        if(templateId&&year){
          const {data:version,error:versionError}=await admin.from("timetable_template_versions").select("id").eq("template_id",templateId).order("version_number",{ascending:false}).limit(1).maybeSingle();if(versionError)throw versionError;
          if(version?.id){const {error:assignError}=await admin.rpc("admin_assign_timetable_version",{p_actor_id:actor.id,p_class_id:data.id,p_school_year_id:schoolYearId,p_template_version_id:version.id,p_effective_from:year.start_date,p_effective_to:year.end_date});if(assignError)throw assignError;}
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
