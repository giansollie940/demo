import type { PeriodRecord, ScheduleSlot, WeekRecord } from '../../types/legacy'
const DEFAULT_OFFSET='+07:00'
function addDaysISO(iso:string,days:number){const date=new Date(`${iso}T00:00:00Z`);date.setUTCDate(date.getUTCDate()+days);return date.toISOString().slice(0,10)}
function localTimestamp(dateISO:string,time='00:00',offset=DEFAULT_OFFSET){return new Date(`${dateISO}T${/^\d{2}:\d{2}$/.test(time)?time:'00:00'}:00${offset}`).getTime()}
function fallbackEnd(week:WeekRecord,offset:string){return localTimestamp(week.endDate||addDaysISO(week.startDate,4),'23:59',offset)+59_999}
export function getWeekLastSessionEnd({week,slots=[],periods=[],getPeriod,timeZoneOffset=DEFAULT_OFFSET}:{week:WeekRecord;slots?:ScheduleSlot[];periods?:PeriodRecord[];getPeriod?:(dow:number,period:number)=>PeriodRecord|undefined;timeZoneOffset?:string}){
  const byPeriod=new Map(periods.map(item=>[Number(item.n),item]))
  const times=slots.map(slot=>{const period=getPeriod?.(Number(slot.dow||0),Number(slot.period))??byPeriod.get(Number(slot.period));if(!period?.end)return Number.NaN;return localTimestamp(addDaysISO(week.startDate,Number(slot.dow||0)),period.end,timeZoneOffset)}).filter(Number.isFinite)
  return times.length?Math.max(...times):fallbackEnd(week,timeZoneOffset)
}
export function getWeekLifecycle({weeks=[],periods=[],getSlots=()=>[],getPeriod,nowMs=Date.now(),timeZoneOffset=DEFAULT_OFFSET}:{weeks?:WeekRecord[];periods?:PeriodRecord[];getSlots?:(weekId:string)=>ScheduleSlot[];getPeriod?:(week:WeekRecord,dow:number,period:number)=>PeriodRecord|undefined;nowMs?:number;timeZoneOffset?:string}={}){
  const ordered=[...weeks].sort((a,b)=>a.startDate.localeCompare(b.startDate)||a.number-b.number),statuses:Record<string,'locked'|'open'|'upcoming'>={}
  if(!ordered.length)return{currentWeekId:null,statuses,nextBoundaryMs:null}
  const firstStart=localTimestamp(ordered[0].startDate,'00:00',timeZoneOffset);if(nowMs<firstStart){ordered.forEach(week=>statuses[week.id]='upcoming');return{currentWeekId:null,statuses,nextBoundaryMs:firstStart}}
  const ends=ordered.map(week=>getWeekLastSessionEnd({week,slots:getSlots(week.id),periods,getPeriod:getPeriod?(dow,period)=>getPeriod(week,dow,period):undefined,timeZoneOffset}))
  const currentIndex=ends.findIndex(end=>Number.isFinite(end)&&nowMs<end)
  ordered.forEach((week,index)=>{statuses[week.id]=currentIndex<0||index<currentIndex?'locked':index===currentIndex||index===currentIndex+1?'open':'upcoming'})
  return{currentWeekId:currentIndex>=0?ordered[currentIndex].id:null,statuses,nextBoundaryMs:currentIndex>=0?ends[currentIndex]:null}
}
