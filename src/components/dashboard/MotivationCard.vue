<script setup lang="ts">
defineProps<{ message: { title: string; body: string; tone: 'success' | 'info' | 'warning' } | null }>()
</script>
<template>
  <aside v-if="message" class="motivation-card" :data-tone="message.tone">
    <span aria-hidden="true">🏆</span><strong>{{ message.title }}</strong><p>{{ message.body }}</p>
  </aside>
</template>
<style scoped>
.motivation-card { --motivation: var(--color-info); display:grid; align-content:center; gap:5px; min-height:128px; padding:16px; border-radius:17px; background:linear-gradient(145deg,color-mix(in srgb,var(--motivation) 9%,var(--surface)),color-mix(in srgb,var(--wash-peach) 48%,var(--surface))); color:var(--text); }
.motivation-card[data-tone="success"]{--motivation:var(--color-success)}.motivation-card[data-tone="warning"]{--motivation:var(--color-warning)}.motivation-card>span{font-size:1.6rem}.motivation-card strong{color:var(--motivation);font-size:.82rem;line-height:1.25}.motivation-card p{margin:0;color:var(--text-muted);font-size:.7rem;line-height:1.4}
</style>
