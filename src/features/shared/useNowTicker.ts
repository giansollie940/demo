import { onBeforeUnmount, onMounted, ref, type Ref } from 'vue'

export function useNowTicker(intervalMs = 30_000): Ref<number> {
  const nowMs = ref(Date.now())
  let timer: number | null = null
  const tick = () => { nowMs.value = Date.now() }
  onMounted(() => {
    tick()
    timer = window.setInterval(tick, Math.max(1_000, intervalMs))
  })
  onBeforeUnmount(() => {
    if (timer !== null) window.clearInterval(timer)
    timer = null
  })
  return nowMs
}
