import type { LegacySupabaseService } from '../types/legacy'

function requireLegacyApi(): LegacySupabaseService {
  const api = window.SupabaseService
  if (!api) {
    throw new Error('Không tải được SupabaseService. Hãy kiểm tra config.js và supabase-service.js.')
  }
  return api
}

export const legacyApi: LegacySupabaseService = new Proxy({} as LegacySupabaseService, {
  get(_target, property) {
    const api = requireLegacyApi() as unknown as Record<PropertyKey, unknown>
    const value = api[property]
    return typeof value === 'function' ? value.bind(api) : value
  },
})

export function isBackendConfigured(): boolean {
  try {
    return requireLegacyApi().enabled()
  } catch {
    return false
  }
}
