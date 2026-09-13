<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { useAuthStore } from "../../stores/auth";
import { useContextStore } from "../../stores/context";
import {
  homeworkRpc,
  type HomeworkNotification,
} from "../../features/homework/api";
import { useHomeworkViewStore } from "../../features/homework/view-context";
const view = useHomeworkViewStore();
const auth = useAuthStore(),
  ctx = useContextStore(),
  router = useRouter();
const open = ref(false),
  items = ref<HomeworkNotification[]>([]),
  error = ref("");
const classId = computed(
  () =>
    ctx.selectedClassId ||
    auth.currentUser?.classId ||
    ctx.classes.find((c) => c.active)?.id ||
    "",
);
const count = computed(() => items.value.filter((n) => !n.is_read).length);
let sequence = 0;
async function refresh() {
  const id = ++sequence;
  if (!classId.value || !auth.currentUser) {
    items.value = [];
    return;
  }
  try {
    const result = await homeworkRpc<HomeworkNotification[]>(
      "inbox",
      classId.value,
    );
    if (id === sequence) {
      items.value = result;
      error.value = "";
    }
  } catch {
    if (id === sequence) error.value = "Chưa tải được thông báo Báo bài.";
  }
}
async function visit(n: HomeworkNotification) {
  try {
    await homeworkRpc("read_notification", classId.value, { id: n.id });
    n.is_read = true;
    open.value = false;
    await router.push("/homework");
  } catch {
    error.value = "Chưa đánh dấu đã đọc được.";
  }
}
watch(
  [classId, () => auth.currentUser?.id, () => view.refreshVersion],
  () => {
    items.value = [];
    void refresh();
  },
  { immediate: true },
);
const timer = setInterval(() => {
  if (document.visibilityState === "visible") void refresh();
}, 60000);
onUnmounted(() => {
  sequence++;
  clearInterval(timer);
});
</script>
<template>
  <div class="homework-inbox">
    <button
      class="bell"
      :aria-expanded="open"
      aria-label="Thông báo Báo bài"
      @click="
        open = !open;
        open && refresh();
      "
    >
      🔔<span v-if="count">{{ count }}</span>
    </button>
    <section v-if="open" class="inbox-panel">
      <header>
        <strong>Thông báo Báo bài</strong
        ><button @click="open = false" aria-label="Đóng thông báo">×</button>
      </header>
      <p v-if="error" role="status">{{ error }}</p>
      <p v-else-if="!items.length">Chưa có thông báo.</p>
      <button
        v-for="n in items"
        :key="n.id"
        class="inbox-item"
        :class="{ unread: !n.is_read }"
        @click="visit(n)"
      >
        <b>{{ n.title }}</b
        ><span>{{ n.message }}</span>
      </button>
    </section>
  </div>
</template>
<style scoped>
.homework-inbox {
  position: relative;
}
.bell {
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 9px;
  background: var(--surface);
  cursor: pointer;
}
.bell span {
  background: #994565;
  color: white;
  font-size: 11px;
  border-radius: 10px;
  padding: 2px 4px;
}
.inbox-panel {
  position: absolute;
  right: 0;
  top: 50px;
  width: min(340px, 80vw);
  max-height: 65vh;
  overflow: auto;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 18px;
  box-shadow: 0 15px 40px #12253633;
  padding: 14px;
  z-index: 120;
}
.inbox-panel header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.inbox-panel header button {
  background: none;
  border: 0;
  color: inherit;
  font-size: 22px;
  cursor: pointer;
}
.inbox-item {
  width: 100%;
  display: grid;
  gap: 7px;
  text-align: left;
  border: 0;
  border-bottom: 1px solid var(--border);
  padding: 14px 8px;
  background: transparent;
  color: inherit;
  cursor: pointer;
}
.inbox-item span {
  font-size: 0.85rem;
  line-height: 1.5;
}
.inbox-item.unread {
  border-left: 3px solid #3a8f7c;
}
</style>
