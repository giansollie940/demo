<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Gamepad2, ListOrdered } from 'lucide-vue-next'
import AppButton from '../ui/AppButton.vue'
import AppCard from '../ui/AppCard.vue'
import AppTabs from '../ui/AppTabs.vue'
import BagGame from './BagGame.vue'
import GameBoardList, { type BoardRow } from './GameBoardList.vue'
import { gameApi, type GameBoard } from '../../features/auth-bag/game-api'

/*
 * Personal settings corner for "Xếp cặp theo đề" with server high scores. Kept low-key on
 * purpose: nothing is announced anywhere else, the boards open only on request, and a learner
 * appears on them only after switching "Hiện tên tôi" on. Everyone always sees their own best.
 */
type Scope = 'year' | 'all'
type Tone = 'info' | 'error' | 'success'

const state = ref<GameBoard | null>(null)
const loadError = ref('')
const message = ref<{ tone: Tone; text: string } | null>(null)
const playing = ref(false)
const showBoards = ref(false)
const scope = ref<Scope>('year')
const season = ref<number | undefined>(undefined)
const busy = ref(false)
const game = ref<InstanceType<typeof BagGame> | null>(null)
let ticket: string | null = null
let ticketRequest: Promise<void> | null = null

const tabs = computed(() => [
  { id: 'year', label: state.value?.year_name ? `Năm ${state.value.year_name} · lớp mình` : 'Năm nay · lớp mình' },
  { id: 'all', label: 'Mọi thời đại · toàn trường' },
])
const pastSeasons = computed(() => (state.value?.seasons ?? []).filter(s => s !== state.value?.current_season))
const best = computed(() => state.value?.my_all_best ?? 0)
const rows = computed<BoardRow[]>(() => (state.value?.board ?? []).map((row, index) => ({
  key: `${index}-${row.at}`,
  name: row.name,
  detail: row.left ? `${row.class} · năm ${row.year ?? ''} · đã rời trường` : row.class,
  score: row.score,
  mine: row.me,
})))

function notify(tone: Tone, text: string) {
  message.value = { tone, text }
}

async function load(nextScope: Scope = scope.value, nextSeason = season.value) {
  try {
    state.value = await gameApi.board(nextScope, nextSeason)
    scope.value = nextScope
    season.value = nextSeason
    loadError.value = ''
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : 'Không tải được bảng xếp hạng.'
  }
}

async function setVisibility(event: Event) {
  const show = (event.target as HTMLInputElement).checked
  busy.value = true
  try {
    state.value = await gameApi.setVisibility(show, scope.value)
    season.value = undefined
    notify('success', show ? 'Tên bạn sẽ hiện trên bảng xếp hạng.' : 'Đã ẩn tên bạn khỏi bảng xếp hạng. Chỉ bạn thấy điểm của mình.')
  } catch (error) {
    ;(event.target as HTMLInputElement).checked = !show
    notify('error', error instanceof Error ? error.message : 'Không lưu được lựa chọn.')
  } finally {
    busy.value = false
  }
}

function onGameStart() {
  ticket = null
  ticketRequest = gameApi.start()
    .then(result => { ticket = result.ticket })
    .catch(error => game.value?.notify('error', `${error instanceof Error ? error.message : 'Không kết nối được.'} Lượt này vẫn chơi được nhưng không lưu điểm.`))
}

async function onGameOver(result: { score: number }) {
  await ticketRequest
  if (!ticket) return
  const used = ticket
  ticket = null
  if (result.score <= 0) return
  const before = state.value?.my_all_best ?? 0
  const beforeYear = state.value?.my_year_best ?? 0
  try {
    const next = await gameApi.submit(used, result.score, scope.value)
    state.value = next
    season.value = undefined
    if (next.rejected) return game.value?.notify('error', `Hết mạng rồi! Điểm của bạn: ${result.score}. Lượt này không lưu được điểm.`)
    const text = result.score > before ? `Kỷ lục mới của bạn: ${result.score} điểm!`
      : result.score > beforeYear ? `Điểm cao nhất năm nay của bạn: ${result.score}!`
      : `Điểm: ${result.score}. Kỷ lục của bạn vẫn là ${next.my_all_best ?? before}.`
    game.value?.notify(result.score > beforeYear ? 'success' : 'info', `Hết mạng rồi! ${text}`)
  } catch (error) {
    game.value?.notify('error', error instanceof Error ? error.message : 'Không lưu được điểm.')
  }
}

function openBoards() {
  showBoards.value = !showBoards.value
  if (showBoards.value) void load(scope.value, undefined)
}

onMounted(() => { void load('year') })
</script>

