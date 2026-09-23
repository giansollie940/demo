<script setup lang="ts">
import { computed } from 'vue';
import { dateLabel, type Notice } from '../../features/homework/api';
const props = defineProps<{notice: Notice; visibleNotices: Notice[]; busy: boolean}>();
const emit = defineEmits<{view: [notice: Notice]; edit: [notice: Notice]}>();
// Use only the server-filtered public feed, never private queue/candidate data.
const existing = computed(() =>
  ['pending_duplicate_review', 'duplicate_rejected'].includes(props.notice.status)
    ? props.visibleNotices.find(n => n.id === props.notice.duplicate_of &&
      n.status === 'published' && n.class_id === props.notice.class_id &&
      n.subject_id === props.notice.subject_id &&
      n.english_group_id === props.notice.english_group_id)
    : undefined,
);
</script>

<template>
  <aside v-if="existing" class="duplicate-warning" role="status" aria-label="Cảnh báo nội dung trùng">
    <strong>⚠️ Có vẻ nội dung này đã được báo trước đó.</strong>
    <dl>
      <div><dt>Môn</dt><dd>{{ existing.subject }}</dd></div>
      <div><dt>Thông báo đã có</dt><dd>{{ existing.title }}</dd></div>
      <div><dt>Deadline</dt><dd>{{ dateLabel(existing.due_at) }}</dd></div>
      <div><dt>Người đăng</dt><dd>{{ existing.author_name }}</dd></div>
      <div><dt>Thời gian đăng</dt><dd>{{ dateLabel(existing.created_at) }}</dd></div>
    </dl>
    <div class="warning-actions">
      <button type="button" :disabled="busy" @click="emit('view', existing)">Xem thông báo đã có</button>
      <button type="button" :disabled="busy" @click="emit('edit', notice)">Sửa nội dung</button>
    </div>
  </aside>
</template>

<style scoped>
.duplicate-warning { margin-top: .75rem; padding: 1rem; border: 1px solid #d49e39; border-radius: 1rem; background: #fff8e7; color: #553b12; }
dl { display: grid; gap: .4rem; margin: .8rem 0; }
dl div { display: flex; flex-wrap: wrap; gap: .3rem .6rem; }
dt { font-weight: 600; }
dd { margin: 0; overflow-wrap: anywhere; }
.warning-actions { display: flex; flex-wrap: wrap; gap: .6rem; }
button { padding: .6rem .8rem; border: 1px solid #94691c; border-radius: .6rem; background: white; color: #553b12; cursor: pointer; }
button:disabled { opacity: .6; cursor: wait; }
</style>
