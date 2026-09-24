import {beforeEach,afterEach,it,expect,vi}from'vitest';import{reactive}from'vue';import{createPinia,setActivePinia}from'pinia';
import{mount,settle,click,findAll,textOf}from'../bug-001/renderer';
const env=vi.hoisted(()=>({auth:null as any,ctx:null as any,rpc:vi.fn()}));
vi.mock('../../src/stores/auth',()=>({useAuthStore:()=>env.auth}));vi.mock('../../src/stores/context',()=>({useContextStore:()=>env.ctx}));
vi.mock('../../src/services/legacy-supabase',()=>({legacyApi:{teacherListUsers:async()=>({users:[]})}}));
vi.mock('../../src/features/homework/api',async original=>({...await original<any>(),homeworkRpc:env.rpc}));
import Page from'../../src/pages/HomeworkPage.vue';
const n={id:'n',class_id:'a',author_id:'s',author_role:'student',author_name:'Student',title:'New B',content:'B',subject:'Toán',status:'pending_duplicate_review',score:80,due_at:'2099-01-01T00:00:00Z',created_at:'2026-09-01T00:00:00Z',candidate:{id:'target',title:'Old A',content:'A',subject:'Toán',status:'published',due_at:'2099-01-01T00:00:00Z',created_at:'2026-09-01T00:00:00Z',correction:{id:'c',round:1,version:1,status:'awaiting_author'}}};
const data=()=>({settings:{seed_threshold:3},subjects:[],groups:[],notices:[],history:[],queue:[n],audit:[],trash:[],members:[],learners:[],leaderboard:[],notifications:[],corrections:[],reports:[],ai_settings:{semantic_duplicate_enabled:true,duplicate_review_threshold:70,duplicate_auto_threshold:90}});
let app:any;beforeEach(()=>{setActivePinia(createPinia());env.auth=reactive({role:'teacher',currentUser:{id:'t',classId:null}});env.ctx=reactive({selectedClassId:'a',selectedWeekId:null,weeks:[]});env.rpc.mockReset().mockImplementation(async action=>action==='context'?{classes:[{id:'a',code:'7A',grade:7,active:true,school_year_id:'y'}]}:data());vi.stubGlobal('Document',class{});vi.stubGlobal('ShadowRoot',class{});vi.stubGlobal('document',{activeElement:null});});
afterEach(()=>{app?.unmount();vi.unstubAllGlobals();});
it('Product addendum: UI blocks replacement target with open correction while preserving other duplicate choices',async()=>{
 const m=mount(Page);app=m.app;await settle();await settle();await findAll(m.root,x=>x.type==='button'&&textOf(x).trim().startsWith('AI trùng'))[0].props.onClick();await settle();
 expect(textOf(m.root)).toContain('GV cần xử lý correction trước');
 expect(findAll(m.root,x=>x.type==='button'&&textOf(x).trim()==='Giữ bài mới')[0].props.disabled).toBe(true);
 expect(findAll(m.root,x=>x.type==='button'&&textOf(x).trim()==='Giữ bài cũ')[0].props.disabled).toBe(false);
});
