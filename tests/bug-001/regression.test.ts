import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest'
import { reactive, ref, h, defineComponent } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { mount, click, textOf, findAll, settle } from './renderer'
import type { LegacyState, CurrentUser } from '../../src/types/legacy'

const env=vi.hoisted(()=>({auth:null as any,ctx:null as any,route:null as any,rpc:vi.fn(),submit:vi.fn()}))
vi.mock('../../src/services/legacy-supabase',()=>({legacyApi:{teacherListUsers:async()=>({users:[]})}}))
vi.mock('../../src/stores/auth',()=>({useAuthStore:()=>env.auth}))
vi.mock('../../src/stores/context',()=>({useContextStore:()=>env.ctx}))
vi.mock('../../src/stores/preferences',()=>({usePreferencesStore:()=>({owlEnabled:true,owlQuotesEnabled:false,owlAutoOpenUrgent:true,owlFollowPointer:false,owlHeadTilt:false})}))
vi.mock('../../src/features/owl/daily-quote',()=>({useDailyQuote:()=>({data:ref(null)})}))
vi.mock('../../src/features/registrations/device-policy-queries',()=>({useDevicePolicy:()=>({query:{isSuccess:ref(false),data:ref(undefined)}})}))
vi.mock('../../src/features/shared/useNowTicker',()=>({useNowTicker:()=>ref(Date.parse('2026-09-09T00:00:00Z'))}))
vi.mock('../../src/features/homework/api',async importOriginal=>({...await importOriginal<any>(),homeworkRpc:env.rpc,submitHomework:env.submit}))
vi.mock('vue-router',async importOriginal=>{const actual=await importOriginal<any>();return{...actual,createWebHashHistory:actual.createMemoryHistory,useRoute:()=>env.route}})
import { visibleNavigation } from '../../src/features/navigation/navigation'
import { router } from '../../src/app/router'
import { buildOwlContextMessages } from '../../src/features/owl/owl-model'
import HomeworkPage from '../../src/pages/HomeworkPage.vue'
import WiseOwl from '../../src/components/owl/WiseOwl.vue'

