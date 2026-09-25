import { computed } from 'vue'
import { useAuthStore } from '../../stores/auth'
import { useContextStore } from '../../stores/context'
import { useWeekData } from '../weeks/queries'
import type { TeacherQueueWeekSnapshot } from './owl-model'

export function useTeacherQueueWeeks() {
  const auth = useAuthStore()
  const context = useContextStore()
  const isTeacher = computed(() => auth.currentUser?.role === 'teacher')
  const classId = computed(() => isTeacher.value ? context.selectedClassId : null)
  const selectedWeekId = computed(() => isTeacher.value ? context.selectedWeekId : null)
  const operationalWeekId = computed(() => isTeacher.value ? auth.legacyState?.currentWeekId ?? null : null)
  const nextOpenWeekId = computed(() => {
    const state = auth.legacyState
    const currentId = operationalWeekId.value
    if (!isTeacher.value || !state || !currentId) return null
    const ordered = [...state.weeks].sort((a, b) => a.number - b.number)
    const currentIndex = ordered.findIndex(week => week.id === currentId)
    if (currentIndex < 0) return null
    return ordered.slice(currentIndex + 1).find(week => week.status === 'open')?.id ?? null
  })

  const selectedQuery = useWeekData(classId, selectedWeekId)
  const operationalQuery = useWeekData(classId, operationalWeekId)
  const nextOpenQuery = useWeekData(classId, nextOpenWeekId)

  const teacherQueueWeeks = computed<TeacherQueueWeekSnapshot[]>(() => {
    if (!isTeacher.value) return []
    const byWeek = new Map<string, TeacherQueueWeekSnapshot>()
    const candidates = [
      { weekId: selectedWeekId.value, query: selectedQuery },
      { weekId: operationalWeekId.value, query: operationalQuery },
      { weekId: nextOpenWeekId.value, query: nextOpenQuery },
    ]
    for (const candidate of candidates) {
      if (!candidate.weekId || byWeek.has(candidate.weekId) || !candidate.query.isSuccess.value || !candidate.query.data.value) continue
      byWeek.set(candidate.weekId, {
        weekId: candidate.weekId,
        registrations: candidate.query.data.value.registrations,
      })
    }
    return [...byWeek.values()]
  })

  return { teacherQueueWeeks, selectedWeekId, operationalWeekId, nextOpenWeekId }
}
