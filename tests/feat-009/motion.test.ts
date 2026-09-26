import { test, expect, vi, afterEach, beforeEach } from 'vitest';
import { h } from 'vue';
import { mount, settle, findAll, textOf } from '../bug-001/renderer';
const scenario=vi.hoisted(()=>({role:'admin',auto:false,quotes:false,messages:[{kind:'page',text:'Trang quản trị'}] as any[]}));
beforeEach(()=>{scenario.role='admin';scenario.auto=false;scenario.quotes=false;scenario.messages=[{kind:'page',text:'Trang quản trị'}]});
vi.mock('vue-router', () => ({useRoute: () => ({path:'/admin',fullPath:'/admin',query:{}})}));
vi.mock('../../src/stores/auth', () => ({useAuthStore: () => ({currentUser:{role:scenario.role},legacyState:{}})}));
vi.mock('../../src/stores/context', () => ({useContextStore: () => ({selectedWeekId:'w'})}));
vi.mock('../../src/stores/preferences', () => ({usePreferencesStore: () => ({owlEnabled:true,owlFollowPointer:true,owlHeadTilt:true,owlQuotesEnabled:scenario.quotes,owlAutoOpenUrgent:scenario.auto})}));
vi.mock('../../src/features/homework/view-context', () => ({useHomeworkViewStore: () => ({selectedTab:'board'})}));
vi.mock('../../src/features/owl/daily-quote', () => ({useDailyQuote: () => ({data:{value:null}})}));
vi.mock('../../src/features/shared/useNowTicker', () => ({useNowTicker: () => ({value:0})}));
vi.mock('../../src/features/registrations/device-policy-queries', () => ({useDevicePolicy: () => ({query:{isSuccess:{value:false},data:{value:[]}}})}));
vi.mock('../../src/features/owl/useTeacherQueueWeeks', () => ({useTeacherQueueWeeks: () => ({teacherQueueWeeks:{value:[]}})}));
vi.mock('../../src/features/owl/owl-model', async () => ({...(await vi.importActual('../../src/features/owl/owl-model')),buildOwlContextMessages: () => scenario.messages}));
import Owl from '../../src/components/owl/OwlMascotV2.vue';
let app: any;
afterEach(() => {app?.unmount(); app=null; vi.useRealTimers();vi.unstubAllGlobals();});
function browser() {
 const handlers = new Map<string, () => void>();
 const motion = {matches:false,addEventListener:vi.fn((_event,fn)=>handlers.set('motion',fn)),removeEventListener:vi.fn()};
 const page = {visibilityState:'visible',addEventListener:vi.fn((_event,fn)=>handlers.set('visibility',fn)),removeEventListener:vi.fn()};
 vi.stubGlobal('window',{matchMedia:()=>motion,addEventListener:vi.fn(),removeEventListener:vi.fn()});
 vi.stubGlobal('document',page);
 return {motion,page,handlers};
}
test('click animates a bounded wave and unmount removes all listeners', async () => {
 vi.useFakeTimers(); const env=browser();
 const view=mount({render:()=>h(Owl)}); app=view.app;await settle();
 const button=findAll(view.root,n=>n.type==='button')[0];
 button.props.onClick();await settle();
 expect(findAll(view.root,n=>n.type==='aside')[0].props.class).toContain('waving');
 await vi.advanceTimersByTimeAsync(901);await settle();
 expect(findAll(view.root,n=>n.type==='aside')[0].props.class).not.toContain('waving');
 app.unmount();app=null;
 expect(env.motion.removeEventListener).toHaveBeenCalled();
 expect(env.page.removeEventListener).toHaveBeenCalled();
});
test('reduced motion and page visibility are followed dynamically', async () => {
 const env=browser(); const view=mount({render:()=>h(Owl)});app=view.app;await settle();
 env.motion.matches=true;env.handlers.get('motion')?.();
 env.page.visibilityState='hidden';env.handlers.get('visibility')?.();await settle();
 const css=findAll(view.root,n=>n.type==='aside')[0].props.class;
 expect(css).toContain('no-motion');expect(css).toContain('paused');
});

test('learner urgent alerts remain mandatory; teacher auto-open follows preference',async()=>{
 for(const role of ['student','monitor','teacher','admin']){
  browser();scenario.role=role;scenario.messages=[{kind:'urgent',urgent:true,text:'Cần sửa đăng ký'}];
  const v=mount({render:()=>h(Owl)});app=v.app;await settle();
  expect(textOf(v.root).includes('Cần sửa đăng ký')).toBe(['student','monitor'].includes(role));
  app.unmount();app=null;
 }
});
test('click cycles context and quotes rather than repeating the same bubble forever',async()=>{
 browser();scenario.quotes=true;
 const v=mount({render:()=>h(Owl)});app=v.app;await settle();
 const clickOwl=async()=>{findAll(v.root,n=>n.type==='button'&&n.props['aria-label']==='Mở Cú Thông Thái')[0].props.onClick();await settle()};
 await clickOwl();await clickOwl();await clickOwl();
 expect(textOf(v.root)).toContain('Danh ngôn');
});
