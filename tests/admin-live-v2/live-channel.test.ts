import {test,expect,vi,beforeEach} from 'vitest';
const env=vi.hoisted(()=>({callbacks:[] as Array<(p:any)=>void>,status:null as null|((s:string)=>void),remove:vi.fn(async()=>{}),error:null as unknown,channels:0}));
vi.mock('../../src/services/legacy-supabase',()=>({legacyApi:{init:async()=>({
 from:()=>({select:()=>({limit:async()=>({error:env.error})})}),
 channel:()=>{env.channels++;const c={on:(_e:any,_f:any,fn:any)=>{env.callbacks.push(fn);return c},subscribe:(fn:any)=>{env.status=fn;return c}};return c},
 removeChannel:env.remove
})}}));
import {subscribeStorageChanges} from '../../src/features/storage/live';
beforeEach(()=>{env.callbacks=[];env.channels=0;env.error=null;env.remove.mockClear()});
test('signals have a dedicated channel, and callbacks stop on unsubscribe',async()=>{
 const changed=vi.fn(),status=vi.fn();const stop=await subscribeStorageChanges(changed,status);
 env.callbacks[0]({new:{affects_r2:true}});
 expect(changed).toHaveBeenCalledWith(true);
 env.status?.('CHANNEL_ERROR');expect(status).toHaveBeenCalledWith('CHANNEL_ERROR');
 stop();env.callbacks[1]({new:{affects_r2:false}});
 expect(changed).toHaveBeenCalledTimes(1);expect(env.remove).toHaveBeenCalledTimes(1);
});
test('missing migration is surfaced rather than silently polling',async()=>{
 env.error={message:'relation missing'};
 await expect(subscribeStorageChanges(vi.fn(),vi.fn())).rejects.toThrow('SQL 17');
 expect(env.channels).toBe(0);
});
