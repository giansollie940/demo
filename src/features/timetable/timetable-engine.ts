import type { CalculatedTimetable, GeneratedTimetablePeriod, TimetableBreakRule, TimetableConfig, TimetableDayOverride, TimetablePeriodOverride } from './timetable-types'

const TIME=/^(?:[01]\d|2[0-3]):[0-5]\d$/
export const MAX_TIMETABLE_PERIODS=40
function minutes(value:string|null|undefined){if(!value||!TIME.test(value))return null;const [h,m]=value.split(':').map(Number);return h*60+m}
function hhmm(value:number){const h=Math.floor(value/60),m=value%60;return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`}
function mergePeriodOverrides(base:TimetablePeriodOverride[],next?:TimetablePeriodOverride[]){const map=new Map(base.map(item=>[item.period,{...item}]));for(const item of next??[])map.set(item.period,{...item});return [...map.values()].sort((a,b)=>a.period-b.period)}
function mergeBreakRules(base:TimetableBreakRule[],next?:TimetableBreakRule[]){const map=new Map(base.map(item=>[item.afterPeriod,{...item}]));for(const item of next??[])map.set(item.afterPeriod,{...item});return [...map.values()].sort((a,b)=>a.afterPeriod-b.afterPeriod)}

export function resolveTimetableConfig(base:TimetableConfig,weekday:number):TimetableConfig{
  const override:TimetableDayOverride=base.dayOverrides?.[String(weekday)]??{}
  return{
    morningStart:override.morningStart!==undefined?override.morningStart:base.morningStart,
    morningEnd:override.morningEnd!==undefined?override.morningEnd:base.morningEnd,
    afternoonStart:override.afternoonStart!==undefined?override.afternoonStart:base.afternoonStart,
    afternoonEnd:override.afternoonEnd!==undefined?override.afternoonEnd:base.afternoonEnd,
    defaultPeriodMinutes:override.defaultPeriodMinutes??base.defaultPeriodMinutes,
    shortBreakMinutes:override.shortBreakMinutes??base.shortBreakMinutes,
    longBreakMinutes:override.longBreakMinutes??base.longBreakMinutes,
    morningLongBreakEnabled:override.morningLongBreakEnabled??base.morningLongBreakEnabled,
    morningLongBreakAfterPeriod:override.morningLongBreakAfterPeriod??base.morningLongBreakAfterPeriod,
    afternoonLongBreakEnabled:override.afternoonLongBreakEnabled??base.afternoonLongBreakEnabled,
    afternoonLongBreakAfterPeriod:override.afternoonLongBreakAfterPeriod??base.afternoonLongBreakAfterPeriod,
    periodOverrides:mergePeriodOverrides(base.periodOverrides??[],override.periodOverrides),
    breakRules:mergeBreakRules(base.breakRules??[],override.breakRules),
    dayOverrides:base.dayOverrides??{},
  }
}

export function validateTimetableConfig(config:TimetableConfig):string[]{
  const errors:string[]=[]
  if(!Number.isFinite(config.defaultPeriodMinutes)||config.defaultPeriodMinutes<=0)errors.push('Thời lượng tiết chuẩn phải lớn hơn 0.')
  if(!Number.isFinite(config.shortBreakMinutes)||config.shortBreakMinutes<0)errors.push('Thời lượng nghỉ ngắn không hợp lệ.')
  if(!Number.isFinite(config.longBreakMinutes)||config.longBreakMinutes<0)errors.push('Thời lượng nghỉ dài không hợp lệ.')
  if(config.morningLongBreakEnabled&&(!Number.isInteger(config.morningLongBreakAfterPeriod)||config.morningLongBreakAfterPeriod<1))errors.push('Vị trí nghỉ dài buổi sáng không hợp lệ.')
  if(config.afternoonLongBreakEnabled&&(!Number.isInteger(config.afternoonLongBreakAfterPeriod)||config.afternoonLongBreakAfterPeriod<1))errors.push('Vị trí nghỉ dài buổi chiều không hợp lệ.')
  for(const [name,start,end] of [['Buổi sáng',config.morningStart,config.morningEnd],['Buổi chiều',config.afternoonStart,config.afternoonEnd]] as const){
    if((start&&!end)||(!start&&end))errors.push(`${name} cần đủ giờ bắt đầu và kết thúc.`)
    const s=minutes(start),e=minutes(end);if(s!==null&&e!==null&&s>=e)errors.push(`${name} phải kết thúc sau giờ bắt đầu.`)
  }
  const morningEnd=minutes(config.morningEnd),afternoonStart=minutes(config.afternoonStart)
  if(morningEnd!==null&&afternoonStart!==null&&morningEnd>afternoonStart)errors.push('Buổi sáng và buổi chiều không được chồng thời gian.')
  for(const item of config.periodOverrides??[])if(item.period<1||item.minutes<=0)errors.push(`Ngoại lệ Tiết ${item.period} không hợp lệ.`)
  for(const item of config.breakRules??[])if(item.afterPeriod<1||(item.type==='custom'&&(!item.minutes||item.minutes<=0)))errors.push(`Quy tắc nghỉ sau Tiết ${item.afterPeriod} không hợp lệ.`)
  return errors
}

function breakMinutes(rule:TimetableBreakRule,config:TimetableConfig){if(rule.type==='none')return 0;if(rule.type==='short')return config.shortBreakMinutes;if(rule.type==='long')return config.longBreakMinutes;return Math.max(0,Number(rule.minutes||0))}
function automaticBreakRule(session:'morning'|'afternoon',period:number,config:TimetableConfig):TimetableBreakRule{
  const long=session==='morning'
    ?config.morningLongBreakEnabled&&period===config.morningLongBreakAfterPeriod
    :config.afternoonLongBreakEnabled&&period===config.afternoonLongBreakAfterPeriod
  return{afterPeriod:period,type:long?'long':'short'}
}

export function calculateTimetable(base:TimetableConfig,weekday=0):CalculatedTimetable{
  const config=resolveTimetableConfig(base,weekday)
  const errors=validateTimetableConfig(config)
  const periods:GeneratedTimetablePeriod[]=[]
  if(errors.length)return{config,weekday,periods,errors}
  const overrides=new Map((config.periodOverrides??[]).map(item=>[item.period,item.minutes]))
  const breaks=new Map((config.breakRules??[]).map(item=>[item.afterPeriod,item]))
  let number=1
  const generate=(session:'morning'|'afternoon',startValue:string|null,endValue:string|null)=>{
    const start=minutes(startValue),end=minutes(endValue);if(start===null||end===null)return
    let cursor=start
    while(cursor<end&&number<=MAX_TIMETABLE_PERIODS){
      const duration=overrides.get(number)??config.defaultPeriodMinutes
      const periodEnd=cursor+duration
      if(periodEnd>end)break
      const rule=breaks.get(number)??automaticBreakRule(session,number,config)
      const pause=breakMinutes(rule,config)
      const nextNumber=number+1
      const nextDuration=overrides.get(nextNumber)??config.defaultPeriodMinutes
      const nextStart=periodEnd+pause
      const canFitNext=nextNumber<=MAX_TIMETABLE_PERIODS&&nextStart+nextDuration<=end
      periods.push({number,start:hhmm(cursor),end:hhmm(periodEnd),minutes:duration,session,breakAfter:canFitNext&&pause?{type:rule.type,minutes:pause}:null})
      cursor=nextStart
      number++
    }
  }
  generate('morning',config.morningStart,config.morningEnd)
  generate('afternoon',config.afternoonStart,config.afternoonEnd)
  return{config,weekday,periods,errors}
}

export const defaultTimetableConfig=():TimetableConfig=>({
  morningStart:'07:30',morningEnd:'11:30',afternoonStart:'13:30',afternoonEnd:'16:30',defaultPeriodMinutes:40,shortBreakMinutes:5,longBreakMinutes:15,
  morningLongBreakEnabled:true,morningLongBreakAfterPeriod:2,afternoonLongBreakEnabled:true,afternoonLongBreakAfterPeriod:7,
  periodOverrides:[],breakRules:[],dayOverrides:{},
})
