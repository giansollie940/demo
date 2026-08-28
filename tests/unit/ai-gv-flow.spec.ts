import { describe, expect, it } from 'vitest'
import { aiReviewHistoryLabel, needsTeacherAction } from '../../src/features/registrations/registration-model'
import { registrationBucket } from '../../src/features/tracking/tracking-model'
import type { RegistrationRecord } from '../../src/types/legacy'

const base:RegistrationRecord={id:'r1',studentId:'s1',weekId:'w1',dow:0,period:1,content:'Ôn tập',status:'submitted'}

describe('AI → teacher queue state',()=>{
  it('keeps only unresolved submitted records in teacher queue',()=>{
    expect(needsTeacherAction({...base,aiReviewStatus:'manual'})).toBe(true)
    expect(needsTeacherAction({...base,aiReviewStatus:'error'})).toBe(true)
    expect(needsTeacherAction({...base,aiReviewStatus:'pending'})).toBe(false)
    expect(needsTeacherAction({...base,status:'approved',aiReviewStatus:'manual',approvalSource:'manual'})).toBe(false)
    expect(needsTeacherAction({...base,status:'needs_revision',aiReviewStatus:'approved'})).toBe(false)
  })

  it('does not classify resolved AI history as tracking attention',()=>{
    expect(registrationBucket({...base,status:'approved',aiReviewStatus:'error'})).toBe('registered')
    expect(registrationBucket({...base,status:'approved',aiReviewStatus:'manual'})).toBe('registered')
  })

  it('labels AI history separately from current registration status',()=>{
    expect(aiReviewHistoryLabel({...base,status:'approved',aiReviewStatus:'manual',approvalSource:'manual'})).toBe('AI chuyển GV · Đã xử lý')
    expect(aiReviewHistoryLabel({...base,status:'needs_revision',aiReviewStatus:'approved'})).toBe('AI từng duyệt · GV yêu cầu sửa')
    expect(aiReviewHistoryLabel({...base,status:'submitted',aiReviewStatus:'manual'})).toBe('AI chuyển GV')
  })
})
