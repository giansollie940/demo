import type { LegacyState, PeriodRecord, ScheduleOverride, ScheduleSlot, WeekRecord } from '../../types/legacy'

function slotKey(slot:ScheduleSlot){return `${slot.dow}-${slot.period}`}
function canonicalSlots(slots:ScheduleSlot[]){const unique=new Map<string,ScheduleSlot>();for(const slot of slots){const normalized={dow:Number(slot.dow),period:Number(slot.period)};unique.set(slotKey(normalized),normalized)}return [...unique.values()].sort((a,b)=>a.dow-b.dow||a.period-b.period)}
function addDaysISO(iso:string,days:number){const date=new Date(`${iso}T00:00:00Z`);date.setUTCDate(date.getUTCDate()+days);return date.toISOString().slice(0,10)}

export function timetablePeriodUnion(state:LegacyState):PeriodRecord[]{
  const byNumber=new Map<number,PeriodRecord>()
  for(const row of state.periods)byNumber.set(Number(row.n),row)
  for(const row of state.timetableVersionPeriods??[])if(!byNumber.has(Number(row.period)))byNumber.set(Number(row.period),{n:Number(row.period),start:row.start,end:row.end})
  return [...byNumber.values()].sort((a,b)=>a.n-b.n)
}

export function resolvedPeriodsForDate(state:LegacyState,dateISO:string,dow:number):PeriodRecord[]{
  const assignment=(state.timetableAssignments??[]).filter(row=>row.active!==false&&dateISO>=row.effectiveFrom&&dateISO<=row.effectiveTo).sort((a,b)=>b.effectiveFrom.localeCompare(a.effectiveFrom))[0]
  if(!assignment)return state.periods
  const rows=(state.timetableVersionPeriods??[]).filter(row=>row.versionId===assignment.templateVersionId&&Number(row.weekday)===dow+1).sort((a,b)=>a.period-b.period)
  return rows.length?rows.map(row=>({n:row.period,start:row.start,end:row.end})):state.periods
}

export function resolvedTimetableDays(state:LegacyState,week:WeekRecord|null|undefined):Record<number,PeriodRecord[]>{
  const result:Record<number,PeriodRecord[]>={}
  for(let dow=0;dow<5;dow++)result[dow]=week?resolvedPeriodsForDate(state,addDaysISO(week.startDate,dow),dow):state.periods
  return result
}
export function resolvedPeriodForWeekSlot(state:LegacyState,week:WeekRecord,dow:number,periodNumber:number):PeriodRecord|undefined{
  return resolvedPeriodsForDate(state,addDaysISO(week.startDate,dow),dow).find(row=>Number(row.n)===Number(periodNumber))
}

export function normalizeScheduleSlots(slots:ScheduleSlot[],periods:PeriodRecord[]):ScheduleSlot[]{
  if(!slots.length)throw new Error('Thời khóa biểu phải có ít nhất một tiết.')
  const periodNumbers=new Set(periods.map(period=>Number(period.n)))
  const normalized=slots.map(slot=>{const dow=Number(slot.dow),period=Number(slot.period);if(!Number.isInteger(dow)||dow<0||dow>4)throw new Error('Ngày học không hợp lệ.');if(!Number.isInteger(period)||!periodNumbers.has(period))throw new Error('Tiết học không tồn tại trong mẫu TKB.');return{dow,period}})
  return canonicalSlots(normalized)
}
export function effectiveScheduleForWeek(state:LegacyState,weekId:string){const overrides=state.overrides.filter(row=>row.weekId===weekId);if(!overrides.length)return canonicalSlots(state.schedule);return canonicalSlots(overrides.filter(row=>row.active!==false).map(row=>({dow:row.dow,period:row.period})))}
export function createWeekScheduleDraft(state:LegacyState,weekId:string){return structuredClone(effectiveScheduleForWeek(state,weekId))}
export function applyDefaultSchedule(state:LegacyState,slots:ScheduleSlot[]):LegacyState{const next=structuredClone(state);next.schedule=normalizeScheduleSlots(slots,timetablePeriodUnion(state));return next}
export function applyWeekSchedule(state:LegacyState,classId:string,weekId:string,slots:ScheduleSlot[]):LegacyState{const normalized=normalizeScheduleSlots(slots,timetablePeriodUnion(state));const next=structuredClone(state);const rows:ScheduleOverride[]=normalized.map(slot=>({classId,weekId,dow:slot.dow,period:slot.period,active:true}));next.overrides=[...next.overrides.filter(row=>row.weekId!==weekId),...rows];return next}
export function resetWeekSchedule(state:LegacyState,weekId:string):LegacyState{const next=structuredClone(state);next.overrides=next.overrides.filter(row=>row.weekId!==weekId);return next}
export function diffSchedule(base:ScheduleSlot[],candidate:ScheduleSlot[]){const normalizedBase=canonicalSlots(base),normalizedCandidate=canonicalSlots(candidate),baseKeys=new Set(normalizedBase.map(slotKey)),candidateKeys=new Set(normalizedCandidate.map(slotKey));return{added:normalizedCandidate.filter(slot=>!baseKeys.has(slotKey(slot))),removed:normalizedBase.filter(slot=>!candidateKeys.has(slotKey(slot)))}}
