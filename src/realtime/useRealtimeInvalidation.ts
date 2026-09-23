import { onBeforeUnmount, watch } from 'vue'
import { useQueryClient } from '@tanstack/vue-query'
import { legacyApi } from '../services/legacy-supabase'
import { useAuthStore } from '../stores/auth'
import { useContextStore } from '../stores/context'
import { dirtyRegistry } from '../features/shared/dirty-registry'

const registrationEditors = ['registration-dialog', 'approval-detail'] as const
const structuralTables=['classes','class_teachers','class_settings','class_weeks','weeks','study_schedule','week_schedule_overrides','profiles']
// FEAT-010. A Lock on a slot nobody has registered for yet changes no
// registration row, so it produces no `registrations` event and an open
// Registration page would keep its cached policy — and keep showing an enabled
// checkbox — until something else happened to refetch.
//
// The signal comes from `device_use_policy_signals`, **not** from the two policy
// tables themselves. Those are manager-only by RLS because they carry who
// pressed which button, and Postgres Changes applies RLS when it delivers: a
// student who cannot read the row never receives the event. Subscribing to them
// would have left exactly the audience this exists for with a stale checkbox.
// The signal row carries only class_id and a version, so a student of the class
// may read it — and the refetch it triggers goes through the RPC, which
// sanitizes per role.
//
// Deliberately not in `structuralTables`: a policy change needs two queries
// invalidated, not a full state reload.
const devicePolicyTables=['device_use_policy_signals']

/**
 * Which query keys a realtime change on `table` must invalidate, or null if the
 * device-policy path does not handle that table.
 *
 * Exported so the rule can be tested as a rule. `['week-data']` is in the list
 * because the recompute that follows a Lock also rewrites
 * `effective_uses_electronic_device` on registrations for that slot.
 */
export function devicePolicyInvalidations(table:unknown):string[][]|null{
  return devicePolicyTables.includes(String(table||''))?[['device-policy'],['week-data']]:null
}

export function useRealtimeInvalidation(){
  const queryClient=useQueryClient();const auth=useAuthStore();const context=useContextStore();let subscribed=false
  async function stop(){if(!subscribed)return;await legacyApi.unsubscribeRealtime();subscribed=false}
  async function start(){
    if(!auth.isAuthenticated||subscribed)return
    await Promise.resolve(legacyApi.subscribeRealtime(async change=>{
      if(change.table==='registrations'){
        auth.applyRealtimeChange(change)
        dirtyRegistry.notifyServerChange(registrationEditors)
        await queryClient.invalidateQueries({queryKey:['week-data']})
        return
      }
      const devicePolicyKeys=devicePolicyInvalidations(change.table)
      if(devicePolicyKeys){
        await Promise.all(devicePolicyKeys.map(queryKey=>queryClient.invalidateQueries({queryKey})))
        return
      }
      if(change.table==='teacher_notifications'){
        auth.applyRealtimeChange(change)
        return
      }
      if(change.structural||structuralTables.includes(String(change.table||''))){
        dirtyRegistry.notifyServerChange()
        await auth.reload(context.selectedClassId,context.selectedSchoolYearId)
        context.hydrate(auth.legacyState)
        await queryClient.invalidateQueries()
      }
    },()=>{}))
    subscribed=true
  }
  watch(()=>auth.isAuthenticated,enabled=>{if(enabled)void start();else void stop()},{immediate:true})
  onBeforeUnmount(()=>{void stop()})
}
