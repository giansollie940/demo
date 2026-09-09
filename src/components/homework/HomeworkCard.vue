<script setup lang="ts">
import { computed } from "vue";
import {
  dateLabel,
  stateLabels,
  type Notice,
} from "../../features/homework/api";
const props = defineProps<{
  notice: Notice;
  userId: string;
  role: string;
  busy: boolean;
  now: number;
}>();
const roleLabels: Record<string, string> = {
  student: "Học sinh",
  monitor: "Cán sự",
  teacher: "Giáo viên",
  admin: "Admin",
};
const emit = defineEmits<{
  edit: [notice: Notice];
  remove: [notice: Notice];
  heart: [notice: Notice];
  remind: [notice: Notice];
}>();
const own = computed(() => props.notice.author_id === props.userId);
const manage = computed(
  () =>
    own.value ||
    (["admin", "teacher", "monitor"].includes(props.role) &&
      ["student", "monitor"].includes(props.notice.author_role) &&
      (props.role !== "monitor" || props.notice.status === "published")),
);
const deadlineText = computed(() => {
  const due = new Date(props.notice.due_at).getTime();
  if (due < props.now) return "Đã quá hạn";
  const days =
    Math.floor((due + 7 * 3600000) / 86400000) -
    Math.floor((props.now + 7 * 3600000) / 86400000);
  return days === 0 ? "Hôm nay" : `Còn ${days} ngày`;
});
</script>
<template>
  <article
    class="notice-card"
    :class="{ expired: new Date(notice.due_at).getTime() < now }"
    :id="`notice-${notice.id}`"
  >
    <div class="notice-top">
      <span
        >{{ notice.icon }} {{ notice.subject
        }}<template v-if="notice.english_group">
          · {{ notice.english_group }}</template
        ></span
      ><strong>{{ deadlineText }}</strong>
    </div>
    <h3>{{ notice.title }}</h3>
    <p class="notice-content">{{ notice.content }}</p>
    <p class="deadline">
      Hạn: <strong>{{ dateLabel(notice.due_at) }}</strong>
    </p>
    <p class="byline">
      {{ notice.author_name }} · {{ roleLabels[notice.author_role] }} ·
      {{ dateLabel(notice.created_at) }}
    </p>
    <span class="notice-state">{{ stateLabels[notice.status] }}</span>
    <p v-if="notice.status === 'duplicate_rejected'" class="hint">
      Bài được lưu trong lịch sử; không xuất hiện trên bảng chung và không tính
      đóng góp.
    </p>
    <footer>
      <button
        v-if="notice.status === 'published'"
        :disabled="busy || own"
        :aria-pressed="notice.liked"
        :aria-label="
          own
            ? 'Không tự thả tim bài của mình'
            : notice.liked
              ? 'Bỏ tim'
              : 'Thả tim'
        "
        @click="emit('heart', notice)"
      >
        {{ notice.liked ? "❤️" : "♡" }} {{ notice.hearts }}
      </button>
      <button
        v-if="
          notice.status === 'published' &&
          ['admin', 'teacher', 'monitor'].includes(role)
        "
        :disabled="busy"
        @click="emit('remind', notice)"
      >
        🔔 Nhắc
      </button>
      <button
        v-if="manage && !['deleted', 'replaced'].includes(notice.status)"
        :disabled="busy"
        @click="emit('edit', notice)"
      >
        Sửa
      </button>
      <button
        v-if="manage && notice.status !== 'deleted'"
        :disabled="busy"
        @click="emit('remove', notice)"
      >
        Xóa
      </button>
    </footer>
  </article>
</template>
<style scoped>
.notice-card {
  background: var(--surface, #fff);
  border: 1px solid var(--border, #dce5ed);
  border-radius: 22px;
  padding: 22px;
  box-shadow: 0 5px 18px #22334b08;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
}
.notice-top {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 8px;
  color: var(--text-secondary, #536375);
  font-size: 0.88rem;
}
.notice-top strong {
  color: #996015;
  background: #fff2ce;
  border-radius: 12px;
  padding: 3px 8px;
}
.notice-card h3 {
  font-size: 1.16rem;
  margin: 0;
}
.notice-content {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  line-height: 1.6;
  margin: 0;
}
.deadline,
.byline {
  margin: 0;
}
.byline,
.hint {
  font-size: 0.82rem;
  color: var(--text-secondary, #64748b);
}
.notice-state {
  font-size: 0.82rem;
}
footer {
  margin-top: auto;
  display: flex;
  gap: 7px;
  flex-wrap: wrap;
  padding-top: 10px;
}
button {
  border: 1px solid var(--border, #dbe5eb);
  background: var(--surface, #fff);
  border-radius: 12px;
  padding: 8px 12px;
  cursor: pointer;
  color: inherit;
}
button:disabled {
  opacity: 0.5;
  cursor: default;
}
button[aria-pressed="true"] {
  background: #fff0f4;
  color: #a22a56;
}
.expired {
  opacity: 0.8;
}
.hint {
  margin: 0;
}
</style>
