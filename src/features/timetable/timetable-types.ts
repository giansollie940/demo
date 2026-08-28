export type TimetableBreakType='none'|'short'|'long'|'custom'

export interface TimetableBreakRule {
  afterPeriod:number
  type:TimetableBreakType
  minutes?:number
}

export interface TimetablePeriodOverride {
  period:number
  minutes:number
}

export interface TimetableDayOverride {
  morningStart?:string|null
  morningEnd?:string|null
  afternoonStart?:string|null
  afternoonEnd?:string|null
  defaultPeriodMinutes?:number
  shortBreakMinutes?:number
  longBreakMinutes?:number
  morningLongBreakEnabled?:boolean
  morningLongBreakAfterPeriod?:number
  afternoonLongBreakEnabled?:boolean
  afternoonLongBreakAfterPeriod?:number
  periodOverrides?:TimetablePeriodOverride[]
  breakRules?:TimetableBreakRule[]
}

export interface TimetableConfig {
  morningStart:string|null
  morningEnd:string|null
  afternoonStart:string|null
  afternoonEnd:string|null
  defaultPeriodMinutes:number
  shortBreakMinutes:number
  longBreakMinutes:number
  morningLongBreakEnabled:boolean
  morningLongBreakAfterPeriod:number
  afternoonLongBreakEnabled:boolean
  afternoonLongBreakAfterPeriod:number
  periodOverrides:TimetablePeriodOverride[]
  breakRules:TimetableBreakRule[]
  dayOverrides:Record<string,TimetableDayOverride>
}

export interface GeneratedTimetablePeriod {
  number:number
  start:string
  end:string
  minutes:number
  session:'morning'|'afternoon'
  breakAfter:{type:TimetableBreakType;minutes:number}|null
}

export interface CalculatedTimetable {
  config:TimetableConfig
  weekday:number
  periods:GeneratedTimetablePeriod[]
  errors:string[]
}
