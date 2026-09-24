import { createAdminClient } from '../_shared/config.ts';
import { createR2 } from '../_shared/media-r2.ts';
import { runCleanup } from '../_shared/media-storage.js';
// Server scheduler only. A dedicated secret, never a user JWT or profile impersonation.
Deno.serve(async(req:Request)=>{
  const expected=Deno.env.get('MEDIA_MAINTENANCE_SECRET')||'';
  const received=(req.headers.get('Authorization')||'').replace(/^Bearer\s+/i,'');
  const hash=async(s:string)=>new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)));
  const [a,b]=await Promise.all([hash(expected),hash(received)]);let diff=0;for(let i=0;i<a.length;i++)diff|=a[i]^b[i];
  if(req.method!=='POST'||expected.length<32||diff!==0) return new Response('Unauthorized',{status:401});
  try {
    const admin=createAdminClient();
    const result=await runCleanup(async(action:string,p:Record<string,unknown>)=>{
      const {data,error}=await admin.rpc('homework_media_service',{p_action:action,p_data:p});if(error)throw error;return data;
    },createR2());
    return Response.json(result,{status:result.failed?503:200});
  }catch{return Response.json({error:'MEDIA_CLEANUP_RETRY_REQUIRED'},{status:503});}
});
