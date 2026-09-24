import {test,expect,vi,afterEach,beforeEach} from 'vitest';
import {reactive,h} from 'vue';
import {mount,settle} from '../bug-001/renderer';
const mocks=vi.hoisted(()=>({store:vi.fn(),compress:vi.fn(),call:vi.fn()}));
vi.mock('../../src/features/homework/api',()=>({homeworkMedia:mocks.call}));
vi.mock('../../src/features/homework/image',()=>({compressImage:mocks.compress}));
vi.mock('../../src/features/homework/media-draft',()=>({draftStore:mocks.store}));
import {useMediaComposer} from '../../src/features/homework/media-composer';
let app:any;
beforeEach(()=>{mocks.store.mockResolvedValue(null);mocks.compress.mockResolvedValue({blob:new Blob(['webp'],{type:'image/webp'}),width:10,height:10,checksum:'a'.repeat(64)});});
afterEach(()=>{app?.unmount();vi.resetAllMocks();});
function setup(){let media:any;const form=reactive({title:'Draft',request_id:'post-request'});const scope=reactive({ownerId:'author',classId:'class'});
 const view=mount({setup(){media=useMediaComposer(form,()=>scope,()=>true);return()=>h('div');}});app=view.app;return {media,form,scope};}
test('selection persists compressed Blob and form locally without uploading; exact draft can be restored',async()=>{
 const {media,form}=setup();media.open();await settle();await media.choose(new File(['original'],'a.png',{type:'image/png'}));
 expect(mocks.call).not.toHaveBeenCalled();const saved=mocks.store.mock.calls.filter(c=>c[0]==='put').at(-1)!;
 expect(saved[1]).toBe('author:class:new:notice');expect(saved[2].image.blob).toBeInstanceOf(Blob);expect(saved[2].form.title).toBe('Draft');
 mocks.store.mockResolvedValueOnce(saved[2]);media.open();await settle();form.title='Blank';media.restore();await settle();expect(form.title).toBe('Draft');expect(media.image.value.blob).toBeInstanceOf(Blob);
});
test('draft from stale notice revision is not restored',async()=>{
 mocks.store.mockResolvedValue({baseVersion:'1',form:{title:'stale'}});const {media,form}=setup();media.open({id:'n',revision:2});await settle();media.restore();expect(form.title).toBe('Draft');expect(media.recoverable.value).toBeNull();
});
test('closing while image decoding is pending does not put image in the next class composer',async()=>{
 let resolve:any;mocks.compress.mockImplementationOnce(()=>new Promise(r=>resolve=r));const {media,scope}=setup();media.open();await settle();const work=media.choose(new File(['a'],'a.png'));media.close();scope.classId='other';media.open();resolve({blob:new Blob(['a']),width:1,height:1,checksum:'a'});await work;expect(media.image.value).toBeNull();expect(media.compressing.value).toBe(false);
});
test('pending removal blocks submit until cancellation settles, then supports text-only even if storage is offline',async()=>{
 const {media}=setup();media.open();await settle();await media.choose(new File(['a'],'a.png'));media.image.value.pendingId='pending';let reject:any;mocks.call.mockImplementation(()=>new Promise((_r,j)=>reject=j));
 const removal=media.remove();await expect(media.payload({})).rejects.toThrow('Ảnh đang được xử lý.');reject(Error('offline'));await removal;
 expect(media.image.value).toBeNull();expect(await media.payload({})).toMatchObject({attachment_id:null});expect(media.note.value).toContain('nội dung chữ');
});
