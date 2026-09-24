import { describe, it, expect } from 'vitest';
import { createSSRApp } from 'vue';
import { renderToString } from '@vue/server-renderer';
import Warning from '../../src/components/homework/HomeworkDuplicateWarning.vue';
import { dateLabel, type Notice } from '../../src/features/homework/api';
const existing = {id:'old',class_id:'class',subject_id:'math',english_group_id:null,status:'published',subject:'Toán',title:'Bài phân số',due_at:'2026-09-11T12:00:00Z',created_at:'2026-09-09T03:00:00Z',author_name:'Bạn An'} as Notice;
const notice = {...existing,id:'new',status:'duplicate_rejected',duplicate_of:'old',candidate:{title:'PRIVATE_AI_DATA'}} as Notice;
const render = (n:Notice,visibleNotices:Notice[])=>renderToString(createSSRApp(Warning,{notice:n,visibleNotices,busy:false}));
describe('R-003 duplicate warning',()=>{
 it('shows required existing notice details and both actions',async()=>{
  const html=await render(notice,[existing]);
  for(const text of ['Có vẻ nội dung này đã được báo trước đó.','Toán','Bài phân số','Bạn An',dateLabel(existing.due_at),dateLabel(existing.created_at),'Xem thông báo đã có','Sửa nội dung'])expect(html).toContain(text);
  expect(html).not.toContain('PRIVATE_AI_DATA');
 });
 it('never renders candidates absent from the public visible feed, private, or outside scope',async()=>{
  for(const feed of [[],[{...existing,status:'pending_duplicate_review'}],[{...existing,class_id:'other'}],[{...existing,english_group_id:'other'}]]){
    const html=await render(notice,feed);
    expect(html).not.toContain('Bạn An');expect(html).not.toContain('PRIVATE_AI_DATA');expect(html).not.toContain('Xem thông báo đã có');
  }
 });
 it('does not warn on an already published, deleted or replaced notice',async()=>{
  for(const status of ['published','deleted','replaced'])expect(await render({...notice,status},[existing])).not.toContain('Xem thông báo đã có');
 });
});
