import { computed } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { legacyApi } from '../../services/legacy-supabase'
import { OWL_QUOTES, type OwlQuote } from './owl-model'

export interface DailyQuote extends OwlQuote { date: string; stale?: boolean }

export function vietnamDateKey(date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone:'Asia/Ho_Chi_Minh', year:'numeric', month:'2-digit', day:'2-digit' }).formatToParts(date)
  const get = (type:string) => parts.find(item=>item.type===type)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

export function localDailyFallback(dateKey = vietnamDateKey()): DailyQuote {
  let hash = 2166136261
  for (const char of dateKey) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 16777619) }
  const quote = OWL_QUOTES[(hash >>> 0) % OWL_QUOTES.length] ?? OWL_QUOTES[0]
  return { ...quote, id:`local-${dateKey}`, date:dateKey, stale:true }
}

export function normalizeDailyQuote(payload: unknown, dateKey = vietnamDateKey()): DailyQuote | null {
  const wrapper = (payload && typeof payload === 'object' ? payload : {}) as Record<string,unknown>
  const source = (wrapper.quote && typeof wrapper.quote === 'object' ? wrapper.quote : wrapper) as Record<string,unknown>
  const text = String(source.text ?? '').trim()
  if (text.length < 12) return null
  return {
    id:String(source.id ?? `daily-${dateKey}`),
    text,
    author:String(source.author ?? 'Khuyết danh').trim() || 'Khuyết danh',
    url:String(source.url ?? wrapper.sourceUrl ?? ''),
    date:String(wrapper.quoteDate ?? wrapper.date ?? dateKey),
    stale:Boolean(wrapper.stale),
  }
}

export function useDailyQuote() {
  const dateKey = computed(() => vietnamDateKey())
  return useQuery<DailyQuote>({
    queryKey: computed(() => ['daily-quote', dateKey.value]),
    queryFn: async () => {
      try { return normalizeDailyQuote(await legacyApi.getDailyQuote(), dateKey.value) ?? localDailyFallback(dateKey.value) }
      catch { return localDailyFallback(dateKey.value) }
    },
    staleTime: 12 * 60 * 60 * 1000,
    retry: 1,
  })
}
