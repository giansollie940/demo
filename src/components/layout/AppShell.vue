<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { X } from 'lucide-vue-next'
import { useUiStore } from '../../stores/ui.store'
import IconButton from '../ui/IconButton.vue'
import AppSidebar from './AppSidebar.vue'
import AppTopbar from './AppTopbar.vue'

const route = useRoute()
const uiStore = useUiStore()
const mobileDrawerOpen = ref(false)
const mobileDrawerDialog = ref<HTMLDialogElement>()
let mobileDrawerOpener: HTMLElement | null = null
let desktopBreakpoint: MediaQueryList | undefined

const currentRouteTitle = computed(() =>
  typeof route.meta.title === 'string' ? route.meta.title : 'Sổ Tự Học',
)

function openMobileDrawer(opener?: HTMLElement): void {
  mobileDrawerOpener = opener ?? null
  mobileDrawerOpen.value = true
  void nextTick(() => {
    const dialog = mobileDrawerDialog.value
    if (!dialog) return

    if (!dialog.open) dialog.showModal()
    dialog.querySelector<HTMLElement>('[data-mobile-drawer-close]')?.focus()
  })
}

function closeMobileDrawer(): void {
  const dialog = mobileDrawerDialog.value
  if (dialog?.open) {
    dialog.close()
    return
  }

  finishMobileDrawerClose()
}

function finishMobileDrawerClose(): void {
  mobileDrawerOpen.value = false
  const opener = mobileDrawerOpener
  mobileDrawerOpener = null
  void nextTick(() => {
    if (opener?.isConnected) opener.focus()
  })
}

function toggleMobileDrawer(event: MouseEvent): void {
  if (mobileDrawerOpen.value) {
    closeMobileDrawer()
    return
  }

  openMobileDrawer(event.currentTarget instanceof HTMLElement ? event.currentTarget : undefined)
}

function containMobileDrawerFocus(event: KeyboardEvent): void {
  const dialog = mobileDrawerDialog.value
  if (!dialog) return

  const focusable = Array.from(
    dialog.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])'),
  )
  const first = focusable[0]
  const last = focusable.at(-1)
  if (!first || !last) return

  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}

function closeMobileDrawerOnDesktop(event: MediaQueryListEvent): void {
  if (!event.matches) return

  mobileDrawerOpener = null
  closeMobileDrawer()
}

onMounted(() => {
  if (typeof window.matchMedia !== 'function') return

  desktopBreakpoint = window.matchMedia('(min-width: 60rem)')
  desktopBreakpoint.addEventListener('change', closeMobileDrawerOnDesktop)
})

onBeforeUnmount(() => {
  desktopBreakpoint?.removeEventListener('change', closeMobileDrawerOnDesktop)
  desktopBreakpoint = undefined
  const dialog = mobileDrawerDialog.value
  if (dialog?.open) dialog.close()
  mobileDrawerOpener = null
})
</script>

<template>
  <div
    class="app-shell"
    data-app-shell
    :class="{ 'app-shell--sidebar-collapsed': uiStore.sidebarCollapsed }"
    :data-sidebar-collapsed="String(uiStore.sidebarCollapsed)"
    :data-mobile-drawer-open="String(mobileDrawerOpen)"
  >
    <aside class="app-shell__desktop-sidebar" data-nav-surface="desktop" :inert="mobileDrawerOpen || undefined">
      <AppSidebar :collapsed="uiStore.sidebarCollapsed" @navigate="closeMobileDrawer" />
    </aside>

    <div class="app-shell__body" :inert="mobileDrawerOpen || undefined">
      <AppTopbar
        :title="currentRouteTitle"
        :sidebar-collapsed="uiStore.sidebarCollapsed"
        :mobile-drawer-open="mobileDrawerOpen"
        @toggle-sidebar="uiStore.toggleSidebar"
        @toggle-mobile-menu="toggleMobileDrawer"
      />

      <div class="app-shell__content">
        <RouterView />
      </div>
    </div>

    <dialog
      id="app-mobile-navigation"
      ref="mobileDrawerDialog"
      class="app-shell__mobile-dialog"
      aria-label="Điều hướng di động"
      @cancel.prevent="closeMobileDrawer"
      @close="finishMobileDrawerClose"
      @click.self="closeMobileDrawer"
      @keydown.esc.prevent.stop="closeMobileDrawer"
      @keydown.tab="containMobileDrawerFocus"
    >
      <aside class="app-shell__mobile-drawer">
        <div class="app-shell__drawer-actions">
          <IconButton
            class="app-shell__drawer-close"
            label="Đóng điều hướng"
            data-mobile-drawer-close
            @click="closeMobileDrawer"
          >
            <X :size="21" aria-hidden="true" />
          </IconButton>
        </div>
        <AppSidebar @navigate="closeMobileDrawer" />
      </aside>
    </dialog>
  </div>
</template>

<style scoped>
.app-shell {
  width: 100%;
  min-width: 0;
  min-height: 100dvh;
  overflow-x: clip;
  color: var(--text);
  background: var(--background);
}

.app-shell__desktop-sidebar {
  display: none;
}

.app-shell__body,
.app-shell__content {
  min-width: 0;
}

.app-shell__mobile-dialog {
  position: fixed;
  z-index: 30;
  inset: 0;
  width: 100%;
  max-width: none;
  height: 100%;
  max-height: none;
  margin: 0;
  padding: 0;
  color: var(--text);
  background: transparent;
  border: 0;
  border-radius: 0;
  overflow: hidden;
}

.app-shell__mobile-dialog::backdrop {
  background: var(--text-strong);
  opacity: 0.34;
}

.app-shell__mobile-drawer {
  position: absolute;
  z-index: 1;
  inset-block: 0;
  inset-inline-start: 0;
  width: min(17rem, calc(100% - 48px));
  min-width: 0;
  overflow-y: auto;
  color: var(--text);
  background: var(--surface);
  box-shadow: var(--shadow-card);
}

.app-shell__drawer-actions {
  display: flex;
  justify-content: flex-end;
  padding-block-start: var(--space-2);
  padding-inline: var(--space-3);
}

.app-shell__drawer-close:focus,
.app-shell__drawer-close:focus-visible,
.app-shell__drawer-close.is-focus-visible {
  outline-color: var(--color-primary-strong);
  outline-style: solid;
  outline-width: 3px;
  outline-offset: 2px;
}

@media (min-width: 60rem) {
  .app-shell {
    display: grid;
    grid-template-columns: 248px minmax(0, 1fr);
  }

  .app-shell--sidebar-collapsed {
    grid-template-columns: 76px minmax(0, 1fr);
  }

  .app-shell__desktop-sidebar {
    position: sticky;
    inset-block-start: 0;
    display: block;
    height: 100dvh;
    overflow-y: auto;
    background: var(--surface);
    border-inline-end: 1px solid var(--border);
  }

}
</style>
