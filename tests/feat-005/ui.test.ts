import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {h} from 'vue';
import {mount,textOf,findAll,click,settle} from '../bug-001/renderer';
import Card from '../../src/components/homework/HomeworkCard.vue';
import CorrectionPanel from '../../src/components/homework/HomeworkCorrectionPanel.vue';
import Reports from '../../src/components/homework/HomeworkReports.vue';
import {homeworkTabs} from '../../src/features/homework/view-context';
import type {Notice,Correction} from '../../src/features/homework/api';
const notice={id:'n',class_id:'c',author_id:'s',author_role:'student',author_name:'Author',title:'Bài tập',content:'Bản công khai',due_at:'2099-01-01T00:00:00Z',created_at:'2026-09-01T00:00:00Z',status:'published',subject:'Toán',hearts:0} as Notice;
let app:any;beforeEach(()=>{vi.stubGlobal('Document',class{});vi.stubGlobal('ShadowRoot',class{});vi.stubGlobal('document',{activeElement:null});});afterEach(()=>{app?.unmount();vi.unstubAllGlobals();});
function render(c:any,props:any){const mounted=mount({render:()=>h(c,props)});app=mounted.app;return mounted.root;}
const buttons=(root:any)=>findAll(root,n=>n.type==='button').map(n=>textOf(n).trim());
it('AC-501/503: only author edits/deletes; Monitor reports; Teacher requests correction/removes; Student cannot report',()=>{
 for(const [role,id] of [['monitor','m'],['teacher','t'],['student','other'],['admin','a']]){
  const root=render(Card,{notice,userId:id,role,busy:false,now:0});const actions=buttons(root);expect(actions).not.toContain('Sửa');expect(actions).not.toContain('Xóa');
  expect(actions.includes('Báo sai thông tin')).toBe(role==='monitor');expect(actions.includes('Gỡ bài')).toBe(role==='teacher');expect(actions.includes('Yêu cầu chỉnh sửa Báo bài')).toBe(role==='teacher');
  if(role==='monitor')expect(actions).not.toContain('🔔 Nhắc');app.unmount();app=null;
 }
 const root=render(Card,{notice,userId:'s',role:'student',busy:false,now:0});expect(buttons(root)).toContain('Sửa');expect(buttons(root)).toContain('Xóa');
});
it('AC-511/515/518/520: pending published card, final round badge and withdrawal replaces delete',()=>{
 const root=render(Card,{notice:{...notice,correction:{id:'cor',round:2,version:4,status:'awaiting_teacher'}},userId:'s',role:'student',busy:false,now:0});
 expect(textOf(root)).toContain('Bản công khai');expect(textOf(root)).toContain('Lần chỉnh sửa cuối');expect(textOf(root)).toContain('Đang chờ GV xác nhận chỉnh sửa');expect(buttons(root)).toContain('Xin rút bài');expect(buttons(root)).not.toContain('Xóa');expect(buttons(root)).not.toContain('Sửa');
});
const correction={id:'cor',notice_id:'n',class_id:'c',version:4,round:2,status:'awaiting_teacher',closed_at:null,rounds:[{round:2,requested_at:'2026-09-01T00:00:00Z',due_at:'2026-09-04T00:00:00Z',reason:'Sửa lại bài',issue_types:['content'],draft:{title:'Revision riêng tư',content:'Nội dung mới',subject_id:'sub',english_group_id:null,due_at:'2026-10-01T00:00:00Z'},submitted_at:'2026-09-02T00:00:00Z'}],events:[]} as Correction;
it('correction panel shows timer stopped, private revision, optimistic version and requires reject reason',async()=>{
 const decide=vi.fn();const root=render(CorrectionPanel,{correction,notice,userId:'t',role:'teacher',busy:false,now:Date.now(),onDecide:decide});
 expect(textOf(root)).toContain('Đồng hồ đã dừng');expect(textOf(root)).toContain('Revision riêng tư');expect(findAll(root,n=>n.type==='button'&&textOf(n).includes('Chưa đạt'))[0].props.disabled).toBe(true);
 await click(root,'Đạt');expect(decide).toHaveBeenCalledWith({id:'n',correction_id:'cor',round:2,version:4,decision:'approved',reason:''});
 findAll(root,n=>n.type==='textarea')[0].props['onUpdate:modelValue']('Vẫn sai');await settle();await findAll(root,n=>n.type==='form')[0].props.onSubmit({preventDefault(){}});expect(decide).toHaveBeenLastCalledWith(expect.objectContaining({decision:'rejected',reason:'Vẫn sai'}));
});
it('reports show Teacher-only identity, outcomes, counts and no automatic punishment',async()=>{
 const process=vi.fn();const root=render(Reports,{reports:[{id:'r',notice_id:'n',reporter_name:'Cán sự Mai',reporter_code:'HS01',created_at:'2026-09-01T00:00:00Z',category:'content',status:'open',note:'Thông tin sai',events:[]}],statistics:[{reporter_id:'m',full_name:'Mai',total:3,valid:0,invalid:1,suspected_abuse:2}],busy:false,onProcess:process});
 expect(textOf(root)).toContain('Cán sự Mai');expect(textOf(root)).toContain('HS01');expect(textOf(root)).toContain('không tự khóa');await click(root,'Hợp lệ');expect(process).toHaveBeenCalledWith({id:'n',report_id:'r',outcome:'valid',note:''});
 for(const role of ['student','monitor','admin'])expect(homeworkTabs(role).map(t=>t.id)).not.toContain('reports');expect(homeworkTabs('teacher').map(t=>t.id)).toContain('reports');expect(homeworkTabs('admin').map(t=>t.id)).not.toContain('corrections');
});
it('R-001: Teacher can compare published and submitted subject/group, including inactive catalog entries',()=>{
 const root=render(CorrectionPanel,{correction:{...correction,rounds:[{...correction.rounds[0],draft:{...correction.rounds[0].draft,subject_id:'english',english_group_id:'e2'}}]},
  notice:{...notice,subject_id:'math',subject:'Toán',english_group_id:null,english_group:null},userId:'t',role:'teacher',busy:false,now:0,
  subjects:[{id:'math',name:'Toán',is_active:true},{id:'english',name:'Tiếng Anh mới',is_active:false}],groups:[{id:'e2',name:'Nhóm English 2',is_active:false}]});
 const comparison=findAll(root,n=>n.props.class==='revision-comparison')[0];expect(comparison).toBeDefined();
 expect(textOf(comparison)).toContain('Bản đang công khai');expect(textOf(comparison)).toContain('Bản gửi lại');
 expect(textOf(comparison)).toContain('Toán');expect(textOf(comparison)).toContain('Không áp dụng');expect(textOf(comparison)).toContain('Tiếng Anh mới');expect(textOf(comparison)).toContain('Nhóm English 2');
});
it('R-001: removed group is shown explicitly and unknown references never reuse another subject/group name',()=>{
 const root=render(CorrectionPanel,{correction,notice:{...notice,subject_id:'english',subject:'Tiếng Anh cũ',english_group_id:'old-group',english_group:'Nhóm cũ'},userId:'t',role:'teacher',busy:false,now:0,subjects:[],groups:[]});
 expect(textOf(root)).toContain('Tiếng Anh cũ');expect(textOf(root)).toContain('Nhóm cũ');
 expect(textOf(root)).toContain('Môn không còn trong danh mục lớp');expect(textOf(root)).toContain('Không áp dụng');
});
