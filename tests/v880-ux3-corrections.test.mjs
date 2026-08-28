import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequire } from 'node:module'

const require=createRequire(import.meta.url)
const ts=require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript/lib/typescript.js')
const read=(path)=>fs.readFileSync(path,'utf8')
function loadEngine(){
  const source=read('src/features/timetable/timetable-engine.ts')
  const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
  const module={exports:{}}
  new Function('exports','module','require',js)(module.exports,module,require)
  return module.exports
}

test('timetable builder auto-applies short breaks and optionally replaces one with a long break per session',()=>{
  const {defaultTimetableConfig,calculateTimetable}=loadEngine()
  const config=defaultTimetableConfig()
  config.morningLongBreakEnabled=false
  config.afternoonLongBreakEnabled=false
  config.breakRules=[]
  const shortOnly=calculateTimetable(config,0)
  assert.equal(shortOnly.errors.length,0)
  assert.equal(shortOnly.periods[0].breakAfter?.type,'short')
  assert.equal(shortOnly.periods[0].breakAfter?.minutes,config.shortBreakMinutes)
  assert.equal(shortOnly.periods.filter((row)=>row.session==='morning').every((row,index,rows)=>index===rows.length-1||row.breakAfter?.type==='short'),true)

  config.morningLongBreakEnabled=true
  config.morningLongBreakAfterPeriod=2
  const withLong=calculateTimetable(config,0)
  assert.deepEqual(withLong.periods.find((row)=>row.number===2)?.breakAfter,{type:'long',minutes:config.longBreakMinutes})
})

test('advanced explicit break rules still override automatically generated breaks',()=>{
  const {defaultTimetableConfig,calculateTimetable}=loadEngine()
  const config=defaultTimetableConfig()
  config.breakRules=[{afterPeriod:1,type:'custom',minutes:10},{afterPeriod:2,type:'none'}]
  const result=calculateTimetable(config,0)
  assert.deepEqual(result.periods.find((row)=>row.number===1)?.breakAfter,{type:'custom',minutes:10})
  assert.equal(result.periods.find((row)=>row.number===2)?.breakAfter,null)
})

test('admin timetable builder keeps automatic break inputs primary and manual rules under advanced exceptions',()=>{
  const source=read('src/components/admin/AdminTimetableBuilder.vue')
  assert.match(source,/Chỉ nghỉ ngắn/)
  assert.match(source,/Có nghỉ dài/)
  assert.match(source,/morningLongBreakEnabled/)
  assert.match(source,/afternoonLongBreakEnabled/)
  assert.match(source,/Ngoại lệ nâng cao/)
  assert.match(source,/Nghỉ giữa các tiết/)
})

test('tracking uses compact session selectors and clickable metrics inside one continuous workspace',()=>{
  const source=read('src/pages/TrackingPage.vue')
  assert.match(source,/session-selector/)
  assert.match(source,/tracking-workspace/)
  assert.match(source,/metric-button/)
  assert.match(source,/@click="filter='missing'"/)
  assert.match(source,/@click="filter='device'"/)
  assert.doesNotMatch(source,/SessionSummaryCard/)
})

test('week management has a laptop-width scrollable master column and applied deadline label',()=>{
  const page=read('src/pages/WeeksPage.vue')
  const editor=read('src/components/weeks/WeekEditorCard.vue')
  assert.match(page,/clamp\(280px,\s*25vw,\s*330px\)/)
  assert.match(page,/scrollbar-gutter:\s*stable/)
  assert.match(page,/min-height:\s*0/)
  assert.match(editor,/deadlineDraft/)
  assert.match(editor,/Áp dụng hạn/)
  assert.match(editor,/Hủy/)
  assert.match(editor,/specificDeadlineLabel/)
})

test('new automatic break settings survive admin directory normalization and Edge validation',()=>{
  const directory=read('src/features/admin/admin-directory.ts')
  const edge=read('supabase/functions/admin-manage-classes/index.ts')
  for(const key of ['morningLongBreakEnabled','morningLongBreakAfterPeriod','afternoonLongBreakEnabled','afternoonLongBreakAfterPeriod']){
    assert.match(directory,new RegExp(key))
    assert.match(edge,new RegExp(key))
  }
})
