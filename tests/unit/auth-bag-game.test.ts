import { describe, expect, test } from 'vitest'
import { itemById } from '../../src/features/auth-bag/catalog'
import { firstMismatch, gameRound, GAME_MAX_LENGTH, GAME_START_LENGTH, roundLength } from '../../src/features/auth-bag/game'

describe('practice game', () => {
  test('rounds grow by one item per level up to the cap', () => {
    expect(roundLength(1)).toBe(GAME_START_LENGTH)
    expect(roundLength(2)).toBe(GAME_START_LENGTH + 1)
    expect(roundLength(99)).toBe(GAME_MAX_LENGTH)
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
