import { computed, type Ref } from 'vue'
import { useQuery, type QueryClient } from '@tanstack/vue-query'
import { legacyApi } from '../../services/legacy-supabase'
import type { WeekData } from '../../types/legacy'

export const weekDataKey=(classId:string|null,weekId:string|null)=>['week-data',classId??'none',weekId??'none'] as const
export function useWeekData(classId:Ref<string|null>,weekId:Ref<string|null>){
  return useQuery<WeekData>({
    queryKey:computed(()=>weekDataKey(classId.value,weekId.value)),
    enabled:computed(()=>Boolean(weekId.value)),
    queryFn:()=>legacyApi.loadWeekData(weekId.value!,classId.value),
    staleTime:20_000,
  })
}
export function prefetchWeekData(queryClient:QueryClient,classId:string|null,weekId:string){
  return queryClient.prefetchQuery({queryKey:weekDataKey(classId,weekId),queryFn:()=>legacyApi.loadWeekData(weekId,classId),staleTime:20_000})
}
