<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import EmptyState from '../components/ui/EmptyState.vue'
import PageHeader from '../components/ui/PageHeader.vue'
import { assetUrl } from '../composables/useAssetUrl'

const route = useRoute()

const pageTitle = computed(() =>
  typeof route.meta.title === 'string' ? route.meta.title : 'Trang chức năng',
)
</script>

<template>
  <main class="placeholder-page" :aria-label="pageTitle">
    <PageHeader
      eyebrow="Lộ trình chuyển đổi"
      :title="pageTitle"
      description="Khu vực này đã có vị trí trong cấu trúc ứng dụng mới."
    />

    <EmptyState
      title="Dành cho checkpoint tiếp theo"
      description="Route này được giữ chỗ cho một checkpoint sau; chức năng và dữ liệu thật chưa được nối trong CP1."
      :image="assetUrl('assets/images/empty-state.png')"
    />
  </main>
</template>

<style scoped>
.placeholder-page {
  display: grid;
  min-width: 0;
  max-width: 960px;
  margin: 0 auto;
  padding: var(--space-4);
}

@media (min-width: 640px) {
  .placeholder-page {
    padding: var(--space-8);
  }
}
</style>
