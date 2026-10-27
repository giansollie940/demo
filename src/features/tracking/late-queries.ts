import { computed, type Ref } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { legacyApi } from '../../services/legacy-supabase'
import { DEFAULT_LATE_THRESHOLD, type LateTrackingData } from './late-model'

export const lateTrackingKey = (classId: string | null, schoolYearId: string | null) =>
  ['late-tracking', classId ?? 'none', schoolYearId ?? 'none'] as const

export const EMPTY_LATE_TRACKING: LateTrackingData = { available: false, threshold: DEFAULT_LATE_THRESHOLD, lates: [], cases: [] }

export function useLateTracking(classId: Ref<string | null>, schoolYearId: Ref<string | null>) {
  return useQuery<LateTrackingData>({
    queryKey: computed(() => lateTrackingKey(classId.value, schoolYearId.value)),
    enabled: computed(() => Boolean(classId.value && schoolYearId.value)),
    queryFn: () => legacyApi.loadLateTracking(classId.value, schoolYearId.value),
    staleTime: 20_000,
  })
}