const user=(role:string)=>({id:'u',role,code:'TEST',name:'Test',active:true,classId:'c'} as CurrentUser)
const legacy=()=>({currentWeekId:'w',weeks:[],periods:[],schedule:[],overrides:[],users:[user('student')],registrations:[{id:'r',weekId:'w',studentId:'u',status:'needs_revision'}]} as unknown as LegacyState)
const notice={id:'n',class_id:'c',subject_id:'s',author_id:'other',author_role:'student',author_name:'An',subject:'Toán',title:'Bài tập',content:'Nội dung',status:'published',due_at:'2026-09-12T00:00:00Z',created_at:'2026-09-09T00:00:00Z',hearts:0}
const data=()=>({subjects:[{id:'s',name:'Toán',is_active:true}],notices:[notice],history:[],queue:[],leaderboard:[],notifications:[],groups:[],members:[],learners:[],ai_settings:{semantic_duplicate_enabled:true,duplicate_review_threshold:70,duplicate_auto_threshold:90},audit:[],trash:[],settings:{seed_threshold:3,pending_threshold:70,reject_threshold:90}})
function extra(action:string){
 if(action==='context')return {grades:[7],classes:[{id:'c',grade:7,code:'7A9',active:true}]};
 if(action==='catalog_list')return [];
 if(action==='oversight')return {metrics:{},hearts:0,history:[],audit:[],catalog_audit:[],trash:[],people:[]};
 return {};
}
let app:any
beforeEach(()=>{
 setActivePinia(createPinia());env.auth=reactive({ready:true,isAuthenticated:true,currentUser:user('admin'),role:'admin',legacyState:legacy(),bootstrap:vi.fn()})
 env.ctx=reactive({selectedClassId:'c',selectedWeekId:'w',classes:[],weeks:[]});env.route=reactive({path:'/homework'})
 env.rpc.mockReset().mockImplementation(async(action:string)=>action==='load'?data():extra(action));env.submit.mockReset()
 vi.stubGlobal('Document',class {});vi.stubGlobal('ShadowRoot',class {});
 vi.stubGlobal('document',{activeElement:null});vi.stubGlobal('window',{addEventListener(){},removeEventListener(){}})
})
afterEach(()=>{app?.unmount();app=null;vi.unstubAllGlobals()})
function actor(role:string){env.auth.role=role;env.auth.currentUser=user(role)}
function renderPair(){const mounted=mount(defineComponent({setup:()=>()=>h('main',[h(HomeworkPage),h(WiseOwl)])}));app=mounted.app;return mounted.root}
function speech(root:any){return findAll(root,n=>n.props.role==='status').map(textOf).join(' ')}
describe('BUG-001 route authorization',()=>{
 it('allows Admin direct URL and menu navigation to homework',async()=>{await router.push('/homework');expect(router.currentRoute.value.path).toBe('/homework');expect(router.currentRoute.value.matched.at(-1)?.components?.default).toBe(HomeworkPage);await router.push('/admin');const menu=visibleNavigation('admin').find(item=>item.label==='Quản trị Báo bài');expect(menu).toBeDefined();await router.push(menu!.to);expect(router.currentRoute.value.path).toBe('/homework')})
 it('still denies Admin teacher/student routes and permits admin/settings',async()=>{for(const path of ['/dashboard','/register','/review','/tracking','/students','/schedule','/weeks','/history','/comments','/statistics','/issues']){await router.push(path);expect(router.currentRoute.value.path).toBe('/admin')}for(const path of ['/admin','/settings']){await router.push(path);expect(router.currentRoute.value.path).toBe(path)}})
 it('preserves learner/teacher access and unauthenticated redirect',async()=>{for(const role of ['student','monitor','teacher']){actor(role);await router.push('/settings');await router.push('/homework');expect(router.currentRoute.value.path).toBe('/homework')}env.auth.isAuthenticated=false;await router.push('/settings');expect(router.currentRoute.value.path).toBe('/login')})
})
describe('BUG-001 Owl module isolation',()=>{
 for(const role of ['student','monitor','teacher','admin'])it(`isolates homework from legacy needs-revision for ${role}`,()=>{const messages=buildOwlContextMessages({state:legacy(),user:user(role),path:'/homework'});expect(messages.some(m=>m.kind==='page'&&m.text.includes('Báo bài'))).toBe(true);expect(messages.some(m=>m.urgent||/Dashboard|đăng ký|buổi tự học/i.test(m.text))).toBe(false)})
 it('preserves legacy revision urgency outside homework',()=>{for(const role of ['student','monitor'])expect(buildOwlContextMessages({state:legacy(),user:user(role),path:'/register'}).some(m=>m.urgent&&m.text.includes('chỉnh sửa'))).toBe(true)})
})
describe('BUG-001 actual Vue component interactions (virtual renderer)',()=>{
 it('resets Owl context after every Admin tab click without path change',async()=>{const root=renderPair();await settle();for(const label of ['Tổng quan','Danh mục môn','Lịch sử đăng','🌟 Góc tuyên dương','Thùng rác','Nhật ký','Cấu hình']){await click(root,label);const owl=findAll(root,n=>n.props.class==='owl-button')[0];await owl.props.onClick();await settle();expect(speech(root)).toContain(label.replace('🌟 ',''));expect(speech(root)).not.toMatch(/Dashboard|đăng ký/);expect(env.route.path).toBe('/homework');}})
it('renders create/edit wording and dispatches the existing reminder action',async()=>{actor('teacher');env.rpc.mockImplementation(async(action:string)=>action==='load'?{...data(),notices:[{...notice,author_id:'u',author_role:'teacher'}]}:extra(action));const root=renderPair();await settle();const launch=findAll(root,n=>n.props.class==='composer-launch')[0];await launch.props.onClick();await settle();expect(findAll(root,n=>n.type==='h2').map(textOf)).toContain('✏️ Đăng Báo bài');await click(root,'Đóng');await click(root,'Sửa');expect(findAll(root,n=>n.type==='h2').map(textOf)).toContain('Sửa Báo bài');await click(root,'Đóng');await click(root,'🔔 Nhắc');expect(env.rpc).toHaveBeenCalledWith('remind','c',{id:'n'});expect(env.submit).not.toHaveBeenCalled()})
 it('drops forbidden context immediately when Admin becomes Student',async()=>{const root=renderPair();await settle();await click(root,'Cấu hình');actor('student');await settle();expect(findAll(root,n=>n.type==='button').map(textOf)).not.toContain('Cấu hình');const owl=findAll(root,n=>n.props.class==='owl-button')[0];await owl.props.onClick();await settle();expect(speech(root)).toContain('Bảng Báo bài');expect(speech(root)).not.toContain('Cấu hình')})
 it('clears old message during quick route changes and handles failed load',async()=>{actor('teacher');env.rpc.mockRejectedValue(new Error('offline'));const root=renderPair();await settle();const owl=findAll(root,n=>n.props.class==='owl-button')[0];await owl.props.onClick();await settle();expect(speech(root)).toContain('Báo bài');env.route.path='/review';await settle();await owl.props.onClick();await settle();expect(speech(root)).toMatch(/duyệt|đăng ký/);env.route.path='/homework';await settle();await owl.props.onClick();await settle();expect(speech(root)).toContain('Báo bài');expect(speech(root)).not.toContain('đăng ký')})
})

