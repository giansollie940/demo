<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from "vue";
import { useAuthStore } from "../stores/auth";
import { useContextStore } from "../stores/context";
import PageArtwork from "../components/ui/PageArtwork.vue";
import PageBannerArt from "../components/ui/PageBannerArt.vue";
import HomeworkCard from "../components/homework/HomeworkCard.vue";
import HomeworkDuplicateWarning from "../components/homework/HomeworkDuplicateWarning.vue";
import {
  homeworkRpc,
  submitHomework,
  dateLabel,
  localDeadline,
  utcDeadline,
  type HomeworkData,
  type Notice,
  type Subject,
  type EnglishGroup,
} from "../features/homework/api";
import { homeworkTabs, resolveHomeworkTab, useHomeworkViewStore } from "../features/homework/view-context";
const view = useHomeworkViewStore();
const auth = useAuthStore(),
  ctx = useContextStore();
const classId = computed(
  () =>
    ctx.selectedClassId ||
    auth.currentUser?.classId ||
    ctx.classes.find((c) => c.active)?.id ||
    "",
);
const role = computed(() => auth.role || "student"),
  manager = computed(() => ["teacher", "admin"].includes(role.value)),
  teacher = computed(() => role.value === "teacher"),
  admin = computed(() => role.value === "admin");
const data = ref<HomeworkData | null>(null),
  loading = ref(false),
  busy = ref(false),
  error = ref(""),
  message = ref(""),
  subject = ref(""),
  week = ref(ctx.selectedWeekId || ""),
  now = ref(Date.now());
const timer = setInterval(() => (now.value = Date.now()), 60000);
let loadId = 0;
const editing = ref(false),
  deleteTarget = ref<Notice | null>(null),
  deleteReason = ref(""),
  hardTarget = ref<Notice | null>(null),
  hardReason = ref(""),
  hardConfirmed = ref(false),
  reviewReasons = reactive<Record<string, string>>({});
const form = reactive({
  id: "",
  revision: 0,
  request_id: crypto.randomUUID(),
  subject_id: "",
  english_group_id: "",
  title: "",
  content: "",
  deadline: "",
});
const subjectForm = reactive({
  id: "",
  name: "",
  short_name: "",
  icon: "📚",
  sort_order: 0,
  is_english: false,
  is_active: true,
});
const groupForm = reactive({ id: "", name: "", is_active: true }),
  assign = reactive({ student_id: "", english_group_id: "" });
const seed = ref(3),
  semanticEnabled = ref(true),
  pending = ref(70),
  reject = ref(90),
  alerts = ref("system");
