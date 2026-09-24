function allowedOrigins(){
  const raw=(Deno.env.get("ALLOWED_ORIGINS")||Deno.env.get("ALLOWED_ORIGIN")||"https://giansollie940.github.io");
  return raw.split(",").map(x=>x.trim()).filter(Boolean);
}
export function corsHeaders(req?:Request){
  const origin=req?.headers.get("Origin")||"";
  const allowed=allowedOrigins();
  const selected=allowed.includes("*")?"*":(allowed.includes(origin)?origin:(allowed[0]||"https://invalid.local"));
  return {
    "Access-Control-Allow-Origin":selected,
    "Vary":"Origin",
    "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods":"POST, OPTIONS",
  };
}
export function json(req:Request,status:number,body:unknown){
  return new Response(JSON.stringify(body),{status,headers:{...corsHeaders(req),"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});
}
export function preflight(req:Request){ return new Response("ok",{headers:corsHeaders(req)}); }
export function errorResponse(req:Request,error:unknown,fallback="Không thể hoàn tất yêu cầu. Vui lòng thử lại."){
  const e=error as any;
  const status=Number(e?.status||0)||500;
  if(status>=500) console.error(error);
  return json(req,status,{ok:false,code:String(e?.code||"INTERNAL_ERROR"),error:status>=500?fallback:String(e?.message||fallback)});
}
export async function readJson(req:Request){
  try{return await req.json();}catch{return {};}
}
