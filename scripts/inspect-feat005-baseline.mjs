import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';import {setup} from '../tests/feat-005/fixture.mjs';
const live=JSON.parse(await readFile(new URL('../docs/feat-005/evidence/live-functions-before.json',import.meta.url),'utf8'));
const db=await setup(false);
try{
 const local=(await db.query("select n.nspname,p.proname,pg_get_functiondef(p.oid) definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='homework_private' or (n.nspname='public' and p.proname like 'homework%')")).rows;
 const normalize=x=>x.replace(/\r\n/g,'\n').trim();const hash=x=>createHash('sha256').update(normalize(x)).digest('hex');
 const comparisons=live.map(r=>{const match=local.find(x=>x.nspname===r.nspname&&x.proname===r.proname);return {name:r.nspname+'.'+r.proname,liveSha256:hash(r.definition),localSha256:match?hash(match.definition):null,exactMatch:!!match&&normalize(r.definition)===normalize(match.definition)};});
 await writeFile(new URL('../docs/feat-005/evidence/baseline-function-comparison.json',import.meta.url),JSON.stringify(comparisons,null,2));
 console.log(JSON.stringify(comparisons.map(x=>({name:x.name,exactMatch:x.exactMatch})),null,2));
}finally{await db.close();}
