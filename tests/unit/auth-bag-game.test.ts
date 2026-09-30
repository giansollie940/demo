import { describe, expect, test } from 'vitest'
import { itemById } from '../../src/features/auth-bag/catalog'
import {
  addScore, BOARD_SIZE, cleanName, firstMismatch, gameRound, GAME_MAX_LENGTH, GAME_START_LENGTH, loadBoard, NAME_MAX, qualifies, roundLength, roundSeconds, saveBoard, type ScoreEntry,
} from '../../src/features/auth-bag/game'

describe('practice game', () => {
  test('rounds grow by one item per level up to the cap', () => {
    expect(roundLength(1)).toBe(GAME_START_LENGTH)
    expect(roundLength(2)).toBe(GAME_START_LENGTH + 1)
    expect(roundLength(99)).toBe(GAME_MAX_LENGTH)
  })

  test('time per round grows with the number of items', () => {
    expect(roundSeconds(1)).toBe(8 + 3 * GAME_START_LENGTH)
    expect(roundSeconds(99)).toBe(8 + 3 * GAME_MAX_LENGTH)
    expect(roundSeconds(3)).toBeGreaterThan(roundSeconds(2))
  })

  test('a round is made of catalog items', () => {
    const round = gameRound(3)
    expect(round).toHaveLength(roundLength(3))
    round.forEach(id => expect(itemById(id)).toBeDefined())
  })

  test('firstMismatch finds the first wrong, missing or extra item', () => {
    const target = ['pen_red', 'ruler_blue', 'pen_red']
    expect(firstMismatch(target, [...target])).toBe(-1)
    expect(firstMismatch(target, ['pen_red', 'ruler_green', 'pen_red'])).toBe(1)
    expect(firstMismatch(target, ['pen_red'])).toBe(1)
    expect(firstMismatch(target, [...target, 'pen_red'])).toBe(3)
    expect(firstMismatch(target, [])).toBe(0)
  })
})

describe('high-score board', () => {
  const entry = (name: string, score: number, at: number): ScoreEntry => ({ name, score, level: score + 1, at })

  test('names are trimmed, single-spaced, stripped of control characters and capped', () => {
    expect(cleanName('  Mèo   Ú \n')).toBe('Mèo Ú')
    expect(cleanName('a\u0007b')).toBe('ab')
    expect(cleanName('x'.repeat(40))).toHaveLength(NAME_MAX)
    expect(cleanName('   ')).toBe('')
  })

  test('ranks by score, earlier first on ties, keeps the top ten', () => {
    let board: ScoreEntry[] = []
    for (let i = 0; i < 12; i++) board = addScore(board, entry(`p${i}`, i % 5 + 1, i))
    expect(board).toHaveLength(BOARD_SIZE)
    expect(board[0]).toMatchObject({ name: 'p4', score: 5 })
    expect(board[1]).toMatchObject({ name: 'p9', score: 5 })
    expect(board.map(e => e.score)).toEqual([...board.map(e => e.score)].sort((a, b) => b - a))
  })

  test('qualifies: never for zero, always while the board has room, otherwise must beat the last', () => {
    expect(qualifies([], 0)).toBe(false)
    expect(qualifies([], 1)).toBe(true)
    const full = Array.from({ length: BOARD_SIZE }, (_, i) => entry(`p${i}`, 10 - i, i))
    expect(qualifies(full, 1)).toBe(false)
    expect(qualifies(full, 2)).toBe(true)
  })

  test('load/save round-trip and ignore anything malformed', () => {
    const store = new Map<string, string>()
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) }
    expect(loadBoard(storage)).toEqual([])
    expect(saveBoard([entry('An', 3, 1)], storage)).toBe(true)
    expect(loadBoard(storage)).toEqual([entry('An', 3, 1)])
    store.set([...store.keys()][0]!, JSON.stringify([{ name: 'x', score: 'lots' }, entry('Bình', 2, 2), null]))
    expect(loadBoard(storage)).toEqual([entry('Bình', 2, 2)])
    store.set([...store.keys()][0]!, '{not json')
    expect(loadBoard(storage)).toEqual([])
    const broken = { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('quota') } }
    expect(loadBoard(broken)).toEqual([])
    expect(saveBoard([], broken)).toBe(false)
  })
})
