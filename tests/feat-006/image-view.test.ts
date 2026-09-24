import {test,expect,vi,afterEach} from 'vitest';
import {h,reactive} from 'vue';
import {mount,findAll,settle,textOf} from '../bug-001/renderer';
const call=vi.hoisted(()=>vi.fn());vi.mock('../../src/features/homework/api',()=>({homeworkMedia:call}));
const module=await import('../../src/components/homework/HomeworkImage.vue').catch(()=>({default:null}));
let app:any;afterEach(()=>{app?.unmount();vi.clearAllMocks();});
test('signed image response for old class is ignored after context changes',async()=>{
 expect(module.default).toBeTruthy();let oldResolve:any;
 call.mockImplementationOnce(()=>new Promise(resolve=>oldResolve=resolve)).mockResolvedValue({url:'https://example.invalid/new'});
 const props=reactive({classId:'old-class',attachmentId:'old-image'});
 const view=mount({render:()=>h(module.default!,props)});app=view.app;
 props.classId='new-class';props.attachmentId='new-image';await settle();await settle();
 oldResolve({url:'https://example.invalid/old'});await settle();
 expect(findAll(view.root,n=>n.type==='img')[0].props.src).toBe('https://example.invalid/new');
});
test('image access failure displays retry without hiding notice content or exposing provider errors',async()=>{
 expect(module.default).toBeTruthy();call.mockRejectedValue(Error('provider-secret'));
 const view=mount({render:()=>h(module.default!,{classId:'c',attachmentId:'a'})});app=view.app;await settle();
 expect(textOf(view.root)).toContain('Tải lại ảnh');expect(textOf(view.root)).not.toContain('provider-secret');
});
