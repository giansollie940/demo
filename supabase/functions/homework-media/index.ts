import { createClient } from 'npm:@supabase/supabase-js@2.95.0';
import { createAdminClient, getServerConfig } from '../_shared/config.ts';
import { requireActor } from '../_shared/auth.ts';
import { json, preflight, errorResponse, readJson } from '../_shared/http.ts';
import { createR2 } from '../_shared/media-r2.ts';
import { promoteMedia, runCleanup } from '../_shared/media-storage.js';
Deno.serve(async (req: Request) => {
  if(req.method==='OPTIONS') return preflight(req);
  if(req.method!=='POST') return json(req,405,{error:'Chỉ hỗ trợ POST'});
  try {
    const admin=createAdminClient(), actor=await requireActor(req,admin), {url,key}=getServerConfig();
    const user=createClient(url,key,{global:{headers:{Authorization:req.headers.get('Authorization')!}},auth:{persistSession:false,autoRefreshToken:false}});
    const body=await readJson(req);
    const call=async(action:string,p:Record<string,unknown>)=>{
      const {data,error}=await user.rpc('homework_media',{p_action:action,p_data:p});
      // Keep the SQLSTATE: FEAT-008 raises 53100 for a capacity hold and the
      // client must tell that apart from a permission error without matching
      // on message text.
      if(error)throw Object.assign(new Error(error.message),{status:400,code:error.code});return data;
    };
    const service=async(action:string,p:Record<string,unknown>)=>{
      const {data,error}=await admin.rpc('homework_media_service',{p_action:action,p_data:p});if(error)throw error;return data;
    };
    if(body.action==='cancel') {
      const result=await call('cancel',body);
      // Best effort immediate cleanup; durable jobs are retained if R2 is down.
      try{await runCleanup((action:string,p:Record<string,unknown>)=>service(action,action==='jobs'?{...p,attachment_id:body.attachment_id}:p),createR2());}catch{ /* scheduled worker retries */ }
      return json(req,200,{ok:true,...result});
    }
    const store=createR2();
    if(body.action==='prepare') {
      const pending=await call('prepare',body);
      const ticket=await call('ticket',{class_id:body.class_id,attachment_id:pending.id});
      const ttl=Math.min(120,Math.floor((new Date(ticket.expires_at).getTime()-Date.now())/1000));
      if(ttl<1)throw new Error('Ảnh chờ đã hết hạn.');
      return json(req,200,{ok:true,id:ticket.id,verified:!!ticket.verified_at,expires_at:ticket.expires_at,
        upload_url:ticket.verified_at?null:await store.sign(ticket.staging_key,'PUT',ttl,ticket.size_bytes)});
    }
    if(body.action==='seal') {
      const ticket=await call('ticket',body);
      if(!ticket.verified_at) {
        await promoteMedia(store,ticket);
        await service('seal',{attachment_id:ticket.id,owner_id:actor.id});
      }
      return json(req,200,{ok:true,id:ticket.id,verified:true});
    }
    if(body.action==='read') {
      const ticket=await call('read',body);
      return json(req,200,{ok:true,url:await store.sign(ticket.object_key,'GET',60),expires_at:new Date(Date.now()+60000).toISOString()});
    }
    return json(req,400,{error:'Thao tác ảnh không hợp lệ'});
  }catch(error){return errorResponse(req,error,'Chưa xử lý được ảnh. Hãy thử lại hoặc gửi bài dạng chữ.');}
});
