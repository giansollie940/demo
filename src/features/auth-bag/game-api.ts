import { legacyApi } from '../../services/legacy-supabase'
import { GAME_RULES_VERSION } from './game'

/*
 * Server high scores for "Xếp cặp theo đề" (signed-in learners only, shown in personal
 * settings). Everything goes through the single `bag_game` RPC; see migration
 * 20260930120000_bag_game_scores.sql for the rules it enforces.
 */
export interface ServerBoardRow {
  name: string
  class: string
  /** School year of the score, only for learners who have left. */
  year?: string | null
  left?: boolean
  score: number
  at: string
  me: boolean
}

export interface GameBoard {
  board: ServerBoardRow[]
  rejected: boolean
  scope: 'year' | 'all'
  season: number
  current_season: number
  seasons: number[]
  year_name: string | null
  my_year_best: number | null
  my_all_best: number | null
  show_on_board: boolean
}

interface RpcClient {
  rpc(name: string, args: Record<string, unknown>): Promise<{ data: unknown; error: { message?: string; code?: string } | null }>
}

async function call<T>(action: string, data: Record<string, unknown> = {}): Promise<T> {
  const client = (await legacyApi.init()) as RpcClient
  const { data: result, error } = await client.rpc('bag_game', { p_action: action, p_data: data })
  if (error) throw Object.assign(new Error(error.message || 'Không kết nối được bảng xếp hạng.'), { code: error.code })
  return result as T
}

export const gameApi = {
  start: () => call<{ ticket: string }>('start', { rules: GAME_RULES_VERSION }),
  submit: (ticket: string, score: number, scope: 'year' | 'all') => call<GameBoard>('submit', { ticket, score, scope }),
  board: (scope: 'year' | 'all', season?: number) => call<GameBoard>('board', season ? { scope, season } : { scope }),
  setVisibility: (show: boolean, scope: 'year' | 'all') => call<GameBoard>('set_visibility', { show, scope }),
}