// Additional boundary cases required by AC-B004/005/007 and EC-B005/006.
describe('BUG-001 context boundaries', () => {
  it('suppresses real missing/upcoming schedule messages only on homework', () => {
    const state = legacy()
    state.weeks = [{ id: 'w', number: 1, startDate: '2026-09-07', endDate: '2026-09-13' }]
    state.periods = [{ n: 1, start: '07:30', end: '08:15' }, { n: 2, start: '08:30', end: '09:15' }]
    state.schedule = [{ dow: 2, period: 1 }, { dow: 2, period: 2 }]
    state.registrations = [{ id: 'r', weekId: 'w', studentId: 'u', dow: 2, period: 1, content: 'Test', status: 'approved' }]
    for (const role of ['student', 'monitor']) {
      const input = { state, user: user(role), nowMs: Date.parse('2026-09-09T00:00:00Z') }
      const outside = buildOwlContextMessages({ ...input, path: '/register' })
      expect(outside.some(m => m.text.includes('chưa đăng ký'))).toBe(true)
      expect(outside.some(m => m.text.includes('sắp bắt đầu'))).toBe(true)
      const inside = buildOwlContextMessages({ ...input, path: '/homework' })
      expect(inside.every(m => m.kind === 'page' && m.text.includes('Báo bài'))).toBe(true)
      expect(inside.some(m => /đăng ký|buổi tự học/.test(m.text))).toBe(false)
    }
  })
  it('isolates actionable teacher registration queue while retaining Review alerts', () => {
    const state = legacy(); state.registrations[0].status = 'submitted'
    for (const role of ['teacher', 'admin']) {
      expect(buildOwlContextMessages({ state, user: user(role), path: '/review' }).some(m => m.urgent)).toBe(true)
      expect(buildOwlContextMessages({ state, user: user(role), path: '/homework' }).some(m => m.urgent)).toBe(false)
    }
  })
  it('normalizes forged/unknown tabs against role without leaking forbidden context', () => {
    for (const [role, tabs] of [
      ['student', ['overview','queue','subjects','english','trash','audit','settings']],
      ['monitor', ['overview','subjects','english','trash','audit','settings']],
      ['teacher', ['overview','settings']],
    ] as const) {
      for (const homeworkTab of tabs) {
        const messages = buildOwlContextMessages({ state: legacy(), user: user(role), path:'/homework', homeworkTab })
        expect(messages[0].text).toContain('Bảng Báo bài')
      }
    }
    expect(buildOwlContextMessages({ state:null, user:user('admin'), path:'/homework',homeworkTab:'unknown' })[0].text).toContain('Tổng quan')
  })
  it('keeps neutral homework messages while legacy state is absent', async () => {
    actor('student'); env.auth.legacyState=null
    const root=renderPair();await settle()
    await findAll(root,n=>n.props.class==='owl-button')[0].props.onClick();await settle()
    expect(speech(root)).toContain('Bảng Báo bài')
    expect(speech(root)).not.toContain('buổi tự học')
  })
  for (const [role, labels] of [
    ['student', ['Bảng Báo bài','Lịch sử đăng','Yêu cầu chỉnh sửa','🌟 Góc tuyên dương']],
    ['monitor', ['Bảng Báo bài','Lịch sử đăng','Yêu cầu chỉnh sửa','🌟 Góc tuyên dương','AI trùng']],
    ['teacher', ['Bảng Báo bài','Lịch sử đăng','Yêu cầu chỉnh sửa','Báo sai thông tin','🌟 Góc tuyên dương','AI trùng','Cài đặt AI','Môn học','Tiếng Anh','Thùng rác','Nhật ký']],
  ] as const) it(`matches actual tab permissions and Owl for ${role}`, async () => {
    actor(role);const root=renderPair();await settle()
    const nav=findAll(root,n=>n.props['aria-label']==='Các mục Báo bài')[0]
    expect(findAll(nav,n=>n.type==='button').map(n=>textOf(n).trim())).toEqual([...labels])
    for (const label of labels) {
      await click(root,label)
      await findAll(root,n=>n.props.class==='owl-button')[0].props.onClick();await settle()
      expect(speech(root)).toContain(label.replace('🌟 ',''))
      if(role==='monitor' && label==='AI trùng')expect(speech(root)).toContain('giáo viên quyết định')
    }
  })
})