<template>
  <AppCard padding="lg" class="game-corner">
    <div class="section-title">
      <Gamepad2 />
      <div>
        <span>GÓC THƯ GIÃN</span>
        <h2>Xếp cặp theo đề</h2>
      </div>
    </div>

    <p class="intro">Trò chơi nhỏ để luyện tay với vòng quay: xếp đúng các món theo đề, mỗi vòng thêm một món, sai 3 lần là hết lượt.</p>

    <p v-if="loadError" class="message error" role="status">{{ loadError }}</p>
    <p v-else-if="message" class="message" :class="message.tone" role="status">{{ message.text }}</p>

    <div class="summary">
      <div><small>Điểm cao nhất năm nay</small><b>{{ state?.my_year_best ?? '—' }}</b></div>
      <div><small>Kỷ lục của bạn</small><b>{{ state?.my_all_best ?? '—' }}</b></div>
      <label class="toggle">
        <input type="checkbox" :checked="state?.show_on_board ?? false" :disabled="!state || busy" @change="setVisibility" />
        <span><b>Hiện tên tôi trên bảng xếp hạng</b><small>Tắt thì chỉ bạn thấy điểm của mình.</small></span>
      </label>
    </div>

    <div class="actions">
      <AppButton v-if="!playing" type="button" @click="playing = true"><Gamepad2 />Chơi</AppButton>
      <AppButton type="button" variant="secondary" :aria-expanded="showBoards" @click="openBoards"><ListOrdered />{{ showBoards ? 'Ẩn bảng xếp hạng' : 'Xem bảng xếp hạng' }}</AppButton>
    </div>

    <div v-if="showBoards" class="boards">
      <AppTabs :model-value="scope" :items="tabs" label="Bảng xếp hạng" @update:model-value="id => load(id as 'year' | 'all', undefined)" />
      <div v-if="scope === 'all' && pastSeasons.length" class="seasons">
        <span>Mùa:</span>
        <button type="button" :class="{ active: !season }" @click="load('all', undefined)">Hiện tại</button>
        <button v-for="s in pastSeasons" :key="s" type="button" :class="{ active: season === s }" @click="load('all', s)">Mùa {{ s }}</button>
      </div>
      <GameBoardList :rows="rows" :empty="scope === 'year' ? 'Chưa có bạn nào trong lớp hiện tên trên bảng năm nay.' : 'Chưa có ai hiện tên trên bảng.'" />
    </div>

    <BagGame v-if="playing" ref="game" :best="best" @start="onGameStart" @over="onGameOver" @exit="playing = false" />
  </AppCard>
</template>

<style scoped>
.game-corner { grid-column: 1 / -1; }
.section-title { display: flex; gap: 12px; align-items: center; margin-bottom: 14px; }
.section-title > svg { width: 28px; color: var(--color-primary); }
.section-title span { color: var(--color-primary); font-size: var(--font-size-ui-min); font-weight: 850; letter-spacing: .08em; }
.section-title h2 { margin: 4px 0; }
.intro { margin: 0 0 12px; color: var(--text-muted); line-height: 1.5; }
.summary { display: grid; grid-template-columns: auto auto 1fr; gap: 10px 22px; align-items: center; }
.summary > div { display: grid; }
.summary small { color: var(--text-muted); font-size: .78rem; }
.summary b { font-size: 1.3rem; }
.toggle { display: flex; gap: 10px; align-items: flex-start; justify-self: end; cursor: pointer; }
.toggle input { margin-top: 4px; }
.toggle span { display: grid; }
.toggle small { color: var(--text-muted); font-size: .8rem; }
.actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; }
.boards { margin-top: 14px; }
.seasons { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-top: 10px; font-size: .82rem; color: var(--text-muted); }
.seasons button { padding: 3px 10px; border: 1px solid var(--border); border-radius: 999px; background: var(--surface); color: var(--text); font: inherit; cursor: pointer; }
.seasons button.active { border-color: var(--color-primary); color: var(--color-primary); font-weight: 800; }
.message { margin: 0 0 12px; padding: 10px 12px; border-radius: 12px; font-size: .9rem; line-height: 1.45; }
.message.info { background: color-mix(in srgb, var(--color-sky, #3b82f6) 12%, var(--surface)); }
.message.error { background: color-mix(in srgb, var(--color-danger) 12%, var(--surface)); color: var(--color-danger); }
.message.success { background: color-mix(in srgb, var(--color-mint, #22a06b) 16%, var(--surface)); }
@media (max-width: 720px) {
  .summary { grid-template-columns: 1fr 1fr; }
  .toggle { grid-column: 1 / -1; justify-self: start; }
}
</style>