const tabs = computed(() => homeworkTabs(role.value));
// A stale or unauthorized selection never becomes the rendered page/Owl context.
const tab = computed({
  get: () => resolveHomeworkTab(role.value, view.selectedTab).id,
  set: (value: string) => { view.selectedTab = value; },
});
watch(role, () => {
  view.selectedTab = tab.value; editing.value = false; deleteTarget.value = null; hardTarget.value = null;
  data.value = null; void load();
});
const selectedSubject = computed(() =>
  data.value?.subjects.find((s) => s.id === form.subject_id),
);
const filtered = computed(() =>
  (data.value?.notices || []).filter(
    (n) => !subject.value || n.subject_id === subject.value,
  ),
);
const upcoming = computed(() =>
  filtered.value.filter((n) => new Date(n.due_at).getTime() >= now.value),
);
const overdue = computed(() =>
  filtered.value.filter((n) => new Date(n.due_at).getTime() < now.value),
);
const reviewCases = computed(() => tab.value === 'queue' ? data.value?.queue || [] : data.value?.review_history || []);
const personal = computed(() =>
  data.value?.leaderboard.find((r) => r.id === auth.currentUser?.id),
);
const birds = computed(() =>
  [...(data.value?.leaderboard || [])]
    .filter((r) => r.notices > 0)
    .sort((a, b) => a.notice_rank - b.notice_rank),
);
const stars = computed(() =>
  [...(data.value?.leaderboard || [])]
    .filter((r) => r.hearts > 0)
    .sort((a, b) => a.heart_rank - b.heart_rank),
);
async function load() {
  if (!classId.value) return;
  const id = ++loadId;
  loading.value = true;
  error.value = "";
  try {
    const result = await homeworkRpc<HomeworkData>("load", classId.value, {
      week_id: week.value || null,
    });
    if (id !== loadId) return;
    data.value = result;
    seed.value = result.settings.seed_threshold;
    pending.value = result.ai_settings?.duplicate_review_threshold ?? 70;
    reject.value = result.ai_settings?.duplicate_auto_threshold ?? 90;
    semanticEnabled.value = result.ai_settings?.semantic_duplicate_enabled ?? true;
    alerts.value = result.alert_level || "system";
  } catch (e) {
    if (id === loadId)
      error.value = e instanceof Error ? e.message : "Không tải được Báo bài.";
  } finally {
    if (id === loadId) loading.value = false;
  }
}
async function act(action: string, payload: Record<string, unknown>) {
  if (busy.value) return;
  busy.value = true;
  error.value = "";
  message.value = "";
  try {
    await homeworkRpc(action, classId.value, payload);
    message.value = "Đã lưu thay đổi.";
    view.refreshVersion++;
    await load();
  } catch (e) {
    error.value =
      e instanceof Error ? e.message : "Không thực hiện được thao tác.";
  } finally {
    busy.value = false;
  }
}
function compose(n?: Notice) {
  if (admin.value) return;
  Object.assign(form, {
    id: n?.id || "",
    revision: n?.revision || 0,
    request_id: crypto.randomUUID(),
    subject_id: n?.subject_id || "",
    english_group_id: n?.english_group_id || "",
    title: n?.title || "",
    content: n?.content || "",
    deadline: n ? localDeadline(n.due_at) : "",
  });
  editing.value = true;
}
async function send() {
  if (busy.value) return;
  busy.value = true;
  error.value = "";
  message.value = "";
  try {
    const result = await submitHomework(classId.value, {
      ...form,
      id: form.id || null,
      english_group_id: selectedSubject.value?.is_english
        ? form.english_group_id
        : null,
      due_at: utcDeadline(form.deadline),
    });
    editing.value = false;
    message.value =
      result.message ||
      (result.notice?.status === "published"
        ? "Đã công bố Báo bài."
        : "Đã lưu bài vào Lịch sử đăng để kiểm tra nội dung trùng.");
    view.refreshVersion++;
    await load();
    if (result.notice?.status !== "published") tab.value = "history";
  } catch (e) {
    error.value =
      (e instanceof Error ? e.message : "Chưa gửi được bài.") +
      " Kiểm tra Lịch sử đăng trước khi gửi lại.";
  } finally {
    busy.value = false;
  }
}
async function retry(n: Notice) {
  if (busy.value) return;
  busy.value = true;
  error.value = "";
  message.value = "";
  try {
    const result = await submitHomework(classId.value, { action: "retry", id: n.id });
    message.value = result.message || (result.notice?.status === "published"
      ? "Đã kiểm tra lại và công bố Báo bài."
      : "Đã kiểm tra lại. Xem kết quả trong lịch sử hoặc danh sách chờ.");
    view.refreshVersion++;
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Chưa kiểm tra lại được bài.";
  } finally { busy.value = false; }
}
function remove(n: Notice) {
  if (admin.value) return;
  deleteTarget.value = n;
  deleteReason.value = "";
}
function requestHardDelete(n: Notice) {
  hardTarget.value = n; hardReason.value = ""; hardConfirmed.value = false;
}
async function confirmHardDelete() {
  if (!admin.value || !hardTarget.value || !hardConfirmed.value || !hardReason.value.trim() || hardReason.value.trim().length > 500) return;
  await act("hard_delete", { id: hardTarget.value.id, confirm_irreversible: true, hard_delete_reason: hardReason.value.trim() });
  if (!error.value) hardTarget.value = null;
}
async function confirmDelete() {
  await act("delete", {
    id: deleteTarget.value?.id,
    reason: deleteReason.value,
  });
  if (!error.value) deleteTarget.value = null;
}
function editSubject(s?: Subject) {
  Object.assign(
    subjectForm,
    s || {
      id: "",
      name: "",
      short_name: "",
      icon: "📚",
      sort_order: 0,
      is_english: false,
      is_active: true,
    },
  );
}
function editGroup(g?: EnglishGroup) {
  Object.assign(groupForm, g || { id: "", name: "", is_active: true });
}
async function saveSubject() {
  await act("subject_save", { ...subjectForm, id: subjectForm.id || null });
  if (!error.value) editSubject();
}
async function saveGroup() {
  await act("group_save", { ...groupForm, id: groupForm.id || null });
  if (!error.value) editGroup();
}
function jump(id: string) {
  tab.value = "board";
  subject.value = "";
  setTimeout(
    () =>
      document
        .getElementById(`notice-${id}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" }),
    50,
  );
}
watch([classId, week], () => {
  editing.value = false;
  data.value = null;
  void load();
});
onMounted(load);
onUnmounted(() => {
  view.selectedTab = null;
  loadId++;
  clearInterval(timer);
});
</script>
<template>
  <section class="homework-page">
    <header class="homework-banner">
      <PageBannerArt tone="sun" /><PageArtwork name="homework" tone="sun" />
      <div>
        <p class="eyebrow">CÙNG NHAU HỌC TỐT</p>
        <h1>{{ admin ? "Quản trị Báo bài" : "Báo bài" }}</h1>
        <p>Một lời nhắc nhỏ, thêm một bạn hoàn thành bài.</p>
      </div>
      <button class="refresh" :disabled="loading || busy" @click="load">
        ↻ Làm mới
      </button>
    </header>
    <p v-if="!classId" class="empty">
      Chưa có lớp hoạt động để sử dụng Báo bài.
    </p>
    <nav class="tabs" aria-label="Các mục Báo bài">
      <button
        v-for="t in tabs"
        :key="t.id"
        :aria-current="tab === t.id ? 'page' : undefined"
        @click="tab = t.id"
      >
        {{ t.label
        }}<span v-if="t.id === 'queue' && data?.queue.length">
          · {{ data.queue.length }}</span
        >
      </button>
    </nav>
    <p v-if="error" role="alert" class="error">{{ error }}</p>
    <p v-if="message" role="status" class="success">{{ message }}</p>
    <p v-if="loading" role="status">Đang tải Báo bài…</p>
    <template v-if="data">
      <section v-if="tab === 'overview'" class="panel">
        <h2>Tình trạng Báo bài</h2>
        <div class="metrics">
          <div>
            <strong>{{ data.health?.total || 0 }}</strong
            ><span>Bài trong hệ thống</span>
          </div>
          <div>
            <strong>{{ data.health?.pending || 0 }}</strong
            ><span>Đang chờ giáo viên</span>
          </div>
        </div>
        <p>
          Giáo viên phụ trách xử lý nội dung. Admin theo dõi lỗi và cảnh báo
          theo cấu hình đã chọn.
        </p>
        <ul class="notifications">
          <li v-for="n in data.notifications" :key="n.id">
            <strong>{{ n.title }}</strong>
            <p>{{ n.message }}</p>
            <small>{{ dateLabel(n.created_at) }}</small>
          </li>
        </ul>
      </section>
      <template v-if="tab === 'board'">
        <button
          v-if="!admin"
          class="composer-launch"
          :disabled="busy || !data.subjects.some((s) => s.is_active)"
          @click="compose()"
        >
          <span>✏️</span>
          <div>
            <strong>Bạn có bài tập hoặc lời nhắc nào?</strong
            ><small>Chia sẻ để cả lớp cùng nhớ nhé.</small>
          </div>
          <b>＋ Đăng Báo bài</b>
        </button>
        <p v-if="!data.subjects.some((s) => s.is_active)" class="empty">
          Giáo viên cần thêm môn học trước khi lớp đăng bài.
        </p>
        <div class="tabs subjects">
          <button :aria-pressed="!subject" @click="subject = ''">Tất cả</button
          ><button
            v-for="s in data.subjects"
            :key="s.id"
            :aria-pressed="subject === s.id"
            @click="subject = s.id"
          >
            {{ s.icon }} {{ s.short_name || s.name }}
          </button>
        </div>
        <h2>📅 Những bài cần hoàn thành</h2>
        <p v-if="!upcoming.length" class="empty">
          Chưa có bài còn hạn trong mục này.
        </p>
        <div class="notice-grid">
          <HomeworkCard
            v-for="n in upcoming"
            :key="n.id"
            :notice="n"
            :user-id="auth.currentUser?.id || ''"
            :role="role"
            :busy="busy"
            :now="now"
            @edit="compose"
            @remove="remove"
            @heart="act('heart', { id: n.id, liked: !n.liked })"
            @remind="act('remind', { id: n.id })"
          />
        </div>
        <details class="overdue">
          <summary>Đã quá hạn · {{ overdue.length }}</summary>
          <div class="notice-grid">
            <HomeworkCard
              v-for="n in overdue"
              :key="n.id"
              :notice="n"
              :user-id="auth.currentUser?.id || ''"
              :role="role"
              :busy="busy"
              :now="now"
              @edit="compose"
              @remove="remove"
              @heart="act('heart', { id: n.id, liked: !n.liked })"
              @remind="act('remind', { id: n.id })"
            />
          </div>
        </details>
      </template>
      <section v-if="tab === 'history'">
        <h2>Lịch sử đăng của tôi</h2>
        <p v-if="!data.history.length && !data.history_markers?.length" class="empty">
          Chưa có bài đăng. Hãy chia sẻ lời nhắc đầu tiên!
        </p>
        <article v-for="marker in data.history_markers" :key="marker.notice_id" class="panel">
          <strong>{{ marker.marker }}</strong>
          <p>Tạo: {{ dateLabel(marker.original_created_at) }} · Xóa vĩnh viễn: {{ dateLabel(marker.hard_deleted_at) }}</p>
        </article>
        <div class="notice-grid">
          <div v-for="n in data.history" :key="n.id">
            <HomeworkCard
              :notice="n"
              :user-id="auth.currentUser?.id || ''"
              :role="role"
              :busy="busy"
              :now="now"
              @edit="compose"
              @remove="remove"
              @heart="act('heart', { id: n.id, liked: !n.liked })"
              @remind="act('remind', { id: n.id })"
            />
            <button v-if="!admin && n.can_retry" type="button" :disabled="busy" @click="retry(n)">Thử kiểm tra AI lại</button>
            <HomeworkDuplicateWarning v-if="!admin"
              :notice="n"
              :visible-notices="data.notices"
              :busy="busy"
              @view="jump($event.id)"
              @edit="compose"
            />
          </div>
        </div>
      </section>
      <section v-if="tab === 'awards'">
        <div class="section-heading">
          <h2>🌟 Góc tuyên dương</h2>
          <label
            >Thời gian<select v-model="week">
              <option value="">Toàn năm học</option>
              <option v-for="w in ctx.weeks" :key="w.id" :value="w.id">
                Tuần {{ w.number }}
              </option>
            </select></label
          >
        </div>
        <p v-if="personal" class="personal">
          Của tôi trong năm học:
          <strong>{{ personal.year_notices }} bài hợp lệ</strong
          ><span v-if="personal.seed_at">
            · 🌱 Đạt Mầm xanh ngày {{ dateLabel(personal.seed_at) }}</span
          >
        </p>
        <div class="awards-grid">
          <article class="panel bird">
            <h3>🐦 Chim sẻ đưa tin</h3>
            <p>Mỗi lời nhắc đều là một đóng góp.</p>
            <ol>
              <li v-for="r in birds" :key="r.id">
                <b>#{{ r.notice_rank }} {{ r.full_name }}</b
                ><span>{{ r.notices }} bài</span>
              </li>
            </ol>
            <p v-if="!birds.length">Chưa có bài hợp lệ trong thời gian này.</p>
          </article>
          <article class="panel star">
            <h3>⭐ Ngôi sao dẫn đường</h3>
            <p>Những chia sẻ được các bạn yêu thích.</p>
            <ol>
              <li v-for="r in stars" :key="r.id">
                <b>#{{ r.heart_rank }} {{ r.full_name }}</b
                ><span>❤️ {{ r.hearts }}</span>
              </li>
            </ol>
            <p v-if="!stars.length">Chưa có tim trong thời gian này.</p>
          </article>
          <article class="panel seed">
            <h3>🌱 Mầm xanh đóng góp</h3>
            <p>
              Mốc {{ data.settings.seed_threshold }} bài hợp lệ trong năm học.
            </p>
            <ul>
              <li
                v-for="r in data.leaderboard.filter((x) => x.seed_at)"
                :key="r.id"
              >
                <b>{{ r.full_name }}</b
                ><small>{{ dateLabel(r.seed_at!) }}</small>
              </li>
            </ul>
          </article>
        </div>
      </section>
      <section v-if="tab === 'queue' || (tab === 'audit' && teacher)">
        <h2>{{ tab === "audit" ? "Lịch sử kiểm tra trùng" : teacher ? "Báo bài cần xử lý" : "Bài đang chờ giáo viên" }}</h2>
        <p v-if="!teacher">
          Cán sự xem thông tin cặp bài để hỗ trợ lớp. Giáo viên quyết định kết
          quả.
        </p>
        <p v-if="!reviewCases.length" class="empty">Không có bài cần xem xét.</p>
        <article v-for="n in reviewCases" :key="n.id" class="panel queue-case">
          <div class="comparison">
            <div>
              <small>BÀI MỚI</small>
              <h3>{{ n.title }}</h3>
              <p class="preserve">{{ n.content }}</p>
              <p>
                {{ n.subject }} · {{ n.english_group }} ·
                {{ dateLabel(n.due_at) }}
              </p>
              <small
                >{{ n.author_name }} · {{ n.author_role }} ·
                {{ dateLabel(n.created_at) }}</small
              >
            </div>
            <div v-if="n.candidate">
              <small>BÀI ĐƯỢC SO SÁNH</small>
              <h3>{{ n.candidate.title }}</h3>
              <p class="preserve">{{ n.candidate.content }}</p>
              <p>
                {{ n.candidate.subject }} · {{ n.candidate.english_group }} ·
                {{ dateLabel(n.candidate.due_at) }}
              </p>
              <small
                >{{ n.candidate.author_name }} · {{ n.candidate.author_role }} ·
                {{ dateLabel(n.candidate.created_at) }}</small
              >
            </div>
            <p v-else>{{ n.duplicate_tombstone_id ? "Bài được so sánh đã bị xóa vĩnh viễn." : "Chưa có bài so sánh. Giáo viên cần kiểm tra nội dung." }}</p>
          </div>
          <template v-if="teacher"
            ><button v-if="!admin && n.can_retry" type="button" :disabled="busy" @click="retry(n)">Thử kiểm tra AI lại</button><p>
              {{ n.score != null ? `Mức giống: ${n.score}% · ` : ""
              }}{{ n.reason || "Chưa nhận được kết quả AI." }}
            </p>
            <label
              >Lý do quyết định<input
                v-model="reviewReasons[n.id]"
                maxlength="1000"
                placeholder="Bắt buộc khi giữ cả hai"
            /></label>
            <div class="actions">
              <template v-if="n.candidate?.status === 'published' && n.score != null"
                ><button
                  :disabled="busy"
                  @click="
                    act('review', {
                      id: n.id,
                      decision: 'keep_existing',
                      reason: reviewReasons[n.id],
                    })
                  "
                >
                  Giữ bài cũ</button
                ><button
                  :disabled="busy"
                  @click="
                    act('review', {
                      id: n.id,
                      decision: 'replace_existing',
                      reason: reviewReasons[n.id],
                    })
                  "
                >
                  Giữ bài mới</button
                ><button
                  :disabled="busy || !reviewReasons[n.id]?.trim()"
                  @click="
                    act('review', {
                      id: n.id,
                      decision: 'keep_both',
                      reason: reviewReasons[n.id],
                    })
                  "
                >
                  Giữ cả hai
                </button></template
              >
              <p v-else role="status">Chưa có kết quả so sánh hợp lệ. Bài tiếp tục chờ kiểm tra và chưa được công bố.</p>
            </div></template
          >
        </article>
      </section>
      <section v-if="tab === 'subjects' && teacher" class="panel">
        <h2>Môn học của lớp</h2>
        <div class="config-list">
          <button
            v-for="s in data.subjects"
            :key="s.id"
            @click="editSubject(s)"
          >
            {{ s.icon }} {{ s.name }} ·
            {{ s.is_active ? "Hoạt động" : "Tạm ngưng" }}
          </button>
        </div>
        <form class="form-grid" @submit.prevent="saveSubject">
          <label
            >Tên môn<input
              v-model="subjectForm.name"
              required
              maxlength="100" /></label
          ><label
            >Tên ngắn<input
              v-model="subjectForm.short_name"
              maxlength="30" /></label
          ><label
            >Biểu tượng<input
              v-model="subjectForm.icon"
              maxlength="12" /></label
          ><label
            >Thứ tự<input
              v-model.number="subjectForm.sort_order"
              type="number" /></label
          ><label class="check"
            ><input v-model="subjectForm.is_english" type="checkbox" />Môn Tiếng
            Anh</label
          ><label class="check"
            ><input v-model="subjectForm.is_active" type="checkbox" />Hoạt
            động</label
          >
          <div class="actions">
            <button type="submit" :disabled="busy">
              {{ subjectForm.id ? "Lưu môn" : "Thêm môn" }}</button
            ><button type="button" @click="editSubject()">Nhập mới</button>
          </div>
        </form>
      </section>
      <section v-if="tab === 'english' && teacher" class="panel">
        <h2>Nhóm Tiếng Anh</h2>
        <div class="config-list">
          <button v-for="g in data.groups" :key="g.id" @click="editGroup(g)">
            {{ g.name }} · {{ g.is_active ? "Hoạt động" : "Tạm ngưng" }}
          </button>
        </div>
        <form class="form-grid" @submit.prevent="saveGroup">
          <label
            >Tên nhóm<input
              v-model="groupForm.name"
              required
              maxlength="100" /></label
          ><label class="check"
            ><input v-model="groupForm.is_active" type="checkbox" />Hoạt
            động</label
          >
          <div class="actions">
            <button :disabled="busy">
              {{ groupForm.id ? "Lưu nhóm" : "Thêm nhóm" }}</button
            ><button type="button" @click="editGroup()">Nhập mới</button>
          </div>
        </form>
        <h3>Gán hoặc chuyển nhóm</h3>
        <form
          class="form-grid"
          @submit.prevent="act('group_assign', { ...assign })"
        >
          <label
            >Học sinh<select v-model="assign.student_id" required>
              <option value="">Chọn học sinh</option>
              <option v-for="s in data.learners" :key="s.id" :value="s.id">
                {{ s.name }}
              </option>
            </select></label
          ><label
            >Nhóm mới<select v-model="assign.english_group_id" required>
              <option value="">Chọn nhóm</option>
              <option
                v-for="g in data.groups.filter((x) => x.is_active)"
                :key="g.id"
                :value="g.id"
              >
                {{ g.name }}
              </option>
            </select></label
          ><button :disabled="busy">Lưu phân nhóm</button>
        </form>
        <ul>
          <li v-for="s in data.learners" :key="s.id">
            {{ s.name }} —
            {{
              data.groups.find(
                (g) =>
                  g.id ===
                  data?.members.find((m) => m.student_id === s.id)
                    ?.english_group_id,
              )?.name || "Chưa có nhóm"
            }}
          </li>
        </ul>
      </section>
      <section v-if="tab === 'trash' && manager">
        <h2>Thùng rác Báo bài</h2>
        <p>
          {{ admin ? "Chỉ xóa vĩnh viễn từng bài đã được xóa trước đó. Hành động không thể hoàn tác." : "Khôi phục bảo toàn lịch sử; bài có khả năng trùng mới sẽ chờ kiểm tra." }}
        </p>
        <article v-for="n in data.trash" :key="n.id" class="panel">
          <h3>{{ n.title }}</h3>
          <p>{{ n.delete_reason }}</p>
          <button v-if="teacher" :disabled="busy" @click="act('restore', { id: n.id })">
            Khôi phục
          </button>
          <button v-if="admin" :disabled="busy" @click="requestHardDelete(n)">Xóa vĩnh viễn</button>
        </article>
        <p v-if="!data.trash.length" class="empty">Thùng rác trống.</p>
      </section>
      <section v-if="tab === 'audit' && manager" class="panel">
        <h2>Nhật ký Báo bài</h2>
        <article v-for="tombstone in data.tombstones" :key="tombstone.notice_id" class="panel">
          <strong>Admin đã xóa vĩnh viễn notice</strong>
          <p>{{ dateLabel(tombstone.hard_deleted_at) }}</p>
          <details v-if="admin"><summary>Metadata xóa vĩnh viễn</summary><pre>{{ JSON.stringify(tombstone, null, 2) }}</pre></details>
        </article>
        <p>300 sự kiện gần nhất.</p>
        <details v-for="e in data.audit" :key="e.id">
          <summary>{{ dateLabel(e.created_at) }} · {{ e.event_type }}</summary>
          <pre>{{
            JSON.stringify(
              {
                actor: e.actor_id,
                notice: e.notice_id,
                before: e.before_data,
                after: e.after_data,
              },
              null,
              2,
            )
          }}</pre>
        </details>
      </section>
      <section v-if="tab === 'ai_settings' && teacher" class="panel">
        <h2>Cài đặt AI Báo bài</h2>
        <p>Tắt semantic vẫn giữ kiểm tra nội dung trùng chính xác và chuẩn hóa.</p>
        <form
          class="form-grid"
          @submit.prevent="
            act('ai_settings', {
              semantic_duplicate_enabled: semanticEnabled,
              duplicate_review_threshold: pending,
              duplicate_auto_threshold: reject,
            })
          "
        >
          <label><input v-model="semanticEnabled" type="checkbox" /> Bật kiểm tra trùng semantic</label>
          <label
            >Ngưỡng chờ GV (%)<input
              v-model.number="pending"
              type="number"
              step="1"
              min="0"
              max="99"
              required /></label
          ><label
            >Ngưỡng trùng (%)<input
              v-model.number="reject"
              type="number"
              step="1"
              :min="pending + 1"
              max="100"
              required /></label
          ><button :disabled="busy || !Number.isInteger(pending) || !Number.isInteger(reject) || pending >= reject">Lưu cài đặt AI</button>
        </form>
      </section>
      <section v-if="tab === 'settings' && admin" class="panel">
        <h2>Cấu hình Báo bài</h2>
        <form
          class="form-grid"
          @submit.prevent="act('settings', { seed_threshold: seed })"
        >
          <label
            >Ngưỡng Mầm xanh<input
              v-model.number="seed"
              type="number"
              min="1"
              step="1"
              required /></label
          ><button :disabled="busy">Lưu ngưỡng danh hiệu</button>
        </form>
        <form
          class="form-grid"
          @submit.prevent="act('alert_settings', { alert_level: alerts })"
        >
          <label
            >Cảnh báo Admin<select v-model="alerts">
              <option value="system">Chỉ lỗi hệ thống</option>
              <option value="backlog">Lỗi hệ thống + tồn đọng</option>
              <option value="all">Tất cả cảnh báo</option>
            </select></label
          ><button :disabled="busy">Lưu cảnh báo</button>
        </form>
      </section>
    </template>
    <div v-if="hardTarget && admin" class="modal-backdrop" @keydown.esc="!busy && (hardTarget = null)">
      <section role="dialog" aria-modal="true" aria-labelledby="hard-delete-title" class="modal">
        <h2 id="hard-delete-title">Xóa vĩnh viễn Báo bài</h2>
        <p>{{ hardTarget.title }}</p>
        <p>Nội dung, tim và lượt nhắc sẽ bị xóa; hành động không thể hoàn tác. Nhật ký xóa tối thiểu được giữ lại.</p>
        <form @submit.prevent="confirmHardDelete">
          <label>Lý do xóa vĩnh viễn<textarea v-model="hardReason" maxlength="500" required /></label>
          <label><input v-model="hardConfirmed" type="checkbox" required /> Tôi xác nhận xóa vĩnh viễn bài này.</label>
          <p v-if="error" role="alert">{{ error }}</p>
          <div class="actions"><button type="button" :disabled="busy" @click="hardTarget = null">Hủy</button><button :disabled="busy || !hardConfirmed || !hardReason.trim() || hardReason.trim().length > 500">Xóa vĩnh viễn</button></div>
        </form>
      </section>
    </div>
    <div
      v-if="editing && !admin"
      class="modal-backdrop"
      @keydown.esc="!busy && (editing = false)"
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="compose-title"
        class="modal"
      >
        <h2 id="compose-title">
          {{ form.id ? "Sửa Báo bài" : "✏️ Đăng Báo bài" }}
        </h2>
        <form @submit.prevent="send">
          <div class="form-grid">
            <label
              >Môn học<select
                v-model="form.subject_id"
                required
                @change="form.english_group_id = ''"
              >
                <option value="">Chọn môn</option>
                <option
                  v-for="s in data?.subjects.filter((s) => s.is_active)"
                  :key="s.id"
                  :value="s.id"
                >
                  {{ s.icon }} {{ s.name }}
                </option>
              </select></label
            ><label v-if="selectedSubject?.is_english"
              >Lớp Tiếng Anh áp dụng<select
                v-model="form.english_group_id"
                required
              >
                <option value="">Chọn nhóm</option>
                <option
                  v-for="g in data?.groups.filter((g) => g.is_active)"
                  :key="g.id"
                  :value="g.id"
                >
                  {{ g.name }}
                </option>
              </select></label
            >
          </div>
          <label
            >Tiêu đề<input
              v-model="form.title"
              required
              maxlength="200" /></label
          ><label
            >Nội dung<textarea
              v-model="form.content"
              required
              maxlength="6000"
              rows="5"
            /></label
          ><label
            >Hạn hoàn thành (giờ Việt Nam)<input
              v-model="form.deadline"
              type="datetime-local"
              required
          /></label>
          <p v-if="error" role="alert" class="error">{{ error }}</p>
          <p>Nội dung được kiểm tra trùng trước khi công bố.</p>
          <div class="actions">
            <button type="button" :disabled="busy" @click="editing = false">
              Đóng</button
            ><button class="primary" :disabled="busy">
              {{ busy ? "Đang lưu và kiểm tra…" : "Đăng Báo bài" }}
            </button>
          </div>
        </form>
      </section>
    </div>
    <div v-if="deleteTarget" class="modal-backdrop">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-title"
        class="modal"
      >
        <h2 id="delete-title">Xóa “{{ deleteTarget.title }}”?</h2>
        <p>Bài được chuyển vào thùng rác và ngừng tính đóng góp.</p>
        <form @submit.prevent="confirmDelete">
          <label
            >Lý do<input v-model="deleteReason" required maxlength="1000"
          /></label>
          <p v-if="error" role="alert">{{ error }}</p>
          <div class="actions">
            <button type="button" :disabled="busy" @click="deleteTarget = null">
              Hủy</button
            ><button :disabled="busy || !deleteReason.trim()">Xóa bài</button>
          </div>
        </form>
      </section>
    </div>
  </section>
</template>
<style scoped>
.homework-page {
  display: grid;
  gap: 22px;
  color: var(--text, #20354b);
}
.homework-banner {
  position: relative;
  overflow: hidden;
  display: flex;
  align-items: center;
  gap: 18px;
  padding: 26px;
  border: 1px solid #ead9ad;
  border-radius: 25px;
  background: linear-gradient(115deg, var(--surface, #fff), #fff1cd);
}
.homework-banner > div,
.refresh {
  position: relative;
}
.homework-banner h1 {
  margin: 0;
  font-size: 1.85rem;
}
.homework-banner p {
  margin: 5px 0;
}
.eyebrow {
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.14em;
  color: #8a6425;
}
.refresh {
  margin-left: auto;
}
.tabs,
.actions,
.config-list {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.tabs {
  padding: 4px;
}
.tabs button[aria-current="page"],
.tabs button[aria-pressed="true"] {
  background: #254d58;
  color: white;
  border-color: #254d58;
}
.composer-launch {
  display: flex;
  gap: 16px;
  align-items: center;
  text-align: left;
  width: 100%;
  padding: 24px;
  border: 1px dashed #92b5b0;
  background: var(--surface, #fff);
  border-radius: 23px;
}
.composer-launch > span {
  font-size: 1.8rem;
}
.composer-launch small {
  display: block;
  margin-top: 5px;
  color: var(--text-secondary, #627888);
}
.composer-launch b {
  margin-left: auto;
  color: #236659;
}
.notice-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px;
}
.panel {
  padding: 24px;
  background: var(--surface, #fff);
  border: 1px solid var(--border, #dae4e9);
  border-radius: 22px;
}
.panel h2,
.panel h3 {
  margin-top: 0;
}
.queue-case {
  margin-bottom: 18px;
}
.comparison,
.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px;
}
.comparison > div {
  padding: 18px;
  background: var(--surface-alt, #f3f6f9);
  border-radius: 14px;
}
.preserve {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.section-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
.awards-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 18px;
}
.awards-grid h3 {
  font-size: 1.1rem;
}
.awards-grid ul,
.awards-grid ol {
  list-style: none;
  padding: 0;
}
.awards-grid li {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 0;
  border-bottom: 1px solid #cdd8df55;
}
.bird {
  border-top: 5px solid #ddb26c;
}
.star {
  border-top: 5px solid #b8a0d8;
}
.seed {
  border-top: 5px solid #81b69b;
}
.personal {
  padding: 16px;
  border-radius: 14px;
  background: #eaf4ee;
  color: #214f42;
}
.empty {
  padding: 24px;
  text-align: center;
  border: 1px dashed var(--border, #cbd8df);
  border-radius: 18px;
  color: var(--text-secondary, #607484);
}
button {
  font: inherit;
  border: 1px solid var(--border, #cfdee3);
  border-radius: 12px;
  background: var(--surface, #fff);
  color: inherit;
  padding: 10px 14px;
  cursor: pointer;
}
button:hover:not(:disabled) {
  border-color: #6a9d94;
}
button:disabled {
  opacity: 0.5;
  cursor: default;
}
label {
  display: grid;
  gap: 7px;
  margin: 12px 0;
  font-size: 0.9rem;
  font-weight: 600;
}
input,
select,
textarea {
  font: inherit;
  width: 100%;
  box-sizing: border-box;
  border: 1px solid var(--border, #c6d5df);
  border-radius: 10px;
  padding: 11px;
  background: var(--surface, #fff);
  color: inherit;
}
textarea {
  resize: vertical;
}
.check {
  display: flex;
  align-items: center;
}
.check input {
  width: auto;
}
.form-grid {
  margin-bottom: 20px;
  align-items: end;
}
.form-grid .actions {
  grid-column: 1/-1;
}
.error {
  background: #fff0ee;
  color: #912c25;
  padding: 15px;
  border-radius: 12px;
}
.success {
  background: #e7f4ed;
  color: #24604c;
  padding: 15px;
  border-radius: 12px;
}
.overdue summary {
  cursor: pointer;
  padding: 18px 0;
}
.modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: #142c3d77;
  display: grid;
  place-items: center;
  padding: 18px;
}
.modal {
  width: min(620px, 100%);
  max-height: 90dvh;
  overflow: auto;
  padding: 28px;
  border-radius: 24px;
  background: var(--surface, #fff);
  box-sizing: border-box;
}
.primary {
  background: #285d53;
  color: #fff;
}
.actions {
  justify-content: flex-end;
  margin-top: 16px;
}
.link-button {
  margin: 8px;
}
.metrics {
  display: flex;
  gap: 25px;
}
.metrics > div {
  display: grid;
  gap: 6px;
}
.metrics strong {
  font-size: 2.2rem;
}
.notifications {
  list-style: none;
  padding: 0;
}
.notifications li {
  padding: 15px 0;
  border-bottom: 1px solid var(--border, #dae4e9);
}
pre {
  max-height: 350px;
  overflow: auto;
  font-size: 0.75rem;
}
details {
  margin: 10px 0;
}
@media (max-width: 900px) {
  .awards-grid {
    grid-template-columns: 1fr;
  }
  .notice-grid {
    grid-template-columns: 1fr;
  }
}
@media (max-width: 600px) {
  .homework-banner {
    padding: 18px;
    gap: 12px;
    flex-wrap: wrap;
  }
  .homework-banner h1 {
    font-size: 1.5rem;
  }
  .homework-banner .refresh {
    margin-left: 0;
  }
  .comparison,
  .form-grid {
    grid-template-columns: 1fr;
  }
  .composer-launch {
    flex-wrap: wrap;
  }
  .composer-launch b {
    margin-left: 0;
  }
  .section-heading {
    display: block;
  }
  .modal {
    padding: 20px;
  }
  .panel {
    padding: 18px;
  }
}
</style>
