import { onBeforeUnmount, watch } from 'vue'
import { useQueryClient } from '@tanstack/vue-query'
import { legacyApi } from '../services/legacy-supabase'
import { useAuthStore } from '../stores/auth'
import { useContextStore } from '../stores/context'
import { dirtyRegistry } from '../features/shared/dirty-registry'

const registrationEditors = ['registration-dialog', 'approval-detail'] as const

export function useRealtimeInvalidation(){
  const queryClient=useQueryClient();const auth=useAuthStore();const context=useContextStore();let subscribed=false
  async function stop(){if(!subscribed)return;await legacyApi.unsubscribeRealtime();subscribed=false}
  async function start(){
    if(!auth.isAuthenticated||subscribed)return
    await Promise.resolve(legacyApi.subscribeRealtime(async change=>{
      if(change.table==='registrations'){
        dirtyRegistry.notifyServerChange(registrationEditors)
        await queryClient.invalidateQueries({queryKey:['week-data']})
        return
      }
      if(change.structural||['classes','class_settings','class_weeks','weeks','study_schedule','week_schedule_overrides'].includes(String(change.table||''))){
        dirtyRegistry.notifyServerChange()
        await auth.reload(context.selectedClassId)
        context.hydrate(auth.legacyState)
        await queryClient.invalidateQueries()
      }
    },()=>{}))
    subscribed=true
  }
  watch(()=>auth.isAuthenticated,enabled=>{if(enabled)void start();else void stop()},{immediate:true})
  onBeforeUnmount(()=>{void stop()})
}
