export type RealtimeConnectionState = 'stopped' | 'connecting' | 'subscribed'

export interface RealtimeSupervisorOptions<TChange = unknown> {
  subscribe: (
    onChange: (change: TChange) => void | Promise<void>,
    onStatus: (status: string, error?: unknown) => void,
  ) => Promise<unknown> | unknown
  unsubscribe: () => Promise<unknown> | unknown
  onChange: (change: TChange) => void | Promise<void>
  onCatchUp: () => void | Promise<void>
  delays?: number[]
}

const FAILURE_STATUSES = new Set(['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'])

export function createRealtimeSupervisor<TChange = unknown>({
  subscribe,
  unsubscribe,
  onChange,
  onCatchUp,
  delays = [500, 1_000, 2_000, 5_000, 10_000],
}: RealtimeSupervisorOptions<TChange>) {
  let active = false
  let generation = 0
  let reconnectAttempt = 0
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined
  let connectionState: RealtimeConnectionState = 'stopped'

  function clearReconnect() {
    if (reconnectTimer !== undefined) clearTimeout(reconnectTimer)
    reconnectTimer = undefined
  }

  async function recover(token: number) {
    if (!active || token !== generation) return
    const recoveryGeneration = ++generation
    connectionState = 'stopped'
    clearReconnect()
    try { await Promise.resolve(unsubscribe()) } catch {}
    if (!active || recoveryGeneration !== generation) return
    const delay = delays[Math.min(reconnectAttempt, Math.max(0, delays.length - 1))] ?? 1_000
    reconnectAttempt += 1
    reconnectTimer = setTimeout(() => {
      reconnectTimer = undefined
      void connect()
    }, Math.max(0, delay))
  }

  function handleStatus(token: number, status: string) {
    if (!active || token !== generation) return
    if (status === 'SUBSCRIBED') {
      connectionState = 'subscribed'
      reconnectAttempt = 0
      clearReconnect()
      void Promise.resolve(onCatchUp())
      return
    }
    if (FAILURE_STATUSES.has(status)) void recover(token)
  }

  async function connect() {
    if (!active || connectionState === 'connecting' || connectionState === 'subscribed') return
    clearReconnect()
    connectionState = 'connecting'
    const token = ++generation
    try {
      await Promise.resolve(unsubscribe())
      if (!active || token !== generation) return
      await Promise.resolve(subscribe(onChange, (status, error) => handleStatus(token, status)))
    } catch {
      if (active && token === generation) await recover(token)
    }
  }

  async function start() {
    if (!active) active = true
    await connect()
  }

  async function foreground() {
    if (!active) return
    await Promise.resolve(onCatchUp())
    if (connectionState !== 'subscribed') {
      clearReconnect()
      connectionState = 'stopped'
      await connect()
    }
  }

  async function stop() {
    active = false
    generation += 1
    clearReconnect()
    connectionState = 'stopped'
    try { await Promise.resolve(unsubscribe()) } catch {}
  }

  return {
    start,
    stop,
    foreground,
    status: () => connectionState,
  }
}
