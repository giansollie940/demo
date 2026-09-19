import { onBeforeUnmount, reactive } from 'vue'

export interface DirtyEditorState {
  dirty: boolean
  serverChanged: boolean
}

export interface DirtyEditorHandle {
  state: DirtyEditorState
  setDirty(value: boolean): void
  markClean(): void
  acknowledgeServerChange(): void
  unregister(): void
}

export function createDirtyRegistry() {
  const entries = new Map<string, DirtyEditorState>()

  function register(id: string): DirtyEditorHandle {
    const state = reactive<DirtyEditorState>({ dirty: false, serverChanged: false })
    entries.set(id, state)
    return {
      state,
      setDirty(value) {
        state.dirty = value
        if (!value) state.serverChanged = false
      },
      markClean() {
        state.dirty = false
        state.serverChanged = false
      },
      acknowledgeServerChange() {
        state.serverChanged = false
      },
      unregister() {
        if (entries.get(id) === state) entries.delete(id)
      },
    }
  }

  function notifyServerChange(ids?: Iterable<string>): string[] {
    const scope = ids ? new Set(ids) : null
    const affected: string[] = []
    for (const [id, state] of entries) {
      if (scope && !scope.has(id)) continue
      if (!state.dirty) continue
      state.serverChanged = true
      affected.push(id)
    }
    return affected
  }

  function hasDirty(): boolean {
    return [...entries.values()].some(state => state.dirty)
  }

  function discardAll() {
    for (const state of entries.values()) {
      state.dirty = false
      state.serverChanged = false
    }
  }

  return { register, notifyServerChange, hasDirty, discardAll }
}

export const dirtyRegistry = createDirtyRegistry()

export function useDirtyEditor(id: string): DirtyEditorHandle {
  const handle = dirtyRegistry.register(id)
  onBeforeUnmount(handle.unregister)
  return handle
}
