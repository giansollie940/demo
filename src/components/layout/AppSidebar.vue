<script setup lang="ts">
import { BookOpenCheck } from 'lucide-vue-next'
import { useRoute } from 'vue-router'
import { appNavigation } from '../../navigation/app-navigation'
import type { AppNavigationItem } from '../../types/navigation'

withDefaults(defineProps<{
  collapsed?: boolean
}>(), {
  collapsed: false,
})

const emit = defineEmits<{
  navigate: []
}>()

const route = useRoute()

function isNavigationItemActive(item: AppNavigationItem): boolean {
  if (!item.activeRoot) return route.path === item.to

  return route.path === item.activeRoot || route.path.startsWith(`${item.activeRoot}/`)
}
</script>

<template>
  <div class="app-sidebar" :class="{ 'app-sidebar--collapsed': collapsed }">
    <RouterLink
      class="app-sidebar__brand"
      to="/dashboard"
      :aria-label="collapsed ? 'Sổ Tự Học' : undefined"
      :title="collapsed ? 'Sổ Tự Học' : undefined"
      @click="emit('navigate')"
    >
      <span class="app-sidebar__brand-mark" aria-hidden="true">
        <BookOpenCheck :size="22" :stroke-width="2" />
      </span>
      <span v-show="!collapsed" class="app-sidebar__brand-label">Sổ Tự Học</span>
    </RouterLink>

    <nav class="app-sidebar__nav" aria-label="Điều hướng chính">
      <RouterLink
        v-for="item in appNavigation"
        :key="item.key"
        :to="item.to"
        class="app-sidebar__link"
        :class="{ 'is-active': isNavigationItemActive(item) }"
        active-class=""
        exact-active-class=""
        :aria-current="isNavigationItemActive(item) ? 'page' : undefined"
        :aria-label="collapsed ? item.label : undefined"
        :title="collapsed ? item.label : undefined"
        data-nav-item
        @click="emit('navigate')"
      >
        <span class="app-sidebar__icon" data-nav-icon aria-hidden="true">
          <component :is="item.icon" :size="20" :stroke-width="2" />
        </span>
        <span v-show="!collapsed" class="app-sidebar__label">{{ item.label }}</span>
      </RouterLink>
    </nav>
  </div>
</template>

<style scoped>
/* Hallmark · component/layout scope · genre: modern-minimal · tone: soft utilitarian
 * existing purple/lavender token palette · pre-emit critique: P4 H4 E4 S5 R5 V3
 */
.app-sidebar {
  min-width: 0;
  min-height: 100%;
  padding-block: var(--space-4);
  padding-inline: var(--space-3);
  color: var(--text);
  background: var(--surface);
}

.app-sidebar__brand {
  display: flex;
  min-width: 0;
  min-height: 44px;
  align-items: center;
  gap: var(--space-3);
  padding-inline: var(--space-3);
  color: var(--text-strong);
  border-radius: var(--radius-sm);
  font-weight: 750;
  text-decoration: none;
  white-space: nowrap;
}

.app-sidebar__brand-mark,
.app-sidebar__icon {
  display: inline-grid;
  flex: 0 0 auto;
  place-items: center;
}

.app-sidebar__brand-mark {
  width: 28px;
  height: 28px;
  color: var(--color-primary);
}

.app-sidebar__brand-label,
.app-sidebar__label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.app-sidebar__nav {
  display: grid;
  gap: var(--space-1);
  margin-block-start: var(--space-5);
}

.app-sidebar__link {
  position: relative;
  display: flex;
  min-width: 0;
  min-height: 44px;
  align-items: center;
  gap: var(--space-3);
  padding-block: var(--space-2);
  padding-inline: var(--space-3);
  color: var(--text);
  border-radius: var(--radius-sm);
  font-size: 0.9375rem;
  font-weight: 600;
  line-height: 1.25;
  text-decoration: none;
  white-space: nowrap;
}

.app-sidebar__link::before {
  position: absolute;
  inset-block: var(--space-2);
  inset-inline-start: 0;
  width: var(--space-1);
  background: var(--color-primary);
  border-radius: var(--radius-sm);
  content: '';
  opacity: 0;
}

.app-sidebar__icon {
  width: 28px;
  height: 28px;
  color: var(--text-muted);
  transform: translateX(0);
  transition: transform var(--motion-fast) cubic-bezier(0.16, 1, 0.3, 1);
}

.app-sidebar__link.is-active {
  color: var(--color-primary-strong);
  background: var(--color-primary-soft);
}

.app-sidebar__link.is-active::before {
  opacity: 1;
}

.app-sidebar__link.is-active .app-sidebar__icon {
  color: var(--color-primary-strong);
  transform: translateX(var(--space-1));
}

.app-sidebar__link:focus,
.app-sidebar__link:focus-visible,
.app-sidebar__link.is-focus-visible,
.app-sidebar__brand:focus,
.app-sidebar__brand:focus-visible,
.app-sidebar__brand.is-focus-visible {
  color: var(--color-primary-strong);
  background: var(--color-primary-soft);
  outline-color: var(--color-primary-strong);
  outline-style: solid;
  outline-width: 3px;
  outline-offset: 2px;
}

.app-sidebar--collapsed .app-sidebar__brand,
.app-sidebar--collapsed .app-sidebar__link {
  justify-content: center;
  padding-inline: var(--space-2);
}

@media (hover: hover) and (pointer: fine) {
  .app-sidebar__link:hover,
  .app-sidebar__brand:hover {
    color: var(--color-primary-strong);
    background: var(--color-primary-soft);
  }
}

@media (prefers-reduced-motion: reduce) {
  .app-sidebar__icon {
    transition-duration: 0.01ms;
  }
}
</style>
