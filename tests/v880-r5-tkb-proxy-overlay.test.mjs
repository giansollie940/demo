import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root=path.resolve(new URL('..',import.meta.url).pathname)
const read=(file)=>fs.readFileSync(path.join(root,file),'utf8')

test('timetable snapshot clone accepts reactive-style proxies and detaches nested values',async()=>{
  const module=await import('../src/features/timetable/timetable-clone.js')
  const nestedOverride=new Proxy({morningStart:'07:10',morningEnd:'11:25'},{})
  const nestedPeriod=new Proxy({period:2,minutes:50},{})
  const reactiveLike=new Proxy({
    morningStart:'07:00',
    dayOverrides:{'0':nestedOverride},
    periodOverrides:[nestedPeriod],
    breakRules:[],
  },{})

  assert.throws(()=>structuredClone(reactiveLike),error=>error?.name==='DataCloneError')

  const cloned=module.cloneTimetableSnapshot(reactiveLike)
  assert.deepEqual(cloned,{
    morningStart:'07:00',
    dayOverrides:{'0':{morningStart:'07:10',morningEnd:'11:25'}},
    periodOverrides:[{period:2,minutes:50}],
    breakRules:[],
  })
  cloned.dayOverrides['0'].morningStart='08:00'
  cloned.periodOverrides[0].minutes=45
  assert.equal(nestedOverride.morningStart,'07:10')
  assert.equal(nestedPeriod.minutes,50)
})

test('admin timetable builder uses the proxy-safe snapshot clone for load, day overrides, and save payloads',()=>{
  const builder=read('src/components/admin/AdminTimetableBuilder.vue')
  assert.match(builder,/cloneTimetableSnapshot/)
  assert.doesNotMatch(builder,/function clone<[^>]*>\(value:[^)]*\)[^{]*\{return structuredClone\(value\)\}/)
  assert.match(builder,/normalizedConfig\([\s\S]*cloneTimetableSnapshot\(value\)/)
  assert.match(builder,/generatedDays:cloneTimetableSnapshot\(generatedDays\.value\)/)
})

test('vanilla background has a dedicated subtle light overlay and preserves the dark overlay',()=>{
  const shell=read('src/layouts/AppShell.vue')
  const themes=read('src/styles/themes.css')
  assert.match(themes,/--pattern-soft-overlay:\s*rgb\([^;]*\/\s*\.56\)/)
  assert.match(themes,/\[data-theme='dark'\][\s\S]*--pattern-soft-overlay:\s*transparent/)
  assert.match(shell,/\.main::after[\s\S]*var\(--pattern-soft-overlay\)[\s\S]*var\(--pattern-dark-overlay\)/)
})
