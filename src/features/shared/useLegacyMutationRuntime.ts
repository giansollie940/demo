import { useQueryClient } from '@tanstack/vue-query'
import { legacyApi } from '../../services/legacy-supabase'
import { useAuthStore } from '../../stores/auth'
import { useContextStore } from '../../stores/context'
import type { LegacyMutationRuntime } from './legacy-mutation'

export function useLegacyMutationRuntime() {
  const auth = useAuthStore()
  const context = useContextStore()
  const queryClient = useQueryClient()

  return function createRuntime(): LegacyMutationRuntime {
    if (!auth.currentUser || !auth.legacyState) {
      throw new Error('Phiên đăng nhập chưa sẵn sàng.')
    }
    return {
      service: legacyApi,
      currentUser: auth.currentUser,
      getState() {
        if (!auth.legacyState) throw new Error('Không có dữ liệu lớp để lưu.')
        return auth.legacyState
      },
      async reload(classId) {
        await auth.reload(classId,context.selectedSchoolYearId)
        if (!auth.legacyState) throw new Error('Không tải lại được dữ liệu sau khi lưu.')
        return auth.legacyState
      },
      hydrate(state) {
        context.hydrate(state)
      },
      async invalidate() {
        await queryClient.invalidateQueries()
      },
    }
  }
}
