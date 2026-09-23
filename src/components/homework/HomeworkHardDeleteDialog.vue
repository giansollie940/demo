<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import AppButton from '../ui/AppButton.vue'
import { dateLabel, type Notice } from '../../features/homework/api'
const props = defineProps<{ notice: Notice; classLabel: string; busy: boolean; error: string }>()
const emit = defineEmits<{ close: []; confirm: [reason: string] }>()
const dialog = ref<HTMLDialogElement | null>(null)
const reason = ref('')
const confirmed = ref(false)
const valid = computed(() => confirmed.value && !!reason.value.trim())
let previous: HTMLElement | null = null
onMounted(() => {
  if (typeof document !== 'undefined') previous = document.activeElement as HTMLElement
  dialog.value?.showModal?.()
})
onUnmounted(() => previous?.focus?.())
function close() { if (!props.busy) emit('close') }
function submit() { if (!props.busy && valid.value) emit('confirm', reason.value.trim()) }
</script>
<template>
  <dialog ref="dialog" class="hard-delete-dialog" role="alertdialog" aria-modal="true" aria-labelledby="hard-delete-title" @cancel.prevent="close">
    <form @submit.prevent="submit">
      <h2 id="hard-delete-title">Xóa vĩnh viễn Báo bài</h2>
      <section class="target-summary">
        <strong>{{ notice.title }}</strong>
        <dl>
          <div><dt>Lớp</dt><dd>{{ classLabel }}</dd></div>
          <div><dt>Người đăng</dt><dd>{{ notice.author_name || notice.author_id }}</dd></div>
          <div><dt>Ngày đăng</dt><dd>{{ dateLabel(notice.created_at) }}</dd></div>
          <div><dt>Mã bài</dt><dd>{{ notice.id }}</dd></div>
        </dl>
      </section>
      <p>Nội dung bài sẽ bị xóa vĩnh viễn và không thể khôi phục. Ảnh được đưa vào hàng chờ dọn an toàn.</p>
      <label>Lý do xóa<textarea v-model="reason" autofocus required maxlength="500" rows="3" :disabled="busy" /></label>
      <label class="check"><input v-model="confirmed" type="checkbox" :disabled="busy">Tôi xác nhận xóa đúng bài trên và hiểu rằng không thể hoàn tác.</label>
      <p v-if="error" role="alert" class="error">{{ error }}</p>
      <footer>
        <AppButton type="button" variant="secondary" :disabled="busy" @click="close">Hủy</AppButton>
        <AppButton type="submit" variant="danger" :disabled="busy || !valid" :loading="busy">Xác nhận xóa vĩnh viễn</AppButton>
      </footer>
    </form>
  </dialog>
</template>
<style scoped>
.hard-delete-dialog{position:fixed;inset:0;margin:auto;width:min(560px,calc(100vw - 28px));max-height:calc(100dvh - 28px);overflow:auto;padding:24px;border:1px solid var(--border);border-radius:20px;color:var(--text);background:var(--surface-raised);box-shadow:var(--shadow-md)}
.hard-delete-dialog::backdrop{background:rgb(15 23 42 / .55)}
form{display:grid;gap:16px}h2,p{margin:0}p{line-height:1.5}.target-summary{padding:14px;background:var(--surface-soft);border-radius:12px;overflow-wrap:anywhere}
dl{display:grid;gap:7px;margin:12px 0 0}dl>div{display:grid;grid-template-columns:90px 1fr;gap:10px}dt{color:var(--text-muted)}dd{margin:0}
label{display:grid;gap:8px}textarea{width:100%;box-sizing:border-box;font:inherit;padding:10px;border:1px solid var(--border);border-radius:10px;background:var(--input);color:var(--text)}
.check{display:flex;align-items:flex-start;gap:10px}.check input{flex:none;width:20px;height:20px}
footer{display:flex;justify-content:flex-end;gap:10px;flex-wrap:wrap}.error{color:var(--color-danger)}
@media(max-width:480px){.hard-delete-dialog{padding:16px}footer{display:grid}dl>div{grid-template-columns:70px 1fr}}
</style>
