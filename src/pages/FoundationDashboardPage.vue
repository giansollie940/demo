<script setup lang="ts">
import AppBadge from '../components/ui/AppBadge.vue'
import AppCard from '../components/ui/AppCard.vue'
import PageHeader from '../components/ui/PageHeader.vue'
import { assetUrl } from '../composables/useAssetUrl'

const kpis = [
  { value: '12', label: 'Phiên tự học', note: 'trong bản xem trước' },
  { value: '4', label: 'Bài đang theo dõi', note: 'trong bản xem trước' },
  { value: '68%', label: 'Tiến độ tuần', note: 'trong bản xem trước' },
  { value: '3', label: 'Mục cần xem', note: 'trong bản xem trước' },
]

const attentionItems = [
  { title: 'Kế hoạch chưa có lịch ôn', detail: '2 mục minh họa' },
  { title: 'Bài ghi chú cần xem lại', detail: '1 mục minh họa' },
  { title: 'Mục tiêu tuần chưa hoàn tất', detail: '1 mục minh họa' },
]

const weeklyProgress = [
  { day: 'Thứ 2', value: 36 },
  { day: 'Thứ 3', value: 62 },
  { day: 'Thứ 4', value: 48 },
  { day: 'Thứ 5', value: 76 },
  { day: 'Thứ 6', value: 58 },
  { day: 'Thứ 7', value: 42 },
  { day: 'CN', value: 24 },
]
</script>

<template>
  <main class="dashboard" aria-label="Bảng điều khiển tổng quan">
    <section class="dashboard-hero" data-section="hero">
      <img
        class="dashboard-hero__pattern"
        :src="assetUrl('assets/images/school-pattern-bg.png')"
        alt=""
        width="1600"
        height="1000"
        aria-hidden="true"
        decoding="async"
      />

      <div class="dashboard-hero__copy">
        <PageHeader
          eyebrow="Không gian giáo viên"
          title="Tổng quan tuần này"
          description="Xem nhanh những khu vực chính của bảng điều khiển trước khi dữ liệu thật được nối ở các checkpoint tiếp theo."
        >
          <AppBadge tone="primary">Dữ liệu minh họa</AppBadge>
        </PageHeader>
        <p class="dashboard-hero__note">
          Bản xem trước CP1 tập trung vào cấu trúc, thứ bậc thông tin và trạng thái giao diện.
        </p>
      </div>

      <figure class="dashboard-hero__visual">
        <img
          :src="assetUrl('assets/images/teacher-dashboard-illustration.png')"
          alt="Minh họa giáo viên đang xem kế hoạch học tập"
          width="720"
          height="405"
          fetchpriority="high"
          decoding="async"
        />
      </figure>
    </section>

    <section class="dashboard-section" data-section="kpis" aria-labelledby="kpi-heading">
      <div class="section-heading">
        <div>
          <h2 id="kpi-heading">Chỉ số tuần</h2>
          <p>Các số liệu dưới đây chỉ dùng để kiểm tra cách trình bày.</p>
        </div>
        <AppBadge tone="neutral">Dữ liệu minh họa</AppBadge>
      </div>

      <div class="kpi-grid">
        <AppCard v-for="kpi in kpis" :key="kpi.label" padding="md" class="kpi-card">
          <p class="kpi-card__value">{{ kpi.value }}</p>
          <h3>{{ kpi.label }}</h3>
          <p>{{ kpi.note }}</p>
        </AppCard>
      </div>
    </section>

    <div class="dashboard-workbench">
      <AppCard padding="lg" class="attention-panel" data-section="attention">
        <div class="panel-heading">
          <div>
            <h2>Điểm cần chú ý</h2>
            <p>Danh sách ưu tiên để giáo viên định hướng bước tiếp theo.</p>
          </div>
          <AppBadge tone="warning">Dữ liệu minh họa</AppBadge>
        </div>

        <ul class="attention-list">
          <li v-for="item in attentionItems" :key="item.title">
            <span class="attention-list__marker" aria-hidden="true"></span>
            <span>
              <strong>{{ item.title }}</strong>
              <small>{{ item.detail }}</small>
            </span>
          </li>
        </ul>

        <p class="panel-note">Các mục này chỉ minh họa trạng thái giao diện ở CP1.</p>
      </AppCard>

      <AppCard padding="lg" class="activity-panel" data-section="activity">
        <div class="panel-heading">
          <div>
            <h2>Nhịp học trong tuần</h2>
            <p>Một cách đọc nhanh tiến độ theo ngày.</p>
          </div>
          <AppBadge tone="neutral">Dữ liệu minh họa</AppBadge>
        </div>

        <ol class="progress-list" aria-label="Tiến độ minh họa theo ngày">
          <li v-for="item in weeklyProgress" :key="item.day">
            <span class="progress-list__day">{{ item.day }}</span>
            <span class="progress-list__track" aria-hidden="true">
              <span class="progress-list__fill" :style="{ width: `${item.value}%` }"></span>
            </span>
            <span class="progress-list__value">{{ item.value }}%</span>
          </li>
        </ol>
      </AppCard>
    </div>

    <AppCard padding="lg" class="quote-panel" data-section="daily-quote">
      <div>
        <AppBadge tone="primary">Kết nối ở CP4</AppBadge>
        <h2>Danh ngôn mỗi ngày</h2>
      </div>
      <p>Danh ngôn sẽ được nối với quote-feed ở CP4</p>
    </AppCard>
  </main>
</template>

<style scoped>
/* Hallmark · macrostructure: Workbench · tone: soft utilitarian · anchor hue: purple
 * pre-emit critique: P5 H4 E4 S5 R5 V4
 */
.dashboard {
  display: grid;
  min-width: 0;
  max-width: 1180px;
  margin: 0 auto;
  padding: var(--space-4);
  gap: var(--space-8);
}

