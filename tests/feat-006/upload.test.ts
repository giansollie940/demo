import {test,expect} from 'vitest';
const mod=await import('../../src/features/homework/media-upload').catch(()=>({} as any));
test('upload success / seal failure recovers without uploading a second time',async()=>{
 expect(typeof mod.ensureUploaded).toBe('function');let uploads=0,seals=0;
 const state={blob:new Blob(['webp'],{type:'image/webp'}),width:1,height:1,checksum:'a'.repeat(64),pendingId:'',uploaded:false,verified:false};
 const deps={call:async(action:string)=>{if(action==='prepare')return {id:'pending',upload_url:'https://example.invalid/put'};if(++seals===1)throw Error('offline');return {verified:true};},put:async()=>{uploads++},persist:async()=>{}};
 await expect(mod.ensureUploaded(state,{},deps)).rejects.toThrow('offline');expect(state.uploaded).toBe(true);
 expect(await mod.ensureUploaded(state,{},deps)).toBe('pending');expect(uploads).toBe(1);
});
test('pending identity is persisted before PUT and a verified retry never uploads again',async()=>{
 expect(typeof mod.ensureUploaded).toBe('function');const events:string[]=[];
 const state={blob:new Blob(['webp'],{type:'image/webp'}),width:1,height:1,checksum:'a'.repeat(64),pendingId:'',uploaded:false,verified:false};
 await mod.ensureUploaded(state,{}, {call:async()=>({id:'pending',verified:true}),put:async()=>events.push('PUT'),persist:async()=>events.push(state.pendingId)});
 expect(events[0]).toBe('pending');expect(events).not.toContain('PUT');
});
