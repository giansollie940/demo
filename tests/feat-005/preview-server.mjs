// Local isolated PostgreSQL + real Vue page, no external credentials or AI calls.
import {createServer} from 'vite';
import {setup,seed,rpc,server,ids,classId} from './fixture.mjs';
import {reviewSnapshot} from '../../supabase/functions/homework-review/logic.js';
export async function startPreview(){
 const db=await setup();await seed(db);let chain=Promise.resolve();
 const vite=await createServer({server:{host:'127.0.0.1',port:4175,strictPort:true},plugins:[{name:'feat005-fixture',configureServer(vite){vite.middlewares.use('/__feat005_fixture',(req,res)=>{
  let body='';req.on('data',x=>body+=x);req.on('end',()=>{chain=chain.then(async()=>{res.setHeader('Content-Type','application/json');try{
   const p=JSON.parse(body);if(!Object.values(ids).includes(p.actor))throw Error('Fixture actor only');
   let value=await rpc(db,p.actor,p.action,p.data,p.data?.class_id??classId);
   if(p.review&&value.status==='pending_duplicate_review'){
    const snap=await server(db,'snapshot',{id:value.id});
    if(!snap.done){const result=await reviewSnapshot(snap,async payload=>payload.mode==='edit'?{material_change:true}:{score:0,candidate_id:null,reason:'Local deterministic provider'});
     const final=await server(db,'finish',{id:value.id,revision:snap.notice.revision,fingerprint:snap.fingerprint,...result});value={...value,status:final.status};}
   }
   res.end(JSON.stringify({data:value,error:null}));
  }catch(e){res.end(JSON.stringify({data:null,error:{message:e.message}}));}});});
 });}}]});await vite.listen();
 return {db,close:async()=>{await vite.close();await db.close();}};
}
if(process.argv[1]?.endsWith('preview-server.mjs')){await startPreview();console.log('FEAT-005 fixture http://127.0.0.1:4175/tests/feat-005/preview.html');}
