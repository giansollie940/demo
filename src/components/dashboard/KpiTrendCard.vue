<script setup lang="ts">
import type { Component } from 'vue'

defineProps<{
  label: string
  value: string | number
  context?: string
  icon: Component
  tone: 'blue' | 'green' | 'amber' | 'violet'
  trend?: { direction: 'up' | 'down' | 'flat'; value: number; label: string }
  points?: number[]
}>()

function pathFor(points: number[] | undefined) {
  if (!points || points.length < 2) return ''
  const min = Math.min(...points)
  const max = Math.max(...points)
  const span = max - min || 1
  return points.map((point, index) => {
    const x = (index / (points.length - 1)) * 68
    const y = 22 - ((point - min) / span) * 18
    return `${index ? 'L' : 'M'} ${x.toFixed(1)} ${y.toFixed(1)}`
  }).join(' ')
}
</script>

<template>
  <article class="kpi-card-r7" :data-tone="tone">
    <span class="kpi-icon"><component :is="icon" /></span>
    <div class="kpi-copy">
      <span>{{ label }}</span>
      <strong>{{ value }}</strong>
      <small v-if="context">{{ context }}</small>
    </div>
    <span v-if="trend" class="trend-badge" :data-direction="trend.direction">
      {{ trend.direction === 'down' ? '↓' : trend.direction === 'up' ? '↑' : '→' }} {{ trend.value }}%
    </span>
    <svg v-if="points?.length" class="sparkline" viewBox="0 0 68 24" aria-hidden="true">
      <path :d="pathFor(points)" />
    </svg>
  </article>
</template>

<style scoped>
.kpi-card-r7 { --kpi-accent: var(--color-sky); position: relative; min-height: 108px; display: grid; grid-template-columns: 48px minmax(0,1fr); gap: 14px; align-items: center; padding: 16px 18px; overflow: hidden; border: 1px solid color-mix(in srgb, var(--kpi-accent) 16%, var(--border)); border-radius: 19px; background: color-mix(in srgb, var(--kpi-accent) 5%, var(--surface)); box-shadow: 0 8px 22px rgb(56 74 100 / .045); }
.kpi-card-r7[data-tone="green"] { --kpi-accent: var(--color-success); }
.kpi-card-r7[data-tone="amber"] { --kpi-accent: var(--color-warning); }
.kpi-card-r7[data-tone="violet"] { --kpi-accent: var(--color-lilac); }
.kpi-icon { width: 48px; height: 48px; display: grid; place-items: center; border-radius: 16px; background: color-mix(in srgb, var(--kpi-accent) 16%, var(--surface)); color: var(--kpi-accent); }
.kpi-icon :deep(svg) { width: 23px; height: 23px; }
.kpi-copy { display: grid; gap: 2px; min-width: 0; }
.kpi-copy > span { color: var(--text); font-size: .8rem; font-weight: 800; }
.kpi-copy strong { color: var(--text); font-size: 1.75rem; line-height: 1; }
.kpi-copy small { color: var(--text-muted); font-size: .7rem; }
.trend-badge { position: absolute; right: 14px; top: 13px; padding: 5px 8px; border-radius: 999px; color: var(--color-success); background: color-mix(in srgb, var(--wash-mint) 70%, var(--surface)); font-size: .66rem; font-weight: 900; }
.trend-badge[data-direction="down"] { color: var(--color-danger); background: color-mix(in srgb, var(--wash-pink) 66%, var(--surface)); }
.sparkline { position: absolute; right: 14px; bottom: 12px; width: 68px; height: 24px; overflow: visible; }
.sparkline path { fill: none; stroke: var(--kpi-accent); stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
</style>
