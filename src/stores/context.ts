import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { LegacyState, SchoolClass, SchoolYearRecord, WeekRecord } from '../types/legacy'

export const useContextStore=defineStore('context',()=>{
  const schoolYears=ref<SchoolYearRecord[]>([])
  const classes=ref<SchoolClass[]>([])
  const weeks=ref<WeekRecord[]>([])
  const selectedSchoolYearId=ref<string|null>(null)
  const selectedClassId=ref<string|null>(null)
  const selectedWeekId=ref<string|null>(null)
  const manualWeekSelection=ref(false)

  const selectedSchoolYear=computed(()=>schoolYears.value.find(item=>item.id===selectedSchoolYearId.value)??null)
  const selectedClass=computed(()=>classes.value.find(item=>item.id===selectedClassId.value)??null)
  const selectedWeek=computed(()=>weeks.value.find(item=>item.id===selectedWeekId.value)??null)

  function hydrate(state:LegacyState|null){
    if(!state){schoolYears.value=[];classes.value=[];weeks.value=[];selectedSchoolYearId.value=null;selectedClassId.value=null;selectedWeekId.value=null;manualWeekSelection.value=false;return}
    schoolYears.value=state.availableSchoolYears??[]
    classes.value=state.availableClasses??[]
    weeks.value=state.weeks??[]
    selectedSchoolYearId.value=state.selectedSchoolYearId??state.activeSchoolYearId??schoolYears.value[0]?.id??null
    selectedClassId.value=state.activeClassId??null
    if(!selectedWeekId.value||!weeks.value.some(item=>item.id===selectedWeekId.value))selectedWeekId.value=state.currentWeekId??weeks.value[0]?.id??null
  }
  function selectWeek(id:string,{manual=true}:{manual?:boolean}={}){selectedWeekId.value=id;manualWeekSelection.value=manual}
  function followOperationalWeek(id:string|null){if(!manualWeekSelection.value&&id)selectedWeekId.value=id}
  function resumeAutoWeek(id:string|null){manualWeekSelection.value=false;if(id)selectedWeekId.value=id}
  function selectClass(id:string){selectedClassId.value=id;manualWeekSelection.value=false}
  function selectSchoolYear(id:string){selectedSchoolYearId.value=id;selectedClassId.value=null;selectedWeekId.value=null;manualWeekSelection.value=false}

  return{schoolYears,classes,weeks,selectedSchoolYearId,selectedClassId,selectedWeekId,selectedSchoolYear,selectedClass,selectedWeek,manualWeekSelection,hydrate,selectSchoolYear,selectWeek,followOperationalWeek,resumeAutoWeek,selectClass}
})
