<script setup lang="ts">
/* One ranked list for the "Xếp cặp theo đề" boards (this-device and server). Names are text. */
export interface BoardRow {
  key: string | number
  name: string
  detail?: string
  score: number
  mine?: boolean
}
defineProps<{ rows: BoardRow[]; empty?: string }>()
</script>

<template>
  <ol v-if="rows.length" class="board-list">
    <li v-for="(row, index) in rows" :key="row.key" :class="{ mine: row.mine }">
      <span class="rank">{{ index + 1 }}</span>
      <span class="who">{{ row.name }}<small v-if="row.detail">{{ row.detail }}</small></span>
      <span class="pts">{{ row.score }} điểm</span>
    </li>
  </ol>
  <p v-else class="board-empty">{{ empty ?? 'Chưa có ai.' }}</p>
</template>

<style scoped>
.board-list { display: grid; gap: 4px; margin: 8px 0 0; padding: 0; list-style: none; max-width: 460px; }
.board-list li { display: grid; grid-template-columns: 26px 1fr auto; align-items: center; gap: 8px; padding: 5px 10px; border-radius: 10px; background: var(--surface); font-size: .88rem; }
.board-list li:nth-child(1) .rank { background: #f5b400; color: #fff; }
.board-list li:nth-child(2) .rank { background: #a3acb9; color: #fff; }
.board-list li:nth-child(3) .rank { background: #c07a3e; color: #fff; }
.board-list li.mine { outline: 2px solid var(--color-primary); font-weight: 800; }
.rank { display: grid; place-items: center; width: 24px; height: 24px; border-radius: 50%; background: color-mix(in srgb, var(--color-primary) 10%, var(--surface)); font-weight: 900; font-size: .78rem; }
.who { display: grid; min-width: 0; }
.who, .who small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.who small { color: var(--text-muted); font-size: .76rem; font-weight: 700; }
.pts { color: var(--text-muted); font-weight: 800; }
.board-empty { margin: 6px 0 0; color: var(--text-muted); font-size: .85rem; }
</style>
