import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { buildWeekDrafts, applyWeekDrafts } from '../../src/features/weeks/week-editor-model'
import { deadlineForSlot } from '../../src/features/registrations/registration-model'
import type { LegacyState } from '../../src/types/legacy'
const text=readFileSync('public/supabase-service.js','utf8')
const sandbox:any={window:{},console}
vm.runInNewContext(text.replace('  function emptyMemoryStats()', '  window.testMapClassWeek=mapClassWeek;\n  function emptyMemoryStats()'),sandbox)
const base={id:'week-1',week_number:1,start_date:'2026-09-07',end_date:'2026-09-11',status:'open',deadline_mode:'week_before_20',registration_deadline:'2026-09-06T20:00:00+07:00'}
describe('class and week deadline precedence',()=>{
 it('preserves explicit weekly mode so frontend agrees with database',()=>{
  const w=sandbox.window.testMapClassWeek(base,{deadline_mode:'week_before_20'})
  expect(w.deadlineMode).toBe('week_before_20')
  expect(deadlineForSlot({week:w,dow:2,deadlineTime:'19:30'})).toBe('2026-09-06T19:30')
 })
 it('inherits class mode when no class-week row exists',()=>{
  const w=sandbox.window.testMapClassWeek(base,undefined,'week_before_20')
  expect(w.deadlineMode).toBe('week_before_20')
  expect(w.deadlineOverrideMode).toBe('inherit')
 })
 it('inherit per-session ignores the old base Sunday deadline',()=>{
  const w=sandbox.window.testMapClassWeek(base,{deadline_mode:'inherit'},'per_session_20')
  expect(w.deadline).toBe('')
  expect(deadlineForSlot({week:w,dow:2,deadlineTime:'19:30'})).toBe('2026-09-08T19:30')
 })
 it('explicit per-session wins over a whole-week class default',()=>{
  expect(sandbox.window.testMapClassWeek(base,{deadline_mode:'per_session_20'},'week_before_20').deadlineMode).toBe('per_session_20')
 })
 it('keeps specific mode even if the date is missing so validation can catch it',()=>{
  expect(sandbox.window.testMapClassWeek(base,{deadline_mode:'specific',registration_deadline:null},'week_before_20').deadlineMode).toBe('specific')
 })
 it('keeps inheritance distinct in the draft and resolves it on save',()=>{
  const state={settings:{registrationDeadlineMode:'week_before_20'},weeks:[{id:'w',number:1,startDate:'2026-09-07',endDate:'2026-09-11',deadlineMode:'per_session_20',deadlineOverrideMode:'inherit',deadline:'2026-09-06T20:00'}]} as unknown as LegacyState
  const drafts=buildWeekDrafts(state.weeks)
  expect(drafts[0].deadlineMode).toBe('inherit')
  const next=applyWeekDrafts(state,drafts)
  expect(next.weeks[0]).toMatchObject({deadlineMode:'week_before_20',deadlineOverrideMode:'inherit',deadline:''})
 })
 it('does not change a weekly override merely by editing the note',()=>{
  const w=sandbox.window.testMapClassWeek(base,{deadline_mode:'week_before_20'},'per_session_20')
  const state={settings:{},weeks:[w]} as unknown as LegacyState
  const drafts=buildWeekDrafts(state.weeks);drafts[0].note='Giữ hạn'
  expect(applyWeekDrafts(state,drafts).weeks[0].deadlineMode).toBe('week_before_20')
 })
})
import { saveSettingsMutation } from '../../src/features/settings/settings-mutations'
import type { LegacyMutationRuntime } from '../../src/features/shared/legacy-mutation'
describe('saving class defaults',()=>{
 it('updates inherited weeks and preserves weekly and specific overrides through reload',async()=>{
  let state={settings:{registrationDeadlineTime:'19:30',registrationDeadlineMode:'per_session_20'},weeks:[
   {id:'a',deadlineMode:'per_session_20',deadlineOverrideMode:'inherit'},
   {id:'b',deadlineMode:'per_session_20',deadlineOverrideMode:'per_session_20'},
   {id:'c',deadlineMode:'specific',deadlineOverrideMode:'specific',deadline:'2026-09-09T17:00'}
  ]} as unknown as LegacyState
  const runtime={currentUser:{id:'teacher'},getState:()=>state,service:{syncState:async(next:LegacyState)=>{state=structuredClone(next)}},reload:async()=>state,hydrate:()=>{},invalidate:async()=>{}} as unknown as LegacyMutationRuntime
  await saveSettingsMutation(runtime,'class',{announcement:'',registrationDeadlineTime:'18:15',registrationDeadlineMode:'week_before_20',aiAutomationEnabled:true,aiAutoApproveThreshold:.9})
  expect(state.settings).toMatchObject({registrationDeadlineTime:'18:15',registrationDeadlineMode:'week_before_20'})
  expect(state.weeks[0].deadlineMode).toBe('week_before_20')
  expect(state.weeks[1].deadlineMode).toBe('per_session_20')
  expect(state.weeks[2].deadline).toBe('2026-09-09T17:00')
  expect(buildWeekDrafts(state.weeks)[0].deadlineMode).toBe('inherit')
 })
 it('rejects an invalid time before trying to sync',async()=>{
  await expect(saveSettingsMutation({} as LegacyMutationRuntime,'class',{announcement:'',registrationDeadlineTime:'25:00',aiAutomationEnabled:true,aiAutoApproveThreshold:.9})).rejects.toThrow('Giờ chốt đăng ký không hợp lệ.')
 })
})
describe('database time normalization',()=>{
 const expression=text.match(/registrationDeadlineTime:([^\r\n]+)/)![1]
 it.each([['19:30:00','19:30'],['21:15:00.000000','21:15'],['00:00:00','00:00'],['19:30:99','20:00']])('reads %s as %s',(raw,expected)=>{
  expect(vm.runInNewContext(expression,{cs:{per_session_deadline_time:raw}})).toBe(expected)
 })
})
