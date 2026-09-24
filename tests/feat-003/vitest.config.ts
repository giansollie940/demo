import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
// Compile the real SFC client render functions for Vue's in-memory renderer.
// No DOM/browser is claimed by this harness.
const plugin = vue()
const hook = plugin.transform!
const transform = typeof hook === 'function' ? hook : hook.handler
plugin.transform = function (code, id, options) {
  return transform.call(this, code, id, { ...options, ssr: false })
}
export default defineConfig({ plugins: [plugin], test: { include: ['tests/feat-003/*.test.ts'] } })
