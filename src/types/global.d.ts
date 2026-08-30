import type { LegacySupabaseService } from './legacy'

declare global {
  interface Window {
    APP_CONFIG?: Record<string, unknown>
    SupabaseService?: LegacySupabaseService
    supabase?: unknown
  }
}

export {}
