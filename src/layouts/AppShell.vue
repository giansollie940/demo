<script setup lang="ts">
import { ref, watch } from 'vue'
import { ChevronsLeft, ChevronsRight, Sparkles } from 'lucide-vue-next'
import { useRouter } from 'vue-router'
import SidebarNav from '../components/layout/SidebarNav.vue'
import TopBar from '../components/layout/TopBar.vue'
import WiseOwl from '../components/owl/WiseOwl.vue'
import { useAuthStore } from '../stores/auth'
import { useContextStore } from '../stores/context'
import { usePreferencesStore } from '../stores/preferences'
import { useWeekLifecycle } from '../features/weeks/useWeekLifecycle'
const faviconUrl = `${import.meta.env.BASE_URL}assets/images/favicon.png`
const schoolPatternUrl = `${import.meta.env.BASE_URL}assets/images/school-pattern-bg.png`
const auth=useAuthStore();const context=useContextStore();const preferences=usePreferencesStore();const router=useRouter();const mobileOpen=ref(false)
watch(()=>auth.legacyState,state=>context.hydrate(state),{immediate:true});useWeekLifecycle()
async function logout(){await auth.logout();context.hydrate(null);await router.replace('/login')}
</script>
<template>
  <div class="shell" :class="{collapsed:preferences.sidebarCollapsed}">
    <aside class="sidebar" :class="{mobileOpen}">
      <div class="side-head"><img :src="faviconUrl" alt=""/><strong v-if="!preferences.sidebarCollapsed">SỔ TỰ HỌC</strong></div>
      <button class="sidebar-edge-toggle" type="button" :aria-label="preferences.sidebarCollapsed?'Mở rộng thanh điều hướng':'Thu gọn thanh điều hướng'" :title="preferences.sidebarCollapsed?'Mở rộng thanh điều hướng':'Thu gọn thanh điều hướng'" @click="preferences.toggleSidebar">
        <ChevronsRight v-if="preferences.sidebarCollapsed"/>
        <ChevronsLeft v-else/>
      </button>
      <SidebarNav :collapsed="preferences.sidebarCollapsed"/>
      <div class="side-footer"><div v-if="!preferences.sidebarCollapsed" class="encouragement"><Sparkles aria-hidden="true"/><span>Mỗi tiết tự học là một bước tiến nhỏ.</span></div></div>
    </aside>
    <div v-if="mobileOpen" class="backdrop" @click="mobileOpen=false"></div>
    <div class="main" :data-loading="auth.loading?'true':undefined" :style="{'--school-pattern-image':`url(${schoolPatternUrl})`}"><TopBar @menu="mobileOpen=true" @logout="logout"/><main class="content"><RouterView/></main><WiseOwl/></div>
  </div>
</template>
<style scoped>
.shell{min-height:100vh;display:grid;grid-template-columns:var(--sidebar-expanded) minmax(0,1fr);transition:grid-template-columns var(--transition-fast)}.shell.collapsed{grid-template-columns:var(--sidebar-collapsed) minmax(0,1fr)}.sidebar{position:sticky;top:0;height:100vh;display:grid;grid-template-rows:auto 1fr auto;background:linear-gradient(180deg,color-mix(in srgb,var(--sidebar) 94%,transparent),color-mix(in srgb,var(--wash-violet) 52%,var(--sidebar)));backdrop-filter:blur(14px);border-right:1px solid color-mix(in srgb,var(--color-primary) 10%,var(--border));z-index:40}.side-head{height:74px;display:flex;align-items:center;gap:10px;padding:10px 12px;border-bottom:1px solid var(--border);background:linear-gradient(110deg,var(--wash-violet),color-mix(in srgb,var(--wash-sky) 60%,var(--sidebar)))}.side-head img{width:40px;height:40px;filter:drop-shadow(0 5px 10px color-mix(in srgb,var(--color-primary) 16%,transparent));transition:transform var(--transition-fast),filter var(--transition-fast)}.side-head:hover img{transform:translateY(-1px) rotate(-2deg) scale(1.04);filter:drop-shadow(0 8px 14px color-mix(in srgb,var(--color-primary) 24%,transparent))}.side-head strong{white-space:nowrap;background:linear-gradient(100deg,var(--color-primary),var(--color-sky));-webkit-background-clip:text;background-clip:text;color:transparent;font-weight:900;letter-spacing:.03em}.sidebar-edge-toggle{position:absolute;z-index:5;top:22px;right:-15px;width:32px;height:32px;display:grid;place-items:center;border:1px solid color-mix(in srgb,var(--color-primary) 22%,var(--border));border-radius:999px;background:linear-gradient(145deg,var(--surface),color-mix(in srgb,var(--wash-violet) 72%,var(--surface)));color:var(--color-primary);box-shadow:0 6px 18px color-mix(in srgb,var(--color-primary) 14%,transparent);cursor:pointer;transition:transform var(--transition-fast),box-shadow var(--transition-fast),border-color var(--transition-fast),background var(--transition-fast)}.sidebar-edge-toggle svg{width:17px;height:17px;transition:transform var(--transition-fast)}.sidebar-edge-toggle:hover{transform:scale(1.08);border-color:color-mix(in srgb,var(--color-primary) 50%,var(--border));background:linear-gradient(145deg,var(--surface),color-mix(in srgb,var(--wash-sky) 72%,var(--surface)));box-shadow:0 9px 24px color-mix(in srgb,var(--color-primary) 22%,transparent)}.sidebar-edge-toggle:hover svg{transform:translateX(-2px)}.shell.collapsed .sidebar-edge-toggle:hover svg{transform:translateX(2px)}.sidebar-edge-toggle:active{transform:scale(.96)}.side-footer{display:grid;gap:4px;padding:8px}.encouragement{display:flex;align-items:flex-start;gap:8px;margin:0 2px;padding:10px;border-radius:13px;background:linear-gradient(135deg,var(--wash-mint),var(--wash-sun));border:1px solid color-mix(in srgb,var(--color-mint) 15%,var(--border));color:var(--text-muted);font-size:.74rem;font-weight:750;line-height:1.35}.encouragement svg{width:16px;flex:none;color:var(--color-sun)}.main{position:relative;min-width:0;min-height:100vh;background-color:var(--content-glass);background-image:linear-gradient(color-mix(in srgb,var(--bg) 78%,transparent),color-mix(in srgb,var(--bg) 82%,transparent)),var(--school-pattern-image);background-position:center,center top;background-size:auto,920px auto;background-repeat:no-repeat,repeat;background-attachment:scroll,scroll;background-blend-mode:normal,multiply}.content{padding:24px;max-width:1600px;margin:0 auto}.backdrop{display:none}@media(max-width:760px){.shell,.shell.collapsed{display:block}.sidebar{position:fixed;left:0;top:0;width:min(290px,86vw);transform:translateX(-105%);transition:transform var(--transition-fast);box-shadow:var(--shadow-md)}.sidebar.mobileOpen{transform:translateX(0)}.sidebar-edge-toggle{display:none}.backdrop{display:block;position:fixed;inset:0;background:var(--overlay);z-index:30}.content{padding:16px 12px}.main{background-size:auto,760px auto}}
</style>