describe('FEAT-002 actual role UI',()=>{
 it('Admin board has no posting or notice operations and no AI/subject/group/queue tabs',async()=>{
  const root=renderPair();await settle();
  expect(findAll(root,n=>n.type==='button').map(textOf)).not.toContain('Bảng Báo bài');
  const buttons=findAll(root,n=>n.type==='button').map(textOf).join('|');expect(buttons).not.toMatch(/Đăng Báo bài|Sửa|🔔 Nhắc|AI trùng|Cài đặt AI|Môn học|Tiếng Anh/);expect(findAll(root,n=>n.props.class==='composer-launch')).toHaveLength(0);
 });
 it('Teacher AI settings save only operational keys, without Admin achievement settings',async()=>{
  actor('teacher');const root=renderPair();await settle();await click(root,'Cài đặt AI');
  expect(textOf(root)).not.toMatch(/GROQ_API_KEY|service_role|Lưu ngưỡng danh hiệu/);
  findAll(root,n=>n.props.id==='ai-lower')[0].props['onUpdate:modelValue'](65);await settle();
  const form=findAll(root,n=>n.props.id==='ai-settings-form')[0];await form.props.onSubmit({preventDefault(){}});await settle();
  expect(env.rpc).toHaveBeenCalledWith('ai_settings','c',{semantic_duplicate_enabled:true,duplicate_review_threshold:65,duplicate_auto_threshold:90});
 });
 it('Admin hard delete has reason and explicit irreversible confirmation; no restore',async()=>{
  env.rpc.mockImplementation(async(action:string)=>action==='oversight'?{...extra(action),trash:[{...notice,status:'deleted',delete_reason:'mistake'}]}:action==='load'?data():extra(action));
  const root=renderPair();await settle();await click(root,'Thùng rác');expect(findAll(root,n=>n.type==='button').map(textOf)).not.toContain('Khôi phục');
  await click(root,'Xóa vĩnh viễn');expect(textOf(root)).toContain('không thể hoàn tác');
  const dialog=findAll(root,n=>n.props.role==='alertdialog')[0];const textarea=findAll(dialog,n=>n.type==='textarea')[0];expect(textarea.props.maxlength).toBe('500');
  const submit=findAll(dialog,n=>n.type==='button'&&textOf(n)==='Xác nhận xóa vĩnh viễn')[0];expect(submit.props.disabled).toBe(true);
  textarea.props['onUpdate:modelValue']('  Wrong task  ');
  findAll(dialog,n=>n.type==='input'&&n.props.type==='checkbox')[0].props['onUpdate:modelValue'](true);await settle();
  expect(submit.props.disabled).toBe(false);
  await findAll(dialog,n=>n.type==='form')[0].props.onSubmit({preventDefault(){}});await settle();
  expect(env.rpc).toHaveBeenCalledWith('hard_delete','c',{id:'n',confirm_irreversible:true,hard_delete_reason:'Wrong task'});
  expect(findAll(root,n=>n.props.role==='alertdialog')).toHaveLength(0);
 });
 it('personal tombstone is a redacted marker with no notice action',async()=>{
  actor('student');env.rpc.mockImplementation(async(action:string)=>action==='load'?{...data(),history_markers:[{notice_id:'gone',marker:'[Đã xóa vĩnh viễn]',original_created_at:notice.created_at,hard_deleted_at:notice.created_at}]}:{});
  const root=renderPair();await settle();await click(root,'Lịch sử đăng');expect(textOf(root)).toContain('[Đã xóa vĩnh viễn]');expect(textOf(root)).not.toContain('Nội dung');
 });
});
