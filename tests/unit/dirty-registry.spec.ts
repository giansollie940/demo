import { describe, expect, it } from 'vitest'
import { createDirtyRegistry } from '../../src/features/shared/dirty-registry'

describe('dirty editor registry', () => {
  it('marks only dirty editors when the server changes', () => {
    const registry = createDirtyRegistry()
    const schedule = registry.register('schedule')
    const weeks = registry.register('weeks')
    schedule.setDirty(true)

    expect(registry.notifyServerChange()).toEqual(['schedule'])
    expect(schedule.state.serverChanged).toBe(true)
    expect(weeks.state.serverChanged).toBe(false)
  })

  it('acknowledges a conflict without losing dirty state', () => {
    const registry = createDirtyRegistry()
    const editor = registry.register('schedule')
    editor.setDirty(true)
    registry.notifyServerChange()
    editor.acknowledgeServerChange()

    expect(editor.state).toEqual({ dirty: true, serverChanged: false })
  })

  it('marking clean clears both dirty and server-change state', () => {
    const registry = createDirtyRegistry()
    const editor = registry.register('weeks')
    editor.setDirty(true)
    registry.notifyServerChange()
    editor.markClean()

    expect(editor.state).toEqual({ dirty: false, serverChanged: false })
  })

  it('unregisters editors that leave the page', () => {
    const registry = createDirtyRegistry()
    const editor = registry.register('schedule')
    editor.setDirty(true)
    editor.unregister()
    expect(registry.notifyServerChange()).toEqual([])
  })

  it('reports and discards all dirty editors after navigation confirmation', () => {
    const registry = createDirtyRegistry()
    const schedule = registry.register('schedule')
    const weeks = registry.register('weeks')
    schedule.setDirty(true)
    weeks.setDirty(true)
    expect(registry.hasDirty()).toBe(true)
    registry.discardAll()
    expect(schedule.state).toEqual({ dirty: false, serverChanged: false })
    expect(weeks.state).toEqual({ dirty: false, serverChanged: false })
    expect(registry.hasDirty()).toBe(false)
  })
})
