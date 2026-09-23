import { computed, watch, type Ref } from 'vue'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { legacyApi } from '../../services/legacy-supabase'
import { devicePolicyMap, type DevicePolicyMap, type DevicePolicySlot } from './device-policy'

export const devicePolicyKey = (classId: string | null, weekId: string | null) =>
  ['device-policy', classId ?? 'none', weekId ?? 'none'] as const

/**
 * The policy for one class in one week, keyed by slot.
 *
 * Only the dialog and the teacher's screen need this: every other view derives
 * the lock from the two columns already on the registration, so a class with no
 * policy at all makes no extra request on the pages students spend their time on.
 */
export function useDevicePolicy(classId: Ref<string | null>, weekId: Ref<string | null>) {
  const query = useQuery<DevicePolicySlot[]>({
    queryKey: computed(() => devicePolicyKey(classId.value, weekId.value)),
    enabled: computed(() => Boolean(classId.value && weekId.value)),
    queryFn: async () => (await legacyApi.deviceUsePolicy('state',
      { class_id: classId.value, week_id: weekId.value })) as DevicePolicySlot[],
    staleTime: 20_000,
    // The realtime signal is the fast path, but it only arrives if the operator
    // put `device_use_policy_signals` in the `supabase_realtime` publication.
    // A screen being correct should not depend on a dashboard toggle, so focus
    // is a second, independent way back to the truth.
    refetchOnWindowFocus: true,
  })
  const map = computed<DevicePolicyMap>(() => devicePolicyMap(query.data.value))
  return { query, map }
}

/**
 * Refetch the policy at the moment it is about to be acted on.
 *
 * Third way back to the truth, and the one that matters most: whatever happened
 * while the page sat idle, the checkbox a student is about to tick was checked
 * against the server immediately before they saw it.
 */
export function useDevicePolicyOnOpen(
  open: Ref<boolean>, query: { refetch: () => Promise<unknown> },
) {
  watch(open, isOpen => { if (isOpen) void query.refetch() })
}

export function useDevicePolicyRefresh() {
  const queryClient = useQueryClient()
  return (classId: string | null, weekId: string | null) => Promise.all([
    queryClient.invalidateQueries({ queryKey: devicePolicyKey(classId, weekId) }),
    // A lock changes `effective_uses_electronic_device` on rows the client is
    // already showing, so the week's registrations are stale too.
    queryClient.invalidateQueries({ queryKey: ['week-data', classId ?? 'none', weekId ?? 'none'] }),
  ])
}
