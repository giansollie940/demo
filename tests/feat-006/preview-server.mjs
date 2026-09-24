// Isolated fixture only: PGlite and in-memory object store, no live credentials.
import {createServer} from 'vite';
import {readFile} from 'node:fs/promises';
import {setup,seed,rpc,server,ids,classId} from '../feat-005/fixture.mjs';
import {reviewSnapshot} from '../../supabase/functions/homework-review/logic.js';
import {promoteMedia,runCleanup} from '../../supabase/functions/_shared/media-storage.js';
export async function startPreview(){
 const db=await setup();await db.exec(await readFile(new URL('../../database/upgrade/10-FEAT-006-HOMEWORK-MEDIA.sql',import.meta.url),'utf8'));await seed(db);
 const objects=new Map(),tokens=new Map();let chain=Promise.resolve();
 const store={get:async k=>objects.get(k)||null,putImmutable:async(k,b)=>{if(!objects.has(k))objects.set(k,b);},delete:async k=>objects.delete(k)};
 async function media(actor,action,data){await db.exec(`set role authenticated;set request.jwt.claim.sub='${actor}'`);try{return(await db.query('select homework_media($1,$2::jsonb) r',[action,JSON.stringify(data)])).rows[0].r;}finally{await db.exec('reset role');}}
 async function service(action,data){await db.exec('set role service_role');try{return(await db.query('select homework_media_service($1,$2::jsonb) r',[action,JSON.stringify(data)])).rows[0].r;}finally{await db.exec('reset role');}}
 const sign=(key,method,size)=>{const token=crypto.randomUUID();tokens.set(token,{key,method,size,expires:Date.now()+120000});return '/__feat006/object/'+token;};
 const vite=await createServer({server:{host:'127.0.0.1',port:4176,strictPort:true},plugins:[{name:'feat006-fixture',configureServer(vite){vite.middlewares.use('/__feat006',(req,res)=>{
  if(req.url.startsWith('/object/')){
   const t=tokens.get(req.url.slice(8));if(!t||t.method!==req.method||t.expires<Date.now()){res.writeHead(403);res.end();return;}
   if(req.method==='GET'){const bytes=objects.get(t.key);res.writeHead(bytes?200:404,{'Content-Type':'image/webp','Cache-Control':'no-store'});res.end(bytes?Buffer.from(bytes):'');return;}
   const chunks=[];let size=0;req.on('data',b=>{size+=b.length;if(size>500000){req.destroy();return;}chunks.push(b);});req.on('end',()=>{if(size!==t.size){res.writeHead(400);res.end();return;}objects.set(t.key,new Uint8Array(Buffer.concat(chunks)));res.end();});return;
  }
  let body='';req.on('data',x=>body+=x);req.on('end',()=>{chain=chain.then(async()=>{res.setHeader('Content-Type','application/json');try{
   const p=JSON.parse(body);if(!Object.values(ids).includes(p.actor))throw Error('Fixture actor only');let value;
   if(p.review==='media'){
    const data=p.data;
    if(p.action==='prepare'){const m=await media(p.actor,'prepare',data),t=await media(p.actor,'ticket',{class_id:data.class_id,attachment_id:m.id});value={ok:true,id:t.id,verified:!!t.verified_at,upload_url:t.verified_at?null:sign(t.staging_key,'PUT',t.size_bytes)};}
    else if(p.action==='seal'){const t=await media(p.actor,'ticket',data);await promoteMedia(store,t);await service('seal',{attachment_id:t.id,owner_id:p.actor});value={ok:true,id:t.id,verified:true};}
    else if(p.action==='read'){const t=await media(p.actor,'read',data);value={ok:true,url:sign(t.object_key,'GET')};}
    else if(p.action==='cancel'){value=await media(p.actor,'cancel',data);await runCleanup(service,store);}
    else throw Error('Unknown media action');
   }else{
    value=await rpc(db,p.actor,p.action,p.data,p.data?.class_id??classId);
    if(p.review&&value.status==='pending_duplicate_review'){
     const snap=await server(db,'snapshot',{id:value.id});
     if(!snap.done){const result=await reviewSnapshot(snap,async payload=>payload.mode==='edit'?{material_change:true}:{score:0,candidate_id:null,reason:'Local provider'});
      const final=await server(db,'finish',{id:value.id,revision:snap.notice.revision,fingerprint:snap.fingerprint,...result});value={...value,status:final.status};}
    }
   }
   res.end(JSON.stringify({data:value,error:null}));
  }catch(e){res.end(JSON.stringify({data:null,error:{message:e.message}}));}});});
 });}}]});await vite.listen();return{db,close:async()=>{await vite.close();await db.close();}};
}
if(process.argv[1]?.endsWith('preview-server.mjs')){await startPreview();console.log('FEAT-006 fixture http://127.0.0.1:4176/tests/feat-006/preview.html');}
