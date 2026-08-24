<script setup lang="ts">
import { Menu, PanelLeftClose, PanelLeftOpen } from 'lucide-vue-next'
import IconButton from '../ui/IconButton.vue'

withDefaults(defineProps<{
  title: string
  sidebarCollapsed?: boolean
  mobileDrawerOpen?: boolean
}>(), {
  sidebarCollapsed: false,
  mobileDrawerOpen: false,
})

const emit = defineEmits<{
  toggleSidebar: []
  toggleMobileMenu: [event: MouseEvent]
}>()
</script>

<template>
  <header class="app-topbar">
    <div class="app-topbar__primary">
      <IconButton
        class="app-topbar__mobile-toggle"
        :label="mobileDrawerOpen ? 'Đóng điều hướng' : 'Mở điều hướng'"
        aria-controls="app-mobile-navigation"
        :aria-expanded="mobileDrawerOpen"
        @click="emit('toggleMobileMenu', $event)"
      >
        <Menu :size="21" aria-hidden="true" />
      </IconButton>

      <IconButton
        class="app-topbar__desktop-toggle"
        :label="sidebarCollapsed ? 'Mở rộng thanh bên' : 'Thu gọn thanh bên'"
        data-desktop-sidebar-toggle
        @click="emit('toggleSidebar')"
      >
        <PanelLeftOpen v-if="sidebarCollapsed" :size="21" aria-hidden="true" />
        <PanelLeftClose v-else :size="21" aria-hidden="true" />
      </IconButton>

      <p class="app-topbar__title" data-current-route-title>{{ title }}</p>
    </div>

    <div class="app-topbar__contexts" aria-label="Ngữ cảnh học tập bản demo">
      <label class="app-topbar__context" data-context-selector>
        <span>Lớp</span>
        <select disabled aria-disabled="true" title="Sẽ khả dụng ở checkpoint sau">
          <option>Demo</option>
        </select>
      </label>

      <label class="app-topbar__context" data-context-selector>
        <span>Tuần</span>
        <select disabled aria-disabled="true" title="Sẽ khả dụng ở checkpoint sau">
          <option>Demo</option>
        </select>
      </label>
    </div>
  </header>
</template>

<style scoped>
.app-topbar {
  position: sticky;
  z-index: 20;
  inset-block-start: 0;
  display: flex;
  min-width: 0;
  min-height: 68px;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-3);
  padding-block: var(--space-3);
  padding-inline: var(--space-4);
  color: var(--text);
  background: var(--surface);
  border-block-end: 1px solid var(--border);
}

.app-topbar__primary {
  display: flex;
  min-width: 0;
  flex: 1 1 100%;
  align-items: center;
  gap: var(--space-3);
}

.app-topbar__title {
  min-width: 0;
  color: var(--text-strong);
  font-size: clamp(1.125rem, 4vw, 1.375rem);
  font-style: normal;
  line-height: 1.2;
  overflow-wrap: anywhere;
}

.app-topbar__contexts {
  display: grid;
  width: 100%;
  min-width: 0;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-2);
}

.app-topbar__context {
  display: grid;
  min-width: 0;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: var(--space-2);
  color: var(--text);
  font-size: 0.8125rem;
  font-weight: 650;
  white-space: nowrap;
}

.app-topbar__context select {
  width: 100%;
  min-width: 0;
  min-height: 44px;
  padding-block: var(--space-2);
  padding-inline: var(--space-3);
  color: var(--text-muted);
  background: var(--surface-subtle);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  cursor: not-allowed;
  opacity: 0.6;
}

.app-topbar__desktop-toggle {
  display: none;
}

.app-topbar__mobile-toggle,
.app-topbar__desktop-toggle {
  width: 44px;
  height: 44px;
  flex: 0 0 44px;
}

.app-topbar__mobile-toggle:focus,
.app-topbar__mobile-toggle:focus-visible,
.app-topbar__mobile-toggle.is-focus-visible,
.app-topbar__desktop-toggle:focus,
.app-topbar__desktop-toggle:focus-visible,
.app-topbar__desktop-toggle.is-focus-visible {
  outline-color: var(--color-primary-strong);
  outline-style: solid;
  outline-width: 3px;
  outline-offset: 2px;
}

@media (min-width: 40rem) {
  .app-topbar {
    flex-wrap: nowrap;
    padding-inline: var(--space-5);
  }

  .app-topbar__primary {
    flex-basis: auto;
  }

  .app-topbar__contexts {
    width: auto;
    grid-template-columns: repeat(2, minmax(128px, 1fr));
  }
}

@media (min-width: 60rem) {
  .app-topbar__mobile-toggle {
    display: none;
  }

  .app-topbar__desktop-toggle {
    display: inline-grid;
  }
}
</style>
