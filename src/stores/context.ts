import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { LegacyState, SchoolClass, WeekRecord } from '../types/legacy'

export const useContextStore=defineStore('context',()=>{
  const classes=ref<SchoolClass[]>([])
  const weeks=ref<WeekRecord[]>([])
  const selectedClassId=ref<string|null>(null)
  const selectedWeekId=ref<string|null>(null)
  const manualWeekSelection=ref(false)

  const selectedClass=computed(()=>classes.value.find(item=>item.id===selectedClassId.value)??null)
  const selectedWeek=computed(()=>weeks.value.find(item=>item.id===selectedWeekId.value)??null)

  function hydrate(state:LegacyState|null){
    if(!state){classes.value=[];weeks.value=[];selectedClassId.value=null;selectedWeekId.value=null;manualWeekSelection.value=false;return}
    classes.value=state.availableClasses??[]
    weeks.value=state.weeks??[]
    selectedClassId.value=state.activeClassId??null
    if(!selectedWeekId.value||!weeks.value.some(item=>item.id===selectedWeekId.value))selectedWeekId.value=state.currentWeekId??weeks.value[0]?.id??null
  }
  function selectWeek(id:string,{manual=true}:{manual?:boolean}={}){selectedWeekId.value=id;manualWeekSelection.value=manual}
  function followOperationalWeek(id:string|null){if(!manualWeekSelection.value&&id)selectedWeekId.value=id}
  function resumeAutoWeek(id:string|null){manualWeekSelection.value=false;if(id)selectedWeekId.value=id}
  function selectClass(id:string){selectedClassId.value=id;manualWeekSelection.value=false}

  return{classes,weeks,selectedClassId,selectedWeekId,selectedClass,selectedWeek,manualWeekSelection,hydrate,selectWeek,followOperationalWeek,resumeAutoWeek,selectClass}
})
