import { describe, expect, it } from 'vitest'
import { calculateTimetable, defaultTimetableConfig, resolveTimetableConfig, validateTimetableConfig } from '../../src/features/timetable/timetable-engine'
import type { TimetableConfig } from '../../src/features/timetable/timetable-types'

describe('V8.8 timetable engine',()=>{
  it('automatically generates the maximum periods that fit both sessions',()=>{
    const result=calculateTimetable(defaultTimetableConfig(),0)
    expect(result.errors).toEqual([])
    expect(result.periods).toHaveLength(8)
    expect(result.periods[0]).toMatchObject({number:1,start:'07:30',end:'08:10',session:'morning'})
    expect(result.periods.at(-1)).toMatchObject({number:8,start:'15:10',end:'15:50',session:'afternoon'})
  })


  it('auto-applies short breaks when long break is disabled for a session',()=>{
    const config=defaultTimetableConfig()
    config.morningLongBreakEnabled=false
    config.afternoonLongBreakEnabled=false
    config.breakRules=[]
    const result=calculateTimetable(config,0)
    expect(result.errors).toEqual([])
    const morning=result.periods.filter((row)=>row.session==='morning')
    expect(morning[0].breakAfter).toEqual({type:'short',minutes:config.shortBreakMinutes})
    expect(morning.slice(0,-1).every((row)=>row.breakAfter?.type==='short')).toBe(true)
  })

  it('replaces the selected automatic short break with a long break',()=>{
    const config=defaultTimetableConfig()
    config.morningLongBreakEnabled=true
    config.morningLongBreakAfterPeriod=2
    config.breakRules=[]
    const result=calculateTimetable(config,0)
    expect(result.errors).toEqual([])
    expect(result.periods.find((row)=>row.number===2)?.breakAfter).toEqual({type:'long',minutes:config.longBreakMinutes})
  })

  it('applies a duration override without asking for explicit start or end times',()=>{
    const config=defaultTimetableConfig()
    config.periodOverrides=[{period:5,minutes:35}]
    const result=calculateTimetable(config,0)
    expect(result.periods.find(item=>item.number===5)).toMatchObject({start:'10:40',end:'11:15',minutes:35})
  })

  it('supports a custom break and shifts later periods automatically',()=>{
    const config=defaultTimetableConfig()
    config.breakRules=[{afterPeriod:1,type:'custom',minutes:10}]
    const result=calculateTimetable(config,0)
    expect(result.periods[0].breakAfter).toEqual({type:'custom',minutes:10})
    expect(result.periods[1]).toMatchObject({number:2,start:'08:20',end:'09:00'})
  })

  it('inherits base values and changes only fields defined by a weekday override',()=>{
    const config=defaultTimetableConfig()
    config.dayOverrides['4']={afternoonEnd:'15:30',periodOverrides:[{period:8,minutes:35}]}
    const resolved=resolveTimetableConfig(config,4)
    expect(resolved.morningStart).toBe(config.morningStart)
    expect(resolved.shortBreakMinutes).toBe(config.shortBreakMinutes)
    expect(resolved.afternoonEnd).toBe('15:30')
    expect(resolved.periodOverrides).toContainEqual({period:8,minutes:35})
    const result=calculateTimetable(config,4)
    expect(result.periods.every(item=>item.end<='15:30'||item.session==='morning')).toBe(true)
  })

  it('rejects invalid sessions and invalid custom breaks before generating periods',()=>{
    const config:TimetableConfig={
      ...defaultTimetableConfig(),
      morningStart:'11:30',morningEnd:'07:30',
      breakRules:[{afterPeriod:2,type:'custom',minutes:0}],
    }
    expect(validateTimetableConfig(config).length).toBeGreaterThan(0)
    const result=calculateTimetable(config,0)
    expect(result.periods).toEqual([])
    expect(result.errors.length).toBeGreaterThan(0)
  })
})

  it('never generates more than the persisted 40-period ceiling',()=>{
    const config:TimetableConfig={
      ...defaultTimetableConfig(),
      morningStart:'00:00',morningEnd:'12:00',afternoonStart:'12:00',afternoonEnd:'23:59',
      defaultPeriodMinutes:1,shortBreakMinutes:0,longBreakMinutes:0,breakRules:[],periodOverrides:[],
    }
    const result=calculateTimetable(config,0)
    expect(result.errors).toEqual([])
    expect(result.periods).toHaveLength(40)
    expect(result.periods.at(-1)?.number).toBe(40)
  })
