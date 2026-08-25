(() => {
  const cfg = window.APP_CONFIG || {};
  const enabled = () =>
    cfg.mode === "supabase" &&
    cfg.projectUrl &&
    cfg.publishableKey &&
    !cfg.projectUrl.includes("YOUR_PROJECT") &&
    !cfg.publishableKey.includes("YOUR_PUBLISHABLE");

  let client = null;
  let realtimeChannel=null;
  let snapshot = null;
  let syncQueue = Promise.resolve();

  const deepClone = v => JSON.parse(JSON.stringify(v));
  const stable = v => JSON.stringify(v);
  const isUuid = v => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v || "");
  const REGISTRATION_COLUMNS=[
    "id","student_id","week_id","weekday","period_number","content","note","status",
    "teacher_comment","approval_source","auto_review_reason","ai_review_status","ai_decision",
    "ai_category","ai_confidence","ai_revision_status","ai_revision_confidence","ai_reason","ai_model","ai_reviewed_at","ai_review_count",
    "is_emergency","emergency_reason","emergency_requested_at","uses_electronic_device",
    "device_detection_source","device_detection_confidence","revision_overdue_at","updated_at","approved_at","class_id"
  ].join(",");
  const WEEK_OVERRIDE_COLUMNS="id,class_id,week_id,weekday,period_number,is_study_period,reason";

  const sessionAuthStorage={
    getItem:key=>window.sessionStorage.getItem(key),
    setItem:(key,value)=>window.sessionStorage.setItem(key,value),
    removeItem:key=>window.sessionStorage.removeItem(key)
  };

  function clearLegacyPersistentAuth(){
    try{
      const projectRef=new URL(cfg.projectUrl).hostname.split(".")[0];
      if(projectRef){
        localStorage.removeItem(`sb-${projectRef}-auth-token`);
      }
    }catch{}
  }

  function requireClient(){
    if(!enabled()) throw new Error("Supabase mode chưa được cấu hình.");
    if(!window.supabase) throw new Error("Không tải được thư viện Supabase JS.");

    if(!client){
      // V8.2.3: không giữ token đăng nhập trong localStorage.
      // sessionStorage sống qua F5 nhưng bị xóa khi tab/cửa sổ kết thúc.
      clearLegacyPersistentAuth();

      client=window.supabase.createClient(
        cfg.projectUrl,
        cfg.publishableKey,
        {
          auth:{
            storage:sessionAuthStorage,
            persistSession:true,
            autoRefreshToken:true,
            detectSessionInUrl:false
          }
        }
      );
    }

    return client;
  }

  async function init(){
    if (!enabled()) return null;
    return requireClient();
  }

  function normalizeLoginCode(code){
    return String(code||"").trim().toLowerCase().replace(/[^a-z0-9._-]/g,"");
  }

  function codeToEmail(code){
    const clean=normalizeLoginCode(code);
    if(!/^[a-z0-9._-]{2,32}$/.test(clean)){
      throw new Error("Mã đăng nhập không hợp lệ.");
    }
    const domain=String(cfg.loginDomain||"users.example.com").trim().toLowerCase();
    return `${clean}@${domain}`;
  }

  function assertPasswordPolicy(password,{allowEmpty=false}={}){
    const value=String(password||"");
    if(allowEmpty&&!value)return value;
    if(value.length<8||!/\p{L}/u.test(value)||!/\d/u.test(value)){
      throw new Error("Mật khẩu cần ít nhất 8 ký tự và có cả chữ lẫn số.");
    }
    return value;
  }

  async function signInCode(code, password){
    const sb = requireClient();
    const email=codeToEmail(code);
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data.user;
  }

  async function changeOwnPassword(currentPassword,newPassword){
    const next=assertPasswordPolicy(newPassword);
    const sb=requireClient();
    const {data:currentData,error:currentError}=await sb.auth.getUser();
    if(currentError) throw currentError;
    const email=currentData?.user?.email;
    if(!email) throw new Error("Không xác định được tài khoản hiện tại.");
    const {error:reauthError}=await sb.auth.signInWithPassword({
      email,
      password:String(currentPassword||"")
    });
    if(reauthError){
      const error=new Error("Mật khẩu hiện tại không đúng.");
      error.code="CURRENT_PASSWORD_INVALID";
      throw error;
    }
    const { data,error }=await sb.auth.updateUser({password:next});
    if(error) throw error;
    return data.user;
  }

  async function edgeFunctionErrorMessage(error,fallback="Edge Function bị lỗi"){
    if(!error)return fallback;
    let message=String(error?.message||fallback);

    try{
      const ctx=error?.context;
      if(ctx){
        const response=typeof ctx.clone==="function"?ctx.clone():ctx;
        let body=null;

        try{
          body=await response.json();
        }catch(_){
          try{
            const text=await response.text();
            if(text)body={message:text};
          }catch(__){}
        }

        const detail=body?.error||body?.message||body?.msg||body?.code;
        if(detail)message=String(detail);

        const status=response?.status;
        const sbCode=response?.headers?.get?.("sb-error-code");
        const parts=[];
        if(status)parts.push(`HTTP ${status}`);
        if(sbCode)parts.push(sbCode);
        if(parts.length)message+=` [${parts.join(" · ")}]`;
      }
    }catch(parseError){
      console.warn("Không đọc được nội dung lỗi Edge Function",parseError);
    }

    return message;
  }

  async function invokeEdgeFunction(name,body,fallback){
    const sb=requireClient();
    const {data,error}=await sb.functions.invoke(name,{body:body||{}});

    if(error){
      const wrapped=new Error(await edgeFunctionErrorMessage(error,fallback));
      wrapped.code=String(error?.code||"EDGE_FUNCTION_ERROR");
      wrapped.status=Number(error?.context?.status||0)||undefined;
      wrapped.cause=error;
      throw wrapped;
    }

    if(!data?.ok){
      const wrapped=new Error(data?.error||data?.message||fallback);
      wrapped.code=String(data?.code||"EDGE_FUNCTION_ERROR");
      throw wrapped;
    }

    return data;
  }

  async function getDailyQuote(){
    return invokeEdgeFunction(
      "quote-feed",
      {},
      "Không tải được danh ngôn hôm nay."
    );
  }

  async function teacherResetPassword(userId,newPassword){
    const password=assertPasswordPolicy(newPassword);
    return invokeEdgeFunction(
      "admin-reset-password",
      {userId,newPassword:password},
      "Không đặt lại được mật khẩu."
    );
  }

  async function teacherDeleteUser(userId,confirmCode){
    return invokeEdgeFunction(
      "admin-delete-user",
      {userId,confirmCode:String(confirmCode||"").trim().toUpperCase()},
      "Không xóa được tài khoản."
    );
  }

  async function teacherListUsers(classId=null){
    return invokeEdgeFunction(
      "admin-list-users",
      classId?{classId}:{},
      "Không tải được danh sách tài khoản."
    );
  }

  async function teacherUpdateUser(userId,changes){
    return invokeEdgeFunction(
      "admin-update-user",
      {
        userId,
        changeCode:changes?.changeCode===true,
        code:String(changes?.code||"").trim(),
        fullName:String(changes?.fullName||"").trim(),
        role:String(changes?.role||"student"),
        classId:changes?.classId||null,
        active:changes?.active!==false
      },
      "Không cập nhật được tài khoản."
    );
  }

  async function teacherCreateUser(changes){
    return invokeEdgeFunction(
      "admin-create-user",
      {
        code:String(changes?.code||"").trim().toUpperCase(),
        fullName:String(changes?.fullName||"").trim(),
        role:String(changes?.role||"student"),
        classId:changes?.classId||null,
        password:assertPasswordPolicy(changes?.password,{allowEmpty:true})
      },
      "Không tạo được tài khoản."
    );
  }

  async function adminManageClasses(action,payload={}){
    return invokeEdgeFunction(
      "admin-manage-classes",
      {action,...payload},
      "Không thực hiện được thao tác quản trị lớp."
    );
  }

  async function requestRegistrationRevision(registrationId,teacherComment){
    const sb=requireClient();
    const comment=String(teacherComment||"").trim();
    if(!isUuid(registrationId)) throw new Error("Đăng ký không hợp lệ.");
    if(!comment) throw new Error("Vui lòng nhập nội dung yêu cầu chỉnh sửa.");

    const {data,error}=await sb.rpc("request_registration_revision",{
      p_registration_id:registrationId,
      p_teacher_comment:comment
    });
    if(error) throw error;
    return data===true;
  }

  async function teacherRebaseWeeks(firstWeekStart, deadlineTime="20:00"){
    const sb=requireClient();
    if(!/^\d{4}-\d{2}-\d{2}$/.test(String(firstWeekStart||""))) throw new Error("Ngày bắt đầu tuần 1 không hợp lệ.");
    if(!/^\d{2}:\d{2}$/.test(String(deadlineTime||""))) throw new Error("Giờ deadline không hợp lệ.");

    const {data:years,error:yearErr}=await sb.from("school_years")
      .select("id,name,start_date,end_date,is_active").eq("is_active",true).limit(1);
    if(yearErr) throw yearErr;
    const year=years?.[0];
    if(!year) throw new Error("Chưa có năm học đang hoạt động.");

    const {data:weekRows,error:weekErr}=await sb.from("weeks")
      .select("*").eq("school_year_id",year.id).order("week_number");
    if(weekErr) throw weekErr;
    if(!weekRows?.length) throw new Error("Năm học chưa có tuần nào.");

    const today=dateISOInTimeZone();
    const startMs=Date.parse(`${firstWeekStart}T00:00:00Z`);
    const endMs=Date.parse(`${year.end_date}T00:00:00Z`);
    const desiredCount=Math.max(1,Math.floor((endMs-startMs)/(7*86400000))+1);
    const byNumber=new Map(weekRows.map(w=>[Number(w.week_number),w]));

    const planned=Array.from({length:desiredCount},(_,i)=>{
      const number=i+1;
      const old=byNumber.get(number)||null;
      const start=addDaysISO(firstWeekStart,i*7);
      const naturalEnd=addDaysISO(start,4);
      const end=naturalEnd>year.end_date ? year.end_date : naturalEnd;
      const deadlineDate=addDaysISO(start,-1);
      const mode=old?.deadline_mode || "per_session_20";
      return {
        id:old?.id||null,
        school_year_id:year.id,
        week_number:number,
        start_date:start,
        end_date:end,
        status:old?.status||"upcoming",
        deadline_mode:mode,
        registration_deadline:mode==="specific" && old?.registration_deadline
          ? old.registration_deadline
          : `${deadlineDate}T${deadlineTime}:00+07:00`,
        note:old?.note||null
      };
    });

    const chosen=planned.find(w=>w.start_date<=today&&addDaysISO(w.start_date,6)>=today)
      || planned.find(w=>w.start_date>today)
      || planned[planned.length-1];

    const normalized=planned.map(w=>({
      ...w,
      status:w.status==="holiday"
        ? "holiday"
        : (
            chosen && (w.week_number===chosen.week_number || w.week_number===chosen.week_number+1)
              ? "open"
              : (w.end_date<today ? "locked" : "upcoming")
          )
    }));

    let q=await sb.from("school_years").update({start_date:firstWeekStart}).eq("id",year.id);
    if(q.error) throw q.error;

    const existingRows=normalized.filter(w=>w.id).map(w=>({
      id:w.id,school_year_id:w.school_year_id,week_number:w.week_number,
      start_date:w.start_date,end_date:w.end_date,status:w.status,
      deadline_mode:w.deadline_mode,
      registration_deadline:w.registration_deadline,note:w.note
    }));
    if(existingRows.length){
      q=await sb.from("weeks").upsert(existingRows,{onConflict:"id"});
      if(q.error) throw q.error;
    }

    const newRows=normalized.filter(w=>!w.id).map(w=>({
      school_year_id:w.school_year_id,week_number:w.week_number,
      start_date:w.start_date,end_date:w.end_date,status:w.status,
      deadline_mode:w.deadline_mode,
      registration_deadline:w.registration_deadline,note:w.note
    }));
    if(newRows.length){
      q=await sb.from("weeks").insert(newRows);
      if(q.error) throw q.error;
    }

    // V8.4.0: every base week needs a class-local state row. Existing class
    // states are preserved; only missing (class_id, week_id) pairs are added.
    const [{data:allWeeks,error:allWeeksError},{data:allClasses,error:allClassesError}]=await Promise.all([
      sb.from("weeks").select("id,status,deadline_mode,registration_deadline,note").eq("school_year_id",year.id),
      sb.from("classes").select("id").eq("school_year_id",year.id)
    ]);
    if(allWeeksError)throw allWeeksError;
    if(allClassesError)throw allClassesError;
    const classWeekRows=[];
    for(const cls of allClasses||[]){
      for(const w of allWeeks||[]){
        classWeekRows.push({
          class_id:cls.id,week_id:w.id,status:w.status,
          deadline_mode:w.deadline_mode||"per_session_20",
          registration_deadline:w.registration_deadline||null,note:w.note||null,
          updated_at:new Date().toISOString()
        });
      }
    }
    if(classWeekRows.length){
      q=await sb.from("class_weeks").upsert(classWeekRows,{onConflict:"class_id,week_id",ignoreDuplicates:true});
      if(q.error)throw q.error;
    }

    snapshot=null;
    return {ok:true,currentWeekNumber:chosen?.week_number||1,createdWeeks:newRows.length};
  }

  async function emergencyRegister({weekId,dow,period,content,note,reason,usesElectronicDevice=false}){
    const data=await invokeEdgeFunction(
      "emergency-register",
      {
        weekId,
        weekday:Number(dow)+1,
        periodNumber:Number(period),
        content:String(content||"").trim(),
        note:String(note||"").trim(),
        reason:String(reason||"").trim(),
        usesElectronicDevice:usesElectronicDevice===true
      },
      "Không đăng ký bổ sung được."
    );
    return data.registration?mapReg(data.registration):null;
  }

  async function requestAiReview(registrationId){
    let lastError=null;

    for(let attempt=0;attempt<2;attempt++){
      if(attempt>0){
        await new Promise(resolve=>setTimeout(resolve,1200));
      }

      try{
        return await invokeEdgeFunction(
          "ai-review-registration",
          {registrationId},
          "AI không xử lý được đăng ký."
        );
      }catch(error){
        lastError=error;
        const status=Number(error?.status||0);

        // Lỗi quyền / payload / rate-limit không có lợi khi retry ngay.
        if([400,401,403,404,429].includes(status))break;
      }
    }

    throw lastError || new Error("AI không xử lý được đăng ký.");
  }

  async function prepareSessionAiRereview({classId,weekId,dow,period}){
    if(!isUuid(weekId)){
      throw new Error("Tuần không hợp lệ.");
    }

    const weekday=Number(dow)+1;
    const periodNumber=Number(period);

    if(!Number.isInteger(weekday)||weekday<1||weekday>5){
      throw new Error("Thứ tự ngày học không hợp lệ.");
    }
    if(!Number.isInteger(periodNumber)||periodNumber<1||periodNumber>9){
      throw new Error("Tiết học không hợp lệ.");
    }

    const sb=requireClient();
    if(!isUuid(classId))throw new Error("Lớp không hợp lệ.");
    const {data,error}=await sb.rpc("prepare_session_ai_rereview",{
      p_class_id:classId,
      p_week_id:weekId,
      p_weekday:weekday,
      p_period_number:periodNumber
    });

    if(error)throw friendlySyncError(error);

    return (data||[])
      .map(row=>String(row?.registration_id||""))
      .filter(isUuid);
  }

  async function prepareRegistrationAiRereview(registrationId){
    if(!isUuid(registrationId)){
      throw new Error("Mã đăng ký không hợp lệ.");
    }

    const sb=requireClient();
    const {data,error}=await sb.rpc("prepare_registration_ai_rereview",{
      p_registration_id:registrationId
    });

    if(error)throw friendlySyncError(error);
    if(data!==true){
      throw new Error("Đăng ký không còn phù hợp để AI duyệt lại.");
    }
    return true;
  }

  async function deleteRegistration(registrationId){
    if(!isUuid(registrationId)){
      throw new Error("Mã đăng ký không hợp lệ.");
    }

    const sb=requireClient();
    const {data,error}=await sb.rpc("delete_registration_safely",{
      p_registration_id:registrationId
    });

    if(error)throw friendlySyncError(error);
    if(data!==true){
      throw new Error("Không tìm thấy đăng ký đang hoạt động để xóa.");
    }
    return true;
  }


  async function markNotificationsRead(ids){
    const list=(ids||[]).filter(Boolean);
    if(!list.length) return;
    const sb=requireClient();
    const {error}=await sb.from("teacher_notifications").update({is_read:true}).in("id",list);
    if(error) throw error;
  }

  async function signOut(){
    await unsubscribeRealtime();
    const sb = requireClient();
    const { error } = await sb.auth.signOut();
    if (error) throw error;
  }

  function isMissingAuthSession(error){
    if(!error)return false;
    const name=String(error?.name||"");
    const code=String(error?.code||"");
    const message=String(error?.message||"");
    return (
      name==="AuthSessionMissingError"
      || code==="AuthSessionMissingError"
      || /auth session missing/i.test(message)
    );
  }

  function isInvalidStoredAuthIdentity(error){
    if(!error)return false;
    const message=String(error?.message||"");
    return /User from sub claim in JWT does not exist/i.test(message);
  }

  async function clearInvalidStoredAuthSession(sb){
    try{
      await sb.auth.signOut({scope:"local"});
    }catch{}
    try{
      const projectRef=new URL(cfg.projectUrl).hostname.split(".")[0];
      if(projectRef)sessionStorage.removeItem(`sb-${projectRef}-auth-token`);
    }catch{}
    snapshot=null;
  }

  async function authUser(){
    const sb=requireClient();
    const {data:sessionData,error:sessionError}=await sb.auth.getSession();

    if(sessionError){
      if(isMissingAuthSession(sessionError))return null;
      if(isInvalidStoredAuthIdentity(sessionError)){
        await clearInvalidStoredAuthSession(sb);
        return null;
      }
      throw sessionError;
    }
    if(!sessionData?.session)return null;

    const {data,error}=await sb.auth.getUser();
    if(error){
      if(isMissingAuthSession(error))return null;
      if(isInvalidStoredAuthIdentity(error)){
        await clearInvalidStoredAuthSession(sb);
        return null;
      }
      throw error;
    }
    return data.user||null;
  }

  function mapProfile(p){
    return {
      id:p.id,
      code:p.student_code || p.code || "",
      name:p.full_name || p.fullName || "",
      role:p.role,
      classId:p.class_id || p.classId || null,
      active:p.active !== false,
      deletedAt:p.deleted_at || p.deletedAt || null
    };
  }
  function toLocalInput(iso){
    if(!iso) return "";
    const d=new Date(iso), pad=n=>String(n).padStart(2,"0");
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  function mapWeek(w){
    return {
      id:w.id, number:w.week_number, startDate:w.start_date, endDate:w.end_date,
      status:w.status,
      deadlineMode:w.deadline_mode || "per_session_20",
      deadline:toLocalInput(w.registration_deadline),
      note:w.note || ""
    };
  }
  function mapReg(r){
    return {
      id:r.id, classId:r.class_id||null, studentId:r.student_id, weekId:r.week_id, dow:Number(r.weekday)-1,
      period:r.period_number, content:r.content, note:r.note || "", status:r.status,
      teacherComment:r.teacher_comment || "",
      approvalSource:r.approval_source || "manual",
      autoReviewReason:r.auto_review_reason || "",
      aiReviewStatus:r.ai_review_status || "not_needed",
      aiDecision:r.ai_decision || "",
      aiCategory:r.ai_category || "",
      aiConfidence:r.ai_confidence==null?null:Number(r.ai_confidence),
      aiRevisionStatus:r.ai_revision_status || "",
      aiRevisionConfidence:r.ai_revision_confidence==null?null:Number(r.ai_revision_confidence),
      aiReason:r.ai_reason || "",
      aiModel:r.ai_model || "",
      aiReviewedAt:r.ai_reviewed_at || null,
      aiReviewCount:Number(r.ai_review_count||0),
      isEmergency:r.is_emergency===true,
      emergencyReason:r.emergency_reason || "",
      emergencyRequestedAt:r.emergency_requested_at || null,
      usesElectronicDevice:r.uses_electronic_device===true,
      deviceDetectionSource:r.device_detection_source || "",
      deviceDetectionConfidence:r.device_detection_confidence==null?null:Number(r.device_detection_confidence),
      revisionOverdueAt:r.revision_overdue_at || null,
      updatedAt:r.updated_at ? new Date(r.updated_at).getTime() : Date.now(),
      approvedAt:r.approved_at ? new Date(r.approved_at).getTime() : null
    };
  }
  function dbReg(r){
    const out = {
      student_id:r.studentId, week_id:r.weekId, weekday:Number(r.dow)+1,
      period_number:Number(r.period), content:r.content, note:r.note || null,
      status:r.status, teacher_comment:r.teacherComment || null,
      uses_electronic_device:r.usesElectronicDevice===true,
      updated_at:new Date().toISOString()
    };
    if (r.status === "submitted") out.submitted_at = new Date().toISOString();
    if (r.approvedAt) out.approved_at = new Date(r.approvedAt).toISOString();
    if (isUuid(r.id)) out.id = r.id;
    return out;
  }

  function addDaysISO(iso,n){
    const d=new Date(`${iso}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate()+Number(n||0));
    return d.toISOString().slice(0,10);
  }

  function dateISOInTimeZone(date=new Date()){
    const timeZone=String(cfg.timeZone||"Asia/Ho_Chi_Minh");
    try{
      const parts=new Intl.DateTimeFormat("en-CA",{
        timeZone,year:"numeric",month:"2-digit",day:"2-digit"
      }).formatToParts(date);
      const get=t=>parts.find(p=>p.type===t)?.value;
      return `${get("year")}-${get("month")}-${get("day")}`;
    }catch{
      const y=date.getFullYear(),m=String(date.getMonth()+1).padStart(2,"0"),d=String(date.getDate()).padStart(2,"0");
      return `${y}-${m}-${d}`;
    }
  }

  function chooseCurrentWeek(weeks){
    if(!weeks?.length)return null;
    const today=dateISOInTimeZone();

    // Tuần học được neo từ Thứ Hai đến Chủ nhật.
    const exact=weeks.find(w=>w.startDate<=today && addDaysISO(w.startDate,6)>=today);
    if(exact)return exact;

    const next=weeks.find(w=>w.startDate>today);
    if(next)return next;

    return weeks[weeks.length-1];
  }

  function managerRole(role){return role==="teacher"||role==="admin";}
  const classStorageKey=userId=>`so-tu-hoc:active-class:${userId}`;

  async function loadWeekData(weekId,classId=null){
    if(!weekId) return {overrides:[],registrations:[]};
    const sb=requireClient();
    let overrideQuery=sb.from("week_schedule_overrides").select(WEEK_OVERRIDE_COLUMNS).eq("week_id",weekId);
    let regQuery=sb.from("registrations").select(REGISTRATION_COLUMNS).eq("week_id",weekId).eq("is_deleted",false);
    if(classId){overrideQuery=overrideQuery.eq("class_id",classId);regQuery=regQuery.eq("class_id",classId);}
    const [overridesRes,registrationsRes]=await Promise.all([overrideQuery,regQuery]);
    if(overridesRes.error) throw overridesRes.error;
    if(registrationsRes.error) throw registrationsRes.error;
    return {
      overrides:(overridesRes.data||[]).map(o=>({
        id:o.id,classId:o.class_id||classId,weekId:o.week_id,dow:Number(o.weekday)-1,period:o.period_number,
        active:o.is_study_period,reason:o.reason||""
      })),
      registrations:(registrationsRes.data||[]).map(mapReg)
    };
  }

  function mapClassWeek(base,row){
    const explicitSpecific=row?.deadline_mode==="specific"&&Boolean(row?.registration_deadline);
    return mapWeek({
      ...base,
      status:row?.status??base.status,
      deadline_mode:explicitSpecific?"specific":"per_session_20",
      registration_deadline:explicitSpecific?(row?.registration_deadline||null):null,
      note:row?.note??base.note
    });
  }

  function emptyMemoryStats(){return {totalFeedback:0,revisionAfterAiApprove:0,approveAfterAiManual:0,approveAfterAiRevision:0,lastFeedbackAt:null,memoryEnabled:true,candidateLimit:80,selectedLimit:25};}

  async function loadState(preferredClassId=null){
    const sb=requireClient();
    const user=await authUser();
    if(!user)return {currentUser:null,state:null};

    const {data:profile,error:profileErr}=await sb.from("profiles")
      .select("id,student_code,full_name,role,class_id,active,deleted_at")
      .eq("id",user.id).single();
    if(profileErr)throw profileErr;
    if(profile.active===false)throw new Error("Tài khoản đang bị khóa.");

    const isManager=managerRole(profile.role);
    const [yearsRes,periodsRes,classesRes]=await Promise.all([
      sb.from("school_years").select("id,name,start_date,end_date,is_active").order("start_date",{ascending:false}),
      sb.from("periods").select("period_number,start_time,end_time").order("period_number"),
      sb.from("classes").select("id,school_year_id,code,name,active").eq("active",true).order("code")
    ]);
    for(const r of [yearsRes,periodsRes,classesRes])if(r.error)throw r.error;
    const activeYear=yearsRes.data?.find(y=>y.is_active)||yearsRes.data?.[0]||null;
    const visibleClasses=(classesRes.data||[]).filter(c=>!activeYear||c.school_year_id===activeYear.id);

    let activeClassId=profile.class_id||null;
    if(isManager){
      const stored=preferredClassId||sessionStorage.getItem(classStorageKey(user.id));
      activeClassId=visibleClasses.some(c=>c.id===stored)?stored:(visibleClasses[0]?.id||null);
      if(activeClassId)sessionStorage.setItem(classStorageKey(user.id),activeClassId);
    }
    const activeClass=visibleClasses.find(c=>c.id===activeClassId)||null;

    let users=[];
    if(isManager){
      if(activeClassId){
        const directory=await teacherListUsers(activeClassId);
        users=(directory.users||[]).map(u=>mapProfile({id:u.id,student_code:u.code,full_name:u.fullName,role:u.role,class_id:u.classId,active:u.active,deleted_at:u.deletedAt}));
      }
    }else if(profile.role==="monitor"&&activeClassId){
      const {data,error}=await sb.from("profiles").select("id,student_code,full_name,role,class_id,active,deleted_at").eq("class_id",activeClassId).in("role",["student","monitor"]).order("full_name");
      if(error)throw error;users=(data||[]).map(mapProfile);
    }else users=[mapProfile(profile)];

    let weeks=[];
    if(activeYear){
      const [baseWeeksRes,classWeeksRes]=await Promise.all([
        sb.from("weeks").select("id,week_number,start_date,end_date,status,deadline_mode,registration_deadline,note").eq("school_year_id",activeYear.id).order("week_number"),
        activeClassId?sb.from("class_weeks").select("class_id,week_id,status,deadline_mode,registration_deadline,note").eq("class_id",activeClassId):Promise.resolve({data:[],error:null})
      ]);
      if(baseWeeksRes.error)throw baseWeeksRes.error;if(classWeeksRes.error)throw classWeeksRes.error;
      const cw=new Map((classWeeksRes.data||[]).map(x=>[x.week_id,x]));
      weeks=(baseWeeksRes.data||[]).map(w=>mapClassWeek(w,cw.get(w.id)));
    }
    const currentWeek=chooseCurrentWeek(weeks);

    const [scheduleRes,settingsRes,notificationsRes,memoryStatsRes]=await Promise.all([
      activeClassId?sb.from("study_schedule").select("class_id,weekday,period_number").eq("class_id",activeClassId).eq("is_study_period",true):Promise.resolve({data:[],error:null}),
      activeClassId?sb.from("class_settings").select("*").eq("class_id",activeClassId).maybeSingle():Promise.resolve({data:null,error:null}),
      isManager&&activeClassId?sb.from("teacher_notifications").select("id,class_id,registration_id,student_id,week_id,notification_type,title,message,is_read,created_at").eq("class_id",activeClassId).order("created_at",{ascending:false}).limit(100):Promise.resolve({data:[],error:null}),
      isManager&&activeClassId?sb.rpc("get_ai_feedback_memory_stats",{p_class_id:activeClassId}):Promise.resolve({data:null,error:null})
    ]);
    for(const r of [scheduleRes,settingsRes,notificationsRes])if(r.error)throw r.error;
    if(memoryStatsRes.error)console.warn("Không tải được thống kê bộ nhớ AI.",memoryStatsRes.error);

    const weekData=await loadWeekData(currentWeek?.id,activeClassId);
    let registrations=weekData.registrations;
    if(["student","monitor"].includes(profile.role)){
      const {data,error}=await sb.from("registrations").select(REGISTRATION_COLUMNS).eq("student_id",user.id).eq("is_deleted",false);
      if(error)throw error;const byId=new Map(registrations.map(r=>[r.id,r]));(data||[]).map(mapReg).forEach(r=>byId.set(r.id,r));registrations=[...byId.values()];
    }

    const cs=settingsRes.data||{};
    const rawMemory=Array.isArray(memoryStatsRes.data)?memoryStatsRes.data[0]:memoryStatsRes.data;
    const memory=rawMemory?{
      totalFeedback:Number(rawMemory.total_feedback||0),revisionAfterAiApprove:Number(rawMemory.revision_after_ai_approve||0),approveAfterAiManual:Number(rawMemory.approve_after_ai_manual||0),approveAfterAiRevision:Number(rawMemory.approve_after_ai_revision||0),lastFeedbackAt:rawMemory.last_feedback_at||null,memoryEnabled:rawMemory.memory_enabled!==false,candidateLimit:Number(rawMemory.candidate_limit||80),selectedLimit:Number(rawMemory.selected_limit||25)
    }:emptyMemoryStats();

    const aiAutomationEnabled=cs.ai_automation_enabled!==false;
    const state={
      version:3,
      activeSchoolYearId:activeYear?.id||null,
      activeClassId,
      availableClasses:visibleClasses.map(c=>({id:c.id,schoolYearId:c.school_year_id,code:c.code,name:c.name,active:c.active!==false})),
      settings:{
        className:activeClass?.name||activeClass?.code||"",
        schoolYear:activeYear?.name||"",
        announcement:cs.announcement||"Chuẩn bị nội dung tự học trước hạn.",
        teacherName:profile.full_name||"",
        aiAutomationEnabled,
        smartApprovalEnabled:aiAutomationEnabled,
        aiReviewEnabled:aiAutomationEnabled,
        aiAutoApproveThreshold:Math.max(.5,Math.min(.99,Number(cs.ai_auto_approve_threshold??.90))),
        aiRevisionActionThreshold:Math.max(.5,Math.min(.99,Number(cs.ai_revision_auto_approve_threshold??.85))),
        aiFeedbackMemoryEnabled:cs.ai_feedback_memory_enabled!==false,
        registrationDeadlineTime:/^([01]\d|2[0-3]):[0-5]\d$/.test(String(cs.per_session_deadline_time||""))?String(cs.per_session_deadline_time).slice(0,5):"20:00"
      },
      users,weeks,
      periods:(periodsRes.data||[]).map(p=>({n:p.period_number,start:String(p.start_time).slice(0,5),end:String(p.end_time).slice(0,5)})),
      schedule:(scheduleRes.data||[]).map(x=>({dow:Number(x.weekday)-1,period:x.period_number})),
      overrides:weekData.overrides,registrations,aiFeedbackMemoryStats:memory,
      notifications:(notificationsRes.data||[]).map(n=>({id:n.id,classId:n.class_id,registrationId:n.registration_id,studentId:n.student_id,weekId:n.week_id,type:n.notification_type,title:n.title,message:n.message||"",isRead:n.is_read===true,createdAt:n.created_at})),
      currentWeekId:currentWeek?.id||weeks[0]?.id||null,audit:[]
    };
    snapshot=deepClone(state);
    return {currentUser:mapProfile(profile),state};
  }

  function setActiveClassId(userId,classId){
    if(userId&&classId)sessionStorage.setItem(classStorageKey(userId),classId);
  }

  async function insertAudit(entries,classId=null){
    if(!entries.length)return;

    await invokeEdgeFunction(
      "audit-log",
      {
        entries:entries.map(entry=>({
          action:entry.action||"Thay đổi",
          entityType:"web_app",
          entityId:String(entry.entityId||""),
          detail:entry.detail||"",
          createdAt:entry.at||new Date().toISOString(),
          classId:entry.classId||classId||null
        }))
      },
      "Không ghi được nhật ký hệ thống."
    );
  }

  async function syncInternal(state,currentUser){
    if(!snapshot){snapshot=deepClone(state);return;}
    const sb=requireClient(),role=currentUser?.role,before=snapshot,isManager=managerRole(role),classId=state.activeClassId||currentUser?.classId||null;
    const oldById=new Map((before.registrations||[]).map(r=>[r.id,r]));

    if(isManager){
      const currentIds=new Set((state.registrations||[]).map(r=>r.id));
      for(const old of before.registrations||[]){
        if(isUuid(old.id)&&!currentIds.has(old.id)){
          const {error}=await sb.from("registrations").update({is_deleted:true,deleted_at:new Date().toISOString(),deleted_by:currentUser.id,updated_at:new Date().toISOString()}).eq("id",old.id);
          if(error)throw error;
        }
      }
    }
    for(const r of state.registrations||[]){
      if(!isManager&&r.studentId!==currentUser?.id)continue;
      const old=oldById.get(r.id);if(old&&stable(r)===stable(old))continue;
      if(!isUuid(r.id)){
        const payload=dbReg(r);delete payload.id;
        const {data,error}=await sb.from("registrations").insert(payload).select().single();if(error)throw error;Object.assign(r,mapReg(data));
      }else{
        const payload=dbReg(r);delete payload.id;delete payload.student_id;delete payload.week_id;delete payload.weekday;delete payload.period_number;
        const {data,error}=await sb.from("registrations").update(payload).eq("id",r.id).select().single();if(error)throw error;Object.assign(r,mapReg(data));
      }
    }

    if(isManager&&classId){
      if(stable(state.schedule||[])!==stable(before.schedule||[])){
        let q=await sb.from("study_schedule").delete().eq("class_id",classId);if(q.error)throw q.error;
        if((state.schedule||[]).length){q=await sb.from("study_schedule").insert(state.schedule.map(x=>({class_id:classId,weekday:Number(x.dow)+1,period_number:Number(x.period),is_study_period:true})));if(q.error)throw q.error;}
      }
      if(stable(state.overrides||[])!==stable(before.overrides||[])){
        let q=await sb.from("week_schedule_overrides").delete().eq("class_id",classId);if(q.error)throw q.error;
        if((state.overrides||[]).length){q=await sb.from("week_schedule_overrides").insert(state.overrides.map(x=>({class_id:classId,week_id:x.weekId,weekday:Number(x.dow)+1,period_number:Number(x.period),is_study_period:x.active!==false,reason:x.reason||null})));if(q.error)throw q.error;}
      }
      const oldWeeks=new Map((before.weeks||[]).map(w=>[w.id,w]));
      for(const w of state.weeks||[]){const old=oldWeeks.get(w.id);if(old&&stable(w)!==stable(old)){
        const {error}=await sb.from("class_weeks").upsert({class_id:classId,week_id:w.id,status:w.status,deadline_mode:w.deadlineMode||"per_session_20",registration_deadline:w.deadline?new Date(w.deadline).toISOString():null,note:w.note||null,updated_by:currentUser.id,updated_at:new Date().toISOString()},{onConflict:"class_id,week_id"});if(error)throw error;
      }}
      if(stable(state.settings||{})!==stable(before.settings||{})){
        const {error}=await sb.from("class_settings").update({
          ai_automation_enabled:state.settings.aiAutomationEnabled!==false,
          ai_auto_approve_threshold:Number(state.settings.aiAutoApproveThreshold||.90),
          ai_revision_auto_approve_threshold:Number(state.settings.aiRevisionActionThreshold||.85),
          ai_feedback_memory_enabled:state.settings.aiFeedbackMemoryEnabled!==false,
          per_session_deadline_time:String(state.settings.registrationDeadlineTime||"20:00"),
          announcement:String(state.settings.announcement||""),updated_by:currentUser.id,updated_at:new Date().toISOString()
        }).eq("class_id",classId);if(error)throw error;
      }
    }
    const oldAuditLen=(before.audit||[]).length;const newEntries=(state.audit||[]).slice(0,Math.max(0,(state.audit||[]).length-oldAuditLen));if(newEntries.length)await insertAudit(newEntries,classId);
    snapshot=deepClone(state);
  }

  function appSyncError(code,message,cause){
    const wrapped=new Error(message);
    wrapped.code=code;
    wrapped.cause=cause;
    return wrapped;
  }

  function friendlySyncError(error){
    const message=String(error?.message||error||"");
    const code=String(error?.code||"");

    if(code==="42501"||code==="SECURITY_REGISTRATION"||/row-level security|security policy/i.test(message)){
      return appSyncError(
        "SECURITY_REGISTRATION",
        "Thao tác bị RLS từ chối vì quyền tài khoản, trạng thái tuần hoặc deadline không hợp lệ.",
        error
      );
    }

    if(code==="23505"||code==="DUPLICATE_REGISTRATION"||/duplicate key/i.test(message)){
      return appSyncError(
        "DUPLICATE_REGISTRATION",
        "Tiết này đã có đăng ký đang hoạt động.",
        error
      );
    }

    return error instanceof Error
      ? error
      : appSyncError("SYNC_ERROR",message||"Không đồng bộ được dữ liệu",error);
  }


  function mapTeacherNotificationRealtime(row){
    if(!row?.id)return null;
    return {
      id:row.id,
      registrationId:row.registration_id,
      studentId:row.student_id,
      weekId:row.week_id,
      type:row.notification_type,
      title:row.title || "",
      message:row.message || "",
      isRead:row.is_read === true,
      createdAt:row.created_at || null
    };
  }

  function normalizeRealtimePayload(table,payload){
    const eventType=String(payload?.eventType||"").toUpperCase();
    const rawNew=payload?.new && Object.keys(payload.new).length ? payload.new : null;
    const rawOld=payload?.old && Object.keys(payload.old).length ? payload.old : null;

    if(table==="registrations"){
      const id=rawNew?.id || rawOld?.id || null;
      const deleted=eventType==="DELETE" || rawNew?.is_deleted===true;
      return {
        table,
        eventType,
        id,
        deleted,
        record:(!deleted && rawNew?.id)?mapReg(rawNew):null,
        commitTimestamp:payload?.commit_timestamp || null
      };
    }

    if(table==="teacher_notifications"){
      const id=rawNew?.id || rawOld?.id || null;
      return {
        table,
        eventType,
        id,
        deleted:eventType==="DELETE",
        record:eventType==="DELETE"?null:mapTeacherNotificationRealtime(rawNew),
        commitTimestamp:payload?.commit_timestamp || null
      };
    }

    return {
      table,
      eventType,
      id:rawNew?.id || rawOld?.id || null,
      structural:true,
      commitTimestamp:payload?.commit_timestamp || null
    };
  }

  function unsubscribeRealtime(){
    const sb=client;
    const channel=realtimeChannel;
    realtimeChannel=null;
    if(!sb||!channel)return Promise.resolve();
    return sb.removeChannel(channel).catch(error=>{
      console.warn("Không đóng được Realtime channel.",error);
    });
  }

  function subscribeRealtime(onChange,onStatus){
    const sb=requireClient();
    unsubscribeRealtime();

    const channelName=`so-tu-hoc-live-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
    let channel=sb.channel(channelName);

    const tables=[
      "registrations",
      "teacher_notifications",
      "classes",
      "class_teachers",
      "class_settings",
      "class_weeks",
      "weeks",
      "study_schedule",
      "week_schedule_overrides"
    ];

    for(const table of tables){
      channel=channel.on(
        "postgres_changes",
        {event:"*",schema:"public",table},
        payload=>{
          try{
            onChange?.(normalizeRealtimePayload(table,payload));
          }catch(error){
            console.error("Realtime handler error",table,error);
          }
        }
      );
    }

    channel.subscribe((status,error)=>{
      onStatus?.(status,error||null);
    });

    realtimeChannel=channel;
    return unsubscribeRealtime;
  }

  function syncState(state,currentUser){
    if(!enabled()) return Promise.resolve();
    syncQueue=syncQueue.then(()=>syncInternal(state,currentUser)).catch(error=>{
      syncQueue=Promise.resolve();
      throw friendlySyncError(error);
    });
    return syncQueue;
  }

  function resetSnapshot(state){ snapshot=deepClone(state); }

  window.SupabaseService=Object.freeze({
    enabled,
    init,
    signInCode,
    signOut,
    loadState,
    loadWeekData,
    syncState,
    resetSnapshot,
    changeOwnPassword,
    teacherResetPassword,
    teacherUpdateUser,
    teacherDeleteUser,
    teacherCreateUser,
    teacherListUsers,
    adminManageClasses,
    requestRegistrationRevision,
    setActiveClassId,
    teacherRebaseWeeks,
    emergencyRegister,
    getDailyQuote,
    requestAiReview,
    prepareSessionAiRereview,
    prepareRegistrationAiRereview,
    deleteRegistration,
    markNotificationsRead,
    subscribeRealtime,
    unsubscribeRealtime,
    dateISOInTimeZone
  });
})();
