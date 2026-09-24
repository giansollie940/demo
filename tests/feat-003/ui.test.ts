import {beforeEach,afterEach,it,expect,vi} from 'vitest'
import {reactive} from 'vue'
import {createPinia,setActivePinia} from 'pinia'
import {mount,click,textOf,findAll,settle} from '../bug-001/renderer'
const env=vi.hoisted(()=>({auth:null as any,ctx:null as any,rpc:vi.fn(),directory:vi.fn(),stored:null as any,failIds:new Set<string>()}))
vi.mock('../../src/stores/auth',()=>({useAuthStore:()=>env.auth}))
vi.mock('../../src/stores/context',()=>({useContextStore:()=>env.ctx}))
vi.mock('../../src/services/legacy-supabase',()=>({legacyApi:{teacherListUsers:env.directory}}))
vi.mock('../../src/features/homework/api',async original=>({...await original<any>(),homeworkRpc:env.rpc}))
import HomeworkPage from '../../src/pages/HomeworkPage.vue'
const users=[{id:'a',code:'230003',fullName:'Bình',classId:'c',active:true,role:'student'}, {id:'b',code:'230001',fullName:'Chi',classId:'c',active:true,role:'student'}, {id:'c',code:'230002',fullName:'An',classId:'c',active:true,role:'monitor'}]
const initial=()=>({subjects:[],groups:[{id:'g1',name:'E1',is_active:true},{id:'g3',name:'E3',is_active:true}],members:[{student_id:'a',english_group_id:'g1'},{student_id:'b',english_group_id:'g3'}],learners:users.map(u=>({id:u.id,name:u.fullName})),notices:[],history:[],queue:[],trash:[],audit:[],notifications:[],leaderboard:[],settings:{seed_threshold:3},ai_settings:{semantic_duplicate_enabled:true,duplicate_review_threshold:70,duplicate_auto_threshold:90}})
let app:any,root:any
beforeEach(()=>{
 setActivePinia(createPinia());env.stored=initial();env.failIds=new Set();env.auth=reactive({currentUser:{id:'teacher',classId:'c'},role:'teacher'});env.ctx=reactive({selectedClassId:'c',selectedWeekId:null,classes:[],weeks:[]});env.directory.mockReset().mockResolvedValue({users});
 env.rpc.mockReset().mockImplementation(async(action:string,_class:string,p:any)=>{
  if(action==='oversight')return {metrics:{},hearts:0,history:[],audit:[],catalog_audit:[],trash:[],people:[]}
  if(action==='catalog_list')return []
  if(action==='context')return {grades:[7],classes:[{id:'c',grade:7,code:'7A9',active:true}]}
  if(action==='load')return structuredClone(env.stored)
  if(action==='ai_settings')env.stored.ai_settings={...p}
  if(action==='group_assign'){if(env.failIds.has(p.student_id))throw Error('Nhóm không còn hoạt động');env.stored.members=env.stored.members.filter((m:any)=>m.student_id!==p.student_id).concat({student_id:p.student_id,english_group_id:p.english_group_id})}
  return {ok:true}
 });
 vi.stubGlobal('Document',class{});vi.stubGlobal('ShadowRoot',class{});vi.stubGlobal('document',{activeElement:null});
})
afterEach(()=>{app?.unmount();app=null;vi.unstubAllGlobals()})
async function render(tab:string){const x=mount(HomeworkPage);app=x.app;root=x.root;await settle();await click(root,tab);await settle();return root}
function field(id:string){const n=findAll(root,n=>n.props.id===id)[0];expect(n,`field ${id}`).toBeDefined();return n}
async function value(id:string,v:any){const f=field(id);if(f.props['onUpdate:modelValue'])f.props['onUpdate:modelValue'](v);else await f.props.onChange?.({target:{value:v,checked:v}});await settle()}
function rows(){return findAll(root,n=>n.props['data-student-id']).map(n=>n.props['data-student-id'])}
async function select(id:string){const f=field('select-'+id);f.props['onUpdate:modelValue']([...f._modelValue,id]);await settle()}
const mutations=()=>env.rpc.mock.calls.filter(c=>!['load','context'].includes(c[0]))
it('AC-301/302 displays settings visualization and keeps valid edits local until save',async()=>{
 await render('Cài đặt AI');expect(textOf(root)).toContain('Đăng bình thường');expect(textOf(root)).toContain('Chờ GV từ (%)');
 await value('ai-lower',65);expect(textOf(root)).toContain('Chưa lưu thay đổi');expect(field('ai-scale').props['aria-label']).toContain('65');expect(mutations()).toHaveLength(0);
})
it('AC-303 rejects empty, equal, reversed, fractional and out-of-range thresholds without request',async()=>{
 await render('Cài đặt AI');for(const [lower,upper] of [['',90],[90,90],[95,80],[-1,90],[70,101],[70.5,90]]){await value('ai-lower',lower);await value('ai-upper',upper);await field('ai-settings-form').props.onSubmit({preventDefault(){}});await settle();expect(findAll(root,n=>n.props.id==='ai-validation').map(textOf).join('')).toContain('số nguyên');expect(mutations()).toHaveLength(0);}
})
it('AC-304/305 save confirms reloaded values; provider save failure retains dirty form',async()=>{
 await render('Cài đặt AI');await value('ai-lower',60);await field('ai-settings-form').props.onSubmit({preventDefault(){}});await settle();await settle();expect(textOf(root)).toContain('Đã lưu');expect(env.stored.ai_settings.duplicate_review_threshold).toBe(60);
 await value('ai-upper',95);env.rpc.mockRejectedValueOnce(Error('Mất kết nối'));await field('ai-settings-form').props.onSubmit({preventDefault(){}});await settle();expect(textOf(root)).toContain('Mất kết nối');expect(field('ai-save-state').props['data-state']).toBe('error');
})
it('EC-303 unsaved settings survive tab navigation without false saved state',async()=>{
 await render('Cài đặt AI');await value('ai-lower',64);await click(root,'Bảng Báo bài');await click(root,'Cài đặt AI');expect(textOf(field('ai-save-state'))).toContain('Chưa lưu thay đổi');expect(field('ai-lower').props.value ?? field('ai-lower')._value).not.toBe(70);expect(mutations()).toHaveLength(0);
})
it('AC-306/307 cards count current memberships; default code sort; card selection is read-only',async()=>{
 await render('Tiếng Anh');expect(rows()).toEqual(['b','c','a']);expect(textOf(field('group-g1'))).toContain('1 thành viên');await field('group-g1').props.onClick();await settle();expect(rows()).toEqual(['a']);expect(mutations()).toHaveLength(0);
})
it('AC-308/309/310 search matches trimmed code/name, sorts and unassigned filter',async()=>{
 await render('Tiếng Anh');await value('student-search','  bÌNH  ');expect(rows()).toEqual(['a']);await value('student-search','230001');expect(rows()).toEqual(['b']);await value('student-search','');await value('student-sort','name');expect(rows()).toEqual(['c','a','b']);await value('student-sort','group');expect(rows()).toEqual(['a','b','c']);await value('unassigned-only',true);expect(rows()).toEqual(['c']);
})
it('AC-311/319 checkbox batch assigns exactly visible selection and reloads membership',async()=>{
 await render('Tiếng Anh');await select('a');await select('c');expect(textOf(field('assignment-bar'))).toContain('2 học sinh');await value('assignment-target','g3');await field('assignment-form').props.onSubmit({preventDefault(){}});await settle();await settle();expect(env.stored.members.filter((m:any)=>m.english_group_id==='g3')).toHaveLength(3);expect(textOf(root)).toContain('Đã chuyển 2 học sinh');expect(mutations().filter(x=>x[0]==='group_assign').map(x=>x[2].student_id).sort()).toEqual(['a','c']);
})
it('AC-312 partial failure reports correct counts and updates from server',async()=>{
 env.failIds.add('a');await render('Tiếng Anh');await select('a');await select('b');await value('assignment-target','g1');await field('assignment-form').props.onSubmit({preventDefault(){}});await settle();await settle();expect(textOf(root)).toContain('1 thành công');expect(textOf(root)).toContain('1 thất bại');expect(textOf(root)).toContain('Nhóm không còn hoạt động');expect(env.stored.members.find((m:any)=>m.student_id==='b').english_group_id).toBe('g1');
})
it('AC-313 search/filter clears hidden selections; select-all only selects visible rows',async()=>{
 await render('Tiếng Anh');await select('a');await value('student-search','230001');expect(findAll(root,n=>n.props.id==='assignment-bar')).toHaveLength(0);await value('select-visible',true);await value('assignment-target','g1');await field('assignment-form').props.onSubmit({preventDefault(){}});await settle();await settle();expect(mutations().filter(x=>x[0]==='group_assign').map(x=>x[2].student_id)).toEqual(['b']);
})
it('AC-320 directory failure is a load error, not an empty roster',async()=>{
 env.directory.mockRejectedValue(Error('Không tải được mã học sinh'));await render('Tiếng Anh');expect(textOf(root)).toContain('Không tải được mã học sinh');expect(textOf(root)).not.toContain('Không có kết quả tìm kiếm');
})
it('AC-315 non-Teacher actors never load management directory or get management controls',async()=>{
 for(const role of ['student','monitor','admin']){env.auth.role=role;const x=mount(HomeworkPage);app=x.app;root=x.root;await settle();expect(findAll(root,n=>n.type==='button').map(textOf)).not.toContain('Cài đặt AI');expect(findAll(root,n=>n.type==='button').map(textOf)).not.toContain('Tiếng Anh');app.unmount();app=null;}expect(env.directory).not.toHaveBeenCalled();
})
it('AI saved state compares values independently of JSON property order',async()=>{
 env.stored.ai_settings={duplicate_auto_threshold:90,duplicate_review_threshold:70,semantic_duplicate_enabled:true};await render('Cài đặt AI');expect(field('ai-save-state').props['data-state']).toBe('saved');
})
it('AI readback failure never becomes saved just by editing back to the old value',async()=>{
 await render('Cài đặt AI');await value('ai-lower',60);env.rpc.mockResolvedValueOnce({ok:true}).mockRejectedValueOnce(Error('Chưa tải lại được cài đặt'));await field('ai-settings-form').props.onSubmit({preventDefault(){}});await settle();expect(field('ai-save-state').props['data-state']).toBe('error');await value('ai-lower',65);await value('ai-lower',70);expect(field('ai-save-state').props['data-state']).toBe('error');
})
it('AI boundary 0/100 is valid and save blocks double submission while in flight',async()=>{
 await render('Cài đặt AI');await value('ai-lower',0);await value('ai-upper',100);let resolve!: (v:any)=>void;env.rpc.mockImplementationOnce(()=>new Promise(r=>resolve=r));const first=field('ai-settings-form').props.onSubmit({preventDefault(){}});await settle();expect(field('ai-save-state').props['data-state']).toBe('saving');await field('ai-settings-form').props.onSubmit({preventDefault(){}});expect(mutations()).toHaveLength(1);resolve({ok:true});await first;await settle();
})
it('Batch reload failure is explicit, clears selection and blocks a second assignment until refresh',async()=>{
 await render('Tiếng Anh');await select('a');await value('assignment-target','g3');env.rpc.mockResolvedValueOnce({ok:true}).mockRejectedValueOnce(Error('Mất kết nối khi tải lại'));await field('assignment-form').props.onSubmit({preventDefault(){}});await settle();expect(textOf(root)).toContain('Chưa tải lại được phân nhóm');expect(textOf(root)).not.toContain('Đã chuyển 1 học sinh');expect(field('select-a').props.disabled).toBe(true);expect(findAll(root,n=>n.props.id==='assignment-bar')).toHaveLength(0);
})
it('Inactive group keeps current members; unassigned means no current membership',async()=>{
 env.stored.groups[0].is_active=false;await render('Tiếng Anh');expect(textOf(field('group-g1'))).toContain('1 thành viên · Tạm ngưng');await value('unassigned-only',true);expect(rows()).toEqual(['c']);
})
it('Filter changes clear selection and selection never relies on sort order',async()=>{
 await render('Tiếng Anh');await select('a');await value('student-sort','name');expect(textOf(field('assignment-bar'))).toContain('1 học sinh');await value('unassigned-only',true);expect(findAll(root,n=>n.props.id==='assignment-bar')).toHaveLength(0);
})
it('Directory join never presents codes belonging to another class',async()=>{
 env.directory.mockResolvedValue({users:users.map(u=>({...u,classId:'elsewhere',code:'OTHER_CLASS_CODE'}))});await render('Tiếng Anh');expect(textOf(root)).not.toContain('OTHER_CLASS_CODE');expect(textOf(root)).toContain('Chưa có mã');
})
it('Empty group and no-result search are distinct from loading errors',async()=>{
 env.stored.groups.push({id:'empty',name:'E9',is_active:true});await render('Tiếng Anh');await field('group-empty').props.onClick();await settle();expect(textOf(root)).toContain('Nhóm chưa có thành viên');await value('student-search','absent');expect(textOf(root)).toContain('Không có kết quả tìm kiếm');
})
it('An older page reload cannot overwrite settings confirmed by a later save',async()=>{
 await render('Cài đặt AI');const old=structuredClone(env.stored);let resolve!: (v:any)=>void;env.rpc.mockImplementationOnce(()=>new Promise(r=>resolve=r));const refresh=findAll(root,n=>n.type==='button'&&textOf(n).includes('↻ Làm mới'))[0].props.onClick();await value('ai-lower',60);await field('ai-settings-form').props.onSubmit({preventDefault(){}});await settle();resolve(old);await refresh;await settle();expect(field('ai-lower').value).toBe(60);
})
it('Directory loading, zero selection and unassigned-empty states are explicit',async()=>{
 let resolve!: (v:any)=>void;env.directory.mockImplementationOnce(()=>new Promise(r=>resolve=r));await render('Tiếng Anh');expect(textOf(root)).toContain('Đang tải danh sách học sinh');expect(findAll(root,n=>n.props.id==='assignment-form')).toHaveLength(0);resolve({users});await settle();await settle();expect(textOf(root)).toContain('Chưa chọn học sinh');env.stored.members.push({student_id:'c',english_group_id:'g1'});await click(root,'↻ Làm mới');await value('unassigned-only',true);expect(textOf(root)).toContain('Không có học sinh chưa gán nhóm');
})
it('Batch blocks double submit and stops remaining requests on role change',async()=>{
 await render('Tiếng Anh');await select('a');await select('b');await value('assignment-target','g3');let resolve!: (v:any)=>void;env.rpc.mockImplementationOnce(()=>new Promise(r=>resolve=r));const first=field('assignment-form').props.onSubmit({preventDefault(){}});await settle();await field('assignment-form').props.onSubmit({preventDefault(){}});expect(mutations()).toHaveLength(1);env.auth.role='student';await settle();resolve({ok:true});await first;await settle();expect(mutations()).toHaveLength(1);expect(findAll(root,n=>n.props.id==='assignment-bar')).toHaveLength(0);
})
