// Local-only verification for FEAT-010. No remote database, deployment or Git mutations.
// Runs the whole existing corpus plus the FEAT-010 suites; FEAT-010's migration
// touches `registrations`, which every earlier suite writes to, so re-running
// the corpus is the evidence that it stays inert for a class with no policy.
import {spawn} from 'node:child_process';
import {mkdir,writeFile,copyFile,access,readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const evidence=new URL('../docs/feat-010/evidence/',import.meta.url);
await mkdir(evidence,{recursive:true});
const archive=new URL('previous-'+Date.now()+'/',evidence);
await mkdir(archive,{recursive:true});
for(const name of ['archive-database.log','archive-ui.log','storage-database.log','storage-database-on-12.log','storage-ui.log','media-database.log','media-database-on-12.log','database-on-12.log','media-ui.log','database.log','legacy-database.log','feat004-database.log','static.log','ui.log','typecheck.log','build.log','device-database.log','device-ui.log','verification-results.json']){
 try{await access(new URL(name,evidence));await copyFile(new URL(name,evidence),new URL(name,archive));}catch(e){if(e.code!=='ENOENT')throw e;}
}
const checks=[
 ['device-database',['--test','tests/feat-010/*.test.mjs'],{}],
 ['device-ui',['node_modules/vitest/vitest.mjs','run','--config','tests/feat-010/vitest.config.ts'],{}],
 ['archive-database',['--test','tests/feat-007/*.test.mjs'],{}],
 ['archive-ui',['node_modules/vitest/vitest.mjs','run','--config','tests/feat-007/vitest.config.ts'],{}],
 ['storage-database',['--test','tests/feat-008/*.test.mjs'],{}],
 // AC-726 in its strongest form: every existing suite re-run with migration 12
 // installed. They must pass unchanged, which is what proves FEAT-007 is inert
 // until an Admin archives a year.
 ['storage-database-on-12',['--test','tests/feat-008/*.test.mjs'],{FEAT007_UPGRADE:'1'}],
 ['storage-ui',['node_modules/vitest/vitest.mjs','run','--config','tests/feat-008/vitest.config.ts'],{}],
 ['media-database',['--test','tests/feat-006/*.test.mjs'],{}],
 ['media-database-on-12',['--test','tests/feat-006/*.test.mjs'],{FEAT008_UPGRADE:'1',FEAT007_UPGRADE:'1'}],
 ['database-on-12',['--test','tests/feat-005/*.test.mjs'],{FEAT006_UPGRADE:'1',FEAT008_UPGRADE:'1',FEAT007_UPGRADE:'1'}],
 ['media-ui',['node_modules/vitest/vitest.mjs','run','--config','tests/feat-006/vitest.config.ts'],{}],
 ['database',['--test','tests/feat-005/*.test.mjs'],{FEAT006_UPGRADE:'1'}],
 ['legacy-database',['--test','tests/homework/*.test.mjs','tests/feat-002/*.test.mjs'],{FEAT002_UPGRADE:'1',FEAT004_UPGRADE:'1'}],
 ['feat004-database',['--test','tests/feat-004/*.test.mjs'],{}],
 ['static',['--test','tests/*.test.mjs'],{}],
 ['ui',['node_modules/vitest/vitest.mjs','run','--config','tests/feat-005/regression.config.ts'],{}],
 ['typecheck',['node_modules/vue-tsc/bin/vue-tsc.js','-b'],{}],
 ['build',['node_modules/vite/bin/vite.js','build'],{}],
];
const results=[];
const selected=process.argv.slice(2);
for(const[name,args,env]of checks.filter(([name])=>!selected.length||selected.includes(name))){
 const started=new Date().toISOString();let output='';
 const exitCode=await new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,args,{cwd:root,env:{...process.env,...env,NO_COLOR:'1'},windowsHide:true});
  child.stdout.on('data',x=>output+=x);child.stderr.on('data',x=>output+=x);child.on('error',reject);child.on('close',resolve);
 });
 await writeFile(new URL(name+'.log',evidence),`Started: ${started}\nCommand: node ${args.join(' ')}\nEnvironment overrides: ${JSON.stringify(env)}\n${output}\nExit code: ${exitCode}\n`);
 results.push({name,started,ended:new Date().toISOString(),exitCode,status:exitCode===0?'PASS':'FAIL'});
 console.log(`${name}: ${exitCode===0?'PASS':'FAIL'} (exit ${exitCode})`);
 if(exitCode!==0)console.log(output.slice(-9000));
}
// Reconstruct the summary from retained command logs so a targeted re-test
// preserves the original timestamps/evidence of unchanged checks.
const summary=[];
for(const[name]of checks){try{
 const log=await readFile(new URL(name+'.log',evidence),'utf8');const code=Number(log.match(/Exit code: (\d+)\s*$/)?.[1]??NaN);
 summary.push({name,started:log.match(/^Started: (.+)$/m)?.[1],exitCode:Number.isNaN(code)?null:code,status:code===0?'PASS':'FAIL'});
}catch(e){if(e.code!=='ENOENT')throw e;summary.push({name,status:'NOT RUN'});}}
await writeFile(new URL('verification-results.json',evidence),JSON.stringify(summary,null,2));
if(results.some(x=>x.exitCode!==0))process.exitCode=1;