.dashboard-hero {
  position: relative;
  isolation: isolate;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  align-items: center;
  min-width: 0;
  overflow: hidden;
  padding: var(--space-6);
  padding-bottom: var(--space-8);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-card);
  box-shadow: var(--shadow-card);
}

.dashboard-hero__pattern {
  position: absolute;
  inset: 0;
  z-index: -1;
  width: 100%;
  height: 100%;
  object-fit: cover;
  opacity: 0.035;
  pointer-events: none;
}

.dashboard-hero__copy,
.dashboard-hero__visual,
.section-heading > *,
.panel-heading > * {
  min-width: 0;
}

.dashboard-hero__copy :deep(.page-header) {
  margin-bottom: var(--space-3);
}

.dashboard-hero__copy :deep(.page-header__title) {
  min-width: 0;
  overflow-wrap: anywhere;
}

.dashboard-hero__note {
  max-width: 58ch;
  margin: 0;
  color: var(--text-muted);
  font-size: 0.875rem;
}

.dashboard-hero__visual {
  align-self: end;
  margin: var(--space-5) 0 calc(var(--space-6) * -1);
}

.dashboard-hero__visual img {
  display: block;
  width: 100%;
  height: auto;
  aspect-ratio: 16 / 9;
  object-fit: contain;
}

.dashboard-section {
  display: grid;
  min-width: 0;
  gap: var(--space-4);
}

.section-heading,
.panel-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-4);
}

.section-heading h2,
.panel-heading h2,
.quote-panel h2,
.kpi-card h3 {
  margin: 0;
  color: var(--text-strong);
  font-style: normal;
  line-height: 1.25;
}

.section-heading h2,
.panel-heading h2,
.quote-panel h2 {
  font-size: 1.25rem;
}

.section-heading p,
.panel-heading p,
.kpi-card p,
.quote-panel p,
.panel-note {
  margin: 0;
}

.section-heading p,
.panel-heading p {
  max-width: 60ch;
  margin-top: var(--space-1);
  color: var(--text-muted);
  font-size: 0.875rem;
}

.kpi-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--space-3);
}

.kpi-card {
  min-width: 0;
}

.kpi-card__value {
  color: var(--color-primary);
  font-size: clamp(1.75rem, 8vw, 2.25rem);
  font-weight: 800;
  letter-spacing: -0.04em;
  line-height: 1;
}

.kpi-card h3 {
  margin-top: var(--space-3);
  font-size: 0.9375rem;
}

.kpi-card p:last-child {
  margin-top: var(--space-1);
  color: var(--text-muted);
  font-size: 0.8125rem;
}

.dashboard-workbench {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  align-items: stretch;
  min-width: 0;
  gap: var(--space-4);
}

.attention-panel,
.activity-panel {
  display: grid;
  align-content: start;
  min-width: 0;
  gap: var(--space-5);
}

.attention-list,
.progress-list {
  padding: 0;
  margin: 0;
  list-style: none;
}

.attention-list {
  display: grid;
  gap: var(--space-2);
}

.attention-list li {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: var(--space-3);
  align-items: start;
  padding-block: var(--space-2);
  border-bottom: 1px solid var(--border);
}

.attention-list li:last-child {
  border-bottom: 0;
}

.attention-list__marker {
  width: 10px;
  height: 10px;
  margin-top: var(--space-2);
  background: var(--color-warning);
  border-radius: 50%;
}

.attention-list strong,
.attention-list small {
  display: block;
}

.attention-list strong {
  color: var(--text-strong);
  font-size: 0.9375rem;
}

.attention-list small {
  margin-top: var(--space-1);
  color: var(--text-muted);
}

.panel-note {
  padding-top: var(--space-3);
  color: var(--text-muted);
  border-top: 1px solid var(--border);
  font-size: 0.8125rem;
}

.progress-list {
  display: grid;
  gap: var(--space-3);
}

.progress-list li {
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr) 40px;
  align-items: center;
  gap: var(--space-2);
}

.progress-list__day,
.progress-list__value {
  color: var(--text-muted);
  font-size: 0.8125rem;
}

.progress-list__value {
  text-align: right;
}

.progress-list__track {
  display: block;
  height: 8px;
  overflow: hidden;
  background: var(--color-primary-soft);
  border-radius: var(--radius-sm);
}

.progress-list__fill {
  display: block;
  height: 100%;
  background: var(--color-primary);
  border-radius: inherit;
}

.quote-panel {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: space-between;
  min-width: 0;
  gap: var(--space-5);
  border-top: 3px solid var(--color-primary);
}

.quote-panel h2 {
  margin-top: var(--space-3);
}

.quote-panel > p {
  max-width: 56ch;
  color: var(--text);
  font-weight: 600;
}

@media (min-width: 560px) {
  .dashboard {
    padding: var(--space-6);
  }

  .kpi-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .quote-panel {
    flex-direction: row;
    align-items: center;
  }
}

@media (min-width: 768px) {
  .dashboard {
    padding: var(--space-8);
  }

  .dashboard-hero {
    grid-template-columns: minmax(0, 1.1fr) minmax(0, 0.9fr);
    padding: var(--space-8);
    padding-bottom: calc(var(--space-8) + var(--space-3));
  }

  .dashboard-hero__visual {
    margin: var(--space-4) calc(var(--space-4) * -1) calc(var(--space-8) * -1) 0;
  }
}

@media (min-width: 900px) {
  .dashboard-workbench {
    grid-template-columns: minmax(0, 0.95fr) minmax(0, 1.05fr);
  }
}

@media (min-width: 960px) {
  .kpi-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}

@media (max-width: 559px) {
  .section-heading,
  .panel-heading {
    flex-direction: column;
  }
}
</style>
