<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ChevronsLeft, ChevronsRight } from 'lucide-vue-next'
import { useRouter } from 'vue-router'
import SidebarNav from '../components/layout/SidebarNav.vue'
import SidebarProfileCard from '../components/layout/SidebarProfileCard.vue'
import TopBar from '../components/layout/TopBar.vue'
import WiseOwl from '../components/owl/WiseOwl.vue'
import schoolPatternUrl from '../assets/images/school-pattern-bg.png'
import { useAuthStore } from '../stores/auth'
import { useContextStore } from '../stores/context'
import { usePreferencesStore } from '../stores/preferences'
import { useWeekLifecycle } from '../features/weeks/useWeekLifecycle'

const faviconUrl = `${import.meta.env.BASE_URL}assets/images/favicon.png`
const auth = useAuthStore()
const context = useContextStore()
const preferences = usePreferencesStore()
const router = useRouter()
const mobileOpen = ref(false)

const roleLabel = computed(() => ({
  student: 'Học sinh',
  monitor: 'Lớp trưởng',
  teacher: 'Giáo viên',
  admin: 'Quản trị viên',
}[auth.currentUser?.role ?? 'student']))

watch(() => auth.legacyState, state => context.hydrate(state), { immediate: true })
useWeekLifecycle()

async function logout() {
  await auth.logout()
  context.hydrate(null)
  await router.replace('/login')
}
</script>

<template>
  <div class="shell" :class="{ collapsed: preferences.sidebarCollapsed }">
    <aside class="sidebar sidebar-r7" :class="{ mobileOpen }">
      <div class="side-head">
        <img :src="faviconUrl" alt="" />
        <strong v-if="!preferences.sidebarCollapsed">SỔ TỰ HỌC</strong>
      </div>

      <button
        class="sidebar-edge-toggle"
        type="button"
        :aria-label="preferences.sidebarCollapsed ? 'Mở rộng thanh điều hướng' : 'Thu gọn thanh điều hướng'"
        :title="preferences.sidebarCollapsed ? 'Mở rộng thanh điều hướng' : 'Thu gọn thanh điều hướng'"
        @click="preferences.toggleSidebar"
      >
        <ChevronsRight v-if="preferences.sidebarCollapsed" />
        <ChevronsLeft v-else />
      </button>

      <div class="nav-safe-zone">
        <SidebarNav :collapsed="preferences.sidebarCollapsed" />
      </div>

      <div class="side-footer">
        <SidebarProfileCard
          :name="auth.currentUser?.name ?? 'Người dùng'"
          :role-label="roleLabel"
          :collapsed="preferences.sidebarCollapsed"
        />
      </div>
    </aside>

    <div v-if="mobileOpen" class="backdrop" @click="mobileOpen = false"></div>

    <div
      class="main"
      :data-loading="auth.loading ? 'true' : undefined"
      :style="{ '--school-pattern-image': `url(${schoolPatternUrl})` }"
    >
      <TopBar @menu="mobileOpen = true" @logout="logout" />
      <main class="content"><RouterView /></main>
      <WiseOwl />
    </div>
  </div>
</template>

