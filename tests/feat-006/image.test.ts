import {test,expect} from 'vitest';
const mod=await import('../../src/features/homework/image').catch(()=>({} as any));
test('image compression preserves oriented dimensions and reduces size before quality',async()=>{
 expect(typeof mod.compressImage).toBe('function');const calls:number[][]=[];
 const result=await mod.compressImage(new File(['source'],'photo.heic',{type:'image/heic'}),{
  decode:async()=>({width:3000,height:4000,close(){}}),
  encode:async(_:unknown,w:number,h:number,q:number)=>{calls.push([w,h,q]);return new Blob([new Uint8Array(calls.length<3?510000:350000)],{type:'image/webp'});}
 });
 expect(calls[0]).toEqual([1200,1600,.92]);expect(calls[1][2]).toBe(.92);expect(calls[1][1]).toBeLessThan(1600);
 expect(result.width/result.height).toBeCloseTo(.75,2);expect(result.blob.size).toBe(350000);
});
test('unsupported HEIC never reaches upload or passes through the original; encoder MIME and hard limit enforced',async()=>{
 expect(typeof mod.compressImage).toBe('function');
 await expect(mod.compressImage(new File(['heic'],'a.heic'),{decode:async()=>{throw Error('unsupported')}})).rejects.toThrow(/HEIC|định dạng/);
 for(const blob of [new Blob(['png'],{type:'image/png'}),new Blob([new Uint8Array(500001)],{type:'image/webp'})])
  await expect(mod.compressImage(new File(['x'],'a.png',{type:'image/png'}),{decode:async()=>({width:2000,height:1000,close(){}}),encode:async()=>blob})).rejects.toThrow();
});
