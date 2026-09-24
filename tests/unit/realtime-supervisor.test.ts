import { describe, expect, it, vi } from 'vitest'
import { createRealtimeSupervisor } from '../../src/realtime/realtime-supervisor'

describe('BUG-004 realtime supervisor', () => {
  it('does not consider the channel healthy before SUBSCRIBED', async () => {
    let status: ((value:string)=>void) | undefined
    const subscribe = vi.fn((_change, onStatus) => { status = onStatus })
    const supervisor = createRealtimeSupervisor({
      subscribe,
      unsubscribe: vi.fn(),
      onChange: vi.fn(),
      onCatchUp: vi.fn(),
      delays: [10],
    })
    await supervisor.start()
    expect(supervisor.status()).toBe('connecting')
    status?.('SUBSCRIBED')
    expect(supervisor.status()).toBe('subscribed')
  })

  it('cleans up and reconnects after CHANNEL_ERROR without creating parallel channels', async () => {
    vi.useFakeTimers()
    const statuses: Array<(value:string)=>void> = []
    let active = 0
    let maxActive = 0
    const subscribe = vi.fn((_change, onStatus) => {
      statuses.push(onStatus)
      active += 1
      maxActive = Math.max(maxActive, active)
    })
    const unsubscribe = vi.fn(() => { active = Math.max(0, active - 1) })
    const supervisor = createRealtimeSupervisor({
      subscribe,
      unsubscribe,
      onChange: vi.fn(),
      onCatchUp: vi.fn(),
      delays: [25],
    })
    await supervisor.start()
    statuses[0]('SUBSCRIBED')
    statuses[0]('CHANNEL_ERROR')
    await vi.runAllTimersAsync()
    expect(subscribe).toHaveBeenCalledTimes(2)
    expect(unsubscribe.mock.calls.length).toBeGreaterThanOrEqual(2)
    expect(maxActive).toBe(1)
    vi.useRealTimers()
  })

  it('catches up on foreground and reconnects when not subscribed', async () => {
    vi.useFakeTimers()
    const statuses: Array<(value:string)=>void> = []
    const catchUp = vi.fn()
    const subscribe = vi.fn((_change, onStatus) => { statuses.push(onStatus) })
    const supervisor = createRealtimeSupervisor({
      subscribe,
      unsubscribe: vi.fn(),
      onChange: vi.fn(),
      onCatchUp: catchUp,
      delays: [1000],
    })
    await supervisor.start()
    statuses[0]('TIMED_OUT')
    await supervisor.foreground()
    expect(catchUp).toHaveBeenCalled()
    expect(subscribe.mock.calls.length).toBeGreaterThanOrEqual(2)
    vi.useRealTimers()
  })
})
