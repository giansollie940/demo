import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
const module = await import('../../supabase/functions/_shared/media-storage.js').catch(()=>({}));
const image=()=>{const b=new Uint8Array(30);const v=new DataView(b.buffer);b.set(new TextEncoder().encode('RIFF'));v.setUint32(4,22,true);b.set(new TextEncoder().encode('WEBPVP8 '),8);v.setUint32(16,10,true);b.set([0,0,0,0x9d,0x01,0x2a,0x40,0x06,0x84,0x03],20);return b;};
const metadata=b=>({size_bytes:b.length,width:1600,height:900,checksum:createHash('sha256').update(b).digest('hex'),object_key:'private/final',staging_key:'pending/upload'});
test('bounded WebP validation checks actual bytes, dimensions and checksum, rejects original/oversize/animation',async()=>{
 assert.equal(typeof module.validateWebP,'function');const b=image(),m=metadata(b);
 await module.validateWebP(b,m);
 for(const invalid of [{...m,width:1599},{...m,checksum:'a'.repeat(64)},{...m,size_bytes:1}])await assert.rejects(module.validateWebP(b,invalid));
 await assert.rejects(module.validateWebP(new Uint8Array(500001),m));
 const fake=image();fake.set(new TextEncoder().encode('ANIM'),12);await assert.rejects(module.validateWebP(fake,metadata(fake)));
 await assert.rejects(module.validateWebP(new TextEncoder().encode('not an image'),m));
});
test('promotion validates once and preserves immutable bytes across staging URL reuse and network retry',async()=>{
 assert.equal(typeof module.promoteMedia,'function');const b=image(),m=metadata(b),objects=new Map([[m.staging_key,b]]);let puts=0;
 const store={get:async key=>objects.get(key)||null,putImmutable:async(key,bytes)=>{puts++;if(!objects.has(key))objects.set(key,bytes);}};
 await module.promoteMedia(store,m);assert.deepEqual(objects.get(m.object_key),b);
 objects.set(m.staging_key,new Uint8Array([1,2,3]));await module.promoteMedia(store,m);assert.equal(puts,1);
 const bad={...m,object_key:'bad-final'};await assert.rejects(module.promoteMedia(store,bad));assert.equal(objects.has('bad-final'),false);
});
test('cleanup acknowledges only actual successful deletes, staging-only jobs cannot delete active images',async()=>{
 assert.equal(typeof module.runCleanup,'function');const removed=[],acks=[];
 const jobs=[{id:'one',kind:'purge',object_key:'final1',staging_key:'stage1',token:'a'},{id:'two',kind:'staging',object_key:'final2',staging_key:'stage2',token:'b'}];
 const rpc=async(action,p)=>action==='jobs'?jobs:acks.push(p);
 await module.runCleanup(rpc,{delete:async k=>{removed.push(k);if(k==='final1')throw Error('quota');}});
 assert.deepEqual(removed,['stage1','final1','stage2']);assert.equal(acks[0].success,false);assert.equal(acks[1].success,true);assert.equal(acks[1].token,'b');
});
