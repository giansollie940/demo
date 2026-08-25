import { onBeforeUnmount, watch } from 'vue'
import { useQueryClient } from '@tanstack/vue-query'
import { useAuthStore } from '../../stores/auth'
import { useContextStore } from '../../stores/context'
import { getWeekLifecycle } from './week-lifecycle'
import { prefetchWeekData } from './queries'

const PRELOAD_LEAD_MS=45_000
export function useWeekLifecycle(){
  const auth=useAuthStore();const context=useContextStore();const queryClient=useQueryClient()
  let boundaryTimer:number|undefined;let preloadTimer:number|undefined
  const stopTimers=()=>{if(boundaryTimer)clearTimeout(boundaryTimer);if(preloadTimer)clearTimeout(preloadTimer);boundaryTimer=undefined;preloadTimer=undefined}
  const slotsForWeek=(weekId:string)=>{
    const state=auth.legacyState;if(!state)return[]
    const overrides=(state.overrides??[]).filter(row=>row.weekId===weekId)
    if(!overrides.length)return state.schedule??[]
    return overrides.filter(row=>row.active!==false).map(row=>({dow:row.dow,period:row.period}))
  }
  const schedule=()=>{
    stopTimers();const state=auth.legacyState;if(!state?.weeks?.length)return
    const lifecycle=getWeekLifecycle({weeks:state.weeks,periods:state.periods,getSlots:slotsForWeek})
    context.followOperationalWeek(lifecycle.currentWeekId)
    const boundary=lifecycle.nextBoundaryMs;if(!boundary)return
    const remaining=boundary-Date.now();if(remaining<=0)return schedule()
    const ordered=[...state.weeks].sort((a,b)=>a.number-b.number);const currentIndex=ordered.findIndex(w=>w.id===lifecycle.currentWeekId);const next=ordered[currentIndex+1]
    if(next){preloadTimer=window.setTimeout(()=>{void prefetchWeekData(queryClient,state.activeClassId,next.id)},Math.max(0,remaining-PRELOAD_LEAD_MS))}
    boundaryTimer=window.setTimeout(()=>{const nextLifecycle=getWeekLifecycle({weeks:state.weeks,periods:state.periods,getSlots:slotsForWeek,nowMs:Date.now()+5});context.followOperationalWeek(nextLifecycle.currentWeekId);schedule()},Math.max(10,remaining+10))
  }
  watch(()=>[auth.legacyState?.activeClassId,auth.legacyState?.weeks,auth.legacyState?.schedule,auth.legacyState?.overrides],schedule,{immediate:true,deep:false})
  const onVisibility=()=>{if(document.visibilityState==='visible')schedule()};document.addEventListener('visibilitychange',onVisibility)
  onBeforeUnmount(()=>{stopTimers();document.removeEventListener('visibilitychange',onVisibility)})
  return{reschedule:schedule}
}