<style scoped>
.shell {
  min-height: 100vh;
  display: grid;
  grid-template-columns: calc(var(--sidebar-expanded) + 24px) minmax(0, 1fr);
  transition: grid-template-columns var(--transition-fast), background var(--theme-transition), color var(--theme-transition);
}
.shell.collapsed { grid-template-columns: calc(var(--sidebar-collapsed) + 24px) minmax(0, 1fr); }
.sidebar-r7 {
  position: sticky;
  top: 12px;
  width: var(--sidebar-expanded);
  height: calc(100vh - 24px);
  margin-left: 12px;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  overflow: visible;
  border: 1px solid color-mix(in srgb, var(--color-sky) 12%, var(--border));
  border-radius: 27px;
  background: color-mix(in srgb, var(--surface) 91%, transparent);
  backdrop-filter: blur(24px) saturate(1.12);
  box-shadow: 0 18px 44px rgb(47 64 88 / .075), inset 0 1px 0 rgb(255 255 255 / .55);
  z-index: 40;
  transition: width var(--transition-fast), transform var(--transition-fast), background var(--theme-transition), border-color var(--theme-transition);
}
.shell.collapsed .sidebar-r7 { width: var(--sidebar-collapsed); }
.side-head {
  position: relative;
  z-index: 30;
  min-height: 76px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border-radius: 26px 26px 18px 18px;
  background: linear-gradient(120deg, color-mix(in srgb, var(--wash-sky) 55%, transparent), color-mix(in srgb, var(--wash-peach) 45%, transparent));
}
.side-head img { width: 40px; height: 40px; flex: 0 0 40px; filter: drop-shadow(0 5px 10px color-mix(in srgb, var(--color-primary) 15%, transparent)); }
.side-head strong { overflow: hidden; white-space: nowrap; color: var(--text); font-size: .88rem; font-weight: 900; letter-spacing: .025em; }
.sidebar-edge-toggle {
  position: absolute;
  z-index: 65;
  top: 22px;
  right: -17px;
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  border: 1px solid color-mix(in srgb, var(--color-primary) 22%, var(--border));
  border-radius: 50%;
  background: var(--surface-raised);
  color: var(--color-primary);
  box-shadow: 0 7px 18px color-mix(in srgb, var(--color-primary) 15%, transparent);
  cursor: pointer;
  transition: transform var(--transition-fast), box-shadow var(--transition-fast);
}
.sidebar-edge-toggle:hover { transform: scale(1.08); box-shadow: 0 9px 24px color-mix(in srgb, var(--color-primary) 22%, transparent); }
.sidebar-edge-toggle svg { width: 17px; height: 17px; }
.nav-safe-zone { min-height: 0; padding: 20px 8px 4px; overflow-y: auto; overflow-x: visible; scrollbar-width: thin; }
.side-footer { padding: 8px; }
.main { position: relative; isolation: isolate; min-width: 0; min-height: 100vh; overflow: hidden; background: var(--bg); }
.main::before { content: ""; position: absolute; z-index: 0; inset: 0; background-image: var(--school-pattern-image); background-position: center top; background-size: 920px auto; background-repeat: repeat; opacity: var(--pattern-opacity); filter: var(--pattern-filter); pointer-events: none; }
.main::after { content: ""; position: absolute; z-index: 0; inset: 0; background: linear-gradient(var(--pattern-soft-overlay), var(--pattern-soft-overlay)), var(--pattern-dark-overlay); pointer-events: none; }
.content { position: relative; z-index: 10; padding: 20px 22px 28px; max-width: 1660px; margin: 0 auto; }
.backdrop { display: none; }
@media (max-width: 1100px) and (min-width: 901px) {
  .shell:not(.collapsed) { grid-template-columns: calc(210px + 24px) minmax(0, 1fr); }
  .shell:not(.collapsed) .sidebar-r7 { width: 210px; }
}
@media (max-width: 900px) {
  .shell, .shell.collapsed { display: block; }
  .sidebar-r7, .shell.collapsed .sidebar-r7 {
    position: fixed;
    left: 12px;
    top: 12px;
    width: min(290px, calc(88vw - 12px));
    height: calc(100vh - 24px);
    margin: 0;
    transform: translateX(calc(-100% - 28px));
  }
  .sidebar-r7.mobileOpen { transform: translateX(0); }
  .sidebar-edge-toggle { display: none; }
  .backdrop { display: block; position: fixed; inset: 0; background: var(--overlay); z-index: 30; }
  .content { padding: 16px 12px 24px; }
  .main::before { background-size: 760px auto; }
}
@media (prefers-reduced-motion: reduce) {
  .shell, .sidebar-r7, .sidebar-edge-toggle { transition: none !important; }
}
</style>
