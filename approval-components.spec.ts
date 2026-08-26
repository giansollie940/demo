import { h } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { describe, expect, it } from 'vitest'
import ApprovalFilters from '../../src/components/approvals/ApprovalFilters.vue'
import ApprovalList from '../../src/components/approvals/ApprovalList.vue'
import ApprovalDetail from '../../src/components/approvals/ApprovalDetail.vue'
import ApprovalPage from '../../src/pages/ApprovalPage.vue'
import { routes } from '../../src/app/router/routes'

const registration={id:'reg-1',studentId:'student-1',weekId:'week-1',dow:0,period:1,content:'Ôn Toán',note:'Bài 1–5',status:'submitted',aiReviewStatus:'not_needed',aiReason:'Cần giáo viên xác nhận mục tiêu.',aiConfidence:.72,isEmergency:true,emergencyReason:'Em quên xác nhận trước hạn.'}
const student={id:'student-1',code:'HS01',name:'Nguyễn An',role:'student' as const,classId:'class-1',active:true}
const actions={canApprove:true,canRequestRevision:true,canComment:true,canDelete:true,started:false,reported:false}

describe('ApprovalFilters',()=>{it('renders real filter counts',async()=>{const html=await renderToString(h(ApprovalFilters,{modelValue:'attention',counts:{attention:3,approved:5,revision:2,all:10}}));expect(html).toContain('Cần xử lý · 3');expect(html).toContain('Đã duyệt · 5');expect(html).toContain('Cần sửa · 2');expect(html).toContain('Tất cả · 10')})})
describe('ApprovalList',()=>{it('renders student and slot identity as selectable rows',async()=>{const html=await renderToString(h(ApprovalList,{registrations:[registration],users:[student],selectedId:'reg-1'}));expect(html).toContain('Nguyễn An');expect(html).toContain('HS01');expect(html).toContain('Thứ 2 · Tiết 1');expect(html).toContain('aria-current="true"')})})
describe('ApprovalDetail',()=>{it('renders AI, emergency metadata, and eligible actions',async()=>{const html=await renderToString(h(ApprovalDetail,{registration,user:student,actions,saving:false,error:''}));expect(html).toContain('Cần giáo viên xác nhận mục tiêu.');expect(html).toContain('72%');expect(html).toContain('Đăng ký bổ sung');expect(html).toContain('Duyệt');expect(html).toContain('Yêu cầu sửa');expect(html).toContain('AI chưa đúng');expect(html).toContain('Xóa đăng ký')})})
describe('approval route',()=>{it('resolves to the real ApprovalPage component',()=>{const shell=routes.find(item=>item.path==='/');expect(shell?.children?.find(item=>item.path==='review')?.component).toBe(ApprovalPage)})})
