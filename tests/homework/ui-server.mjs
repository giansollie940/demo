// Local-only fixture: isolated database, no production credentials.
import {createServer} from 'vite';
import {readFile} from 'node:fs/promises';
import {createFixture,ids} from './fixture.mjs';
const db=await createFixture();
await db.exec(await readFile(new URL('../../database/upgrade/05-FEAT-001-BAO-BAI.sql',import.meta.url),'utf8'));
async function rpc(actor,action,data){
 await db.exec(`reset role; select set_config('request.jwt.claim.sub','${actor}',false); set role authenticated;`);
 try{return (await db.query('select homework_api($1,$2::jsonb) result',[action,JSON.stringify({class_id:ids.c,...data})])).rows[0].result;}
 finally{await db.exec('reset role');}
}
const subject=await rpc(ids.t,'subject_save',{name:'Toán',short_name:'Toán',icon:'📐'});
const notice=await rpc(ids.s,'submit',{subject_id:subject.id,title:'Ôn tập chương phân số',content:'Hoàn thành bài 1–5 trong phiếu học tập.',due_at:new Date(Date.now()+86400000).toISOString(),request_id:crypto.randomUUID()});
await db.query("update homework_notices set status='published',published_at=now() where id=$1",[notice.id]);
let chain=Promise.resolve();
const server=await createServer({server:{host:'127.0.0.1',port:4174},plugins:[{name:'homework-fixture',configureServer(server){server.middlewares.use('/__homework_fixture',(req,res)=>{let body='';req.on('data',b=>body+=b);req.on('end',()=>{chain=chain.then(async()=>{try{const p=JSON.parse(body);if(!Object.values(ids).includes(p.actor))throw Error('Invalid fixture actor');const data=await rpc(p.actor,p.action,p.data);res.setHeader('Content-Type','application/json');res.end(JSON.stringify({data,error:null}));}catch(e){res.end(JSON.stringify({data:null,error:{message:e.message}}));}});});});}}]});
await server.listen();console.log('Local fixture: http://localhost:4174/tests/homework/preview.html');
