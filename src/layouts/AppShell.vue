<script setup lang="ts">
import { ref, watch } from 'vue'
import { LogOut, PanelLeftClose, PanelLeftOpen, Sparkles } from 'lucide-vue-next'
import { useRouter } from 'vue-router'
import SidebarNav from '../components/layout/SidebarNav.vue'
import TopBar from '../components/layout/TopBar.vue'
import IconButton from '../components/ui/IconButton.vue'
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
      <div class="side-head"><img :src="faviconUrl" alt=""/><strong v-if="!preferences.sidebarCollapsed">SỔ TỰ HỌC</strong><IconButton :label="preferences.sidebarCollapsed?'Mở rộng menu':'Thu gọn menu'" class="collapse" @click="preferences.toggleSidebar"><PanelLeftOpen v-if="preferences.sidebarCollapsed"/><PanelLeftClose v-else/></IconButton></div>
      <SidebarNav :collapsed="preferences.sidebarCollapsed"/>
      <div class="side-footer">
        <div v-if="!preferences.sidebarCollapsed" class="encouragement"><Sparkles aria-hidden="true"/><span>Mỗi tiết tự học là một bước tiến nhỏ.</span></div>
        <button class="logout" type="button" @click="logout"><LogOut/><span v-if="!preferences.sidebarCollapsed">Đăng xuất</span></button>
      </div>
    </aside>
    <div v-if="mobileOpen" class="backdrop" @click="mobileOpen=false"></div>
    <div class="main" :data-loading="auth.loading?'true':undefined" :style="{'--school-pattern-image':`url(${schoolPatternUrl})`}"><TopBar @menu="mobileOpen=true"/><main class="content"><RouterView/></main><WiseOwl/></div>
  </div>
</template>
<style scoped>
.shell{min-height:100vh;display:grid;grid-template-columns:var(--sidebar-expanded) minmax(0,1fr);transition:grid-template-columns var(--transition-fast)}.shell.collapsed{grid-template-columns:var(--sidebar-collapsed) minmax(0,1fr)}.sidebar{position:sticky;top:0;height:100vh;display:grid;grid-template-rows:auto 1fr auto;background:linear-gradient(180deg,var(--sidebar),color-mix(in srgb,var(--wash-violet) 38%,var(--sidebar)));border-right:1px solid color-mix(in srgb,var(--color-primary) 10%,var(--border));z-index:40}.side-head{height:74px;display:flex;align-items:center;gap:10px;padding:10px 12px;border-bottom:1px solid var(--border);background:linear-gradient(110deg,var(--wash-violet),color-mix(in srgb,var(--wash-sky) 60%,var(--sidebar)))}.side-head img{width:40px;height:40px;filter:drop-shadow(0 5px 10px color-mix(in srgb,var(--color-primary) 16%,transparent))}.side-head strong{white-space:nowrap;background:linear-gradient(100deg,var(--color-primary),var(--color-sky));-webkit-background-clip:text;background-clip:text;color:transparent;font-weight:900;letter-spacing:.03em}.collapse{margin-left:auto}.side-footer{display:grid;gap:4px;padding:8px}.encouragement{display:flex;align-items:flex-start;gap:8px;margin:0 2px;padding:10px;border-radius:13px;background:linear-gradient(135deg,var(--wash-mint),var(--wash-sun));border:1px solid color-mix(in srgb,var(--color-mint) 15%,var(--border));color:var(--text-muted);font-size:.74rem;font-weight:750;line-height:1.35}.encouragement svg{width:16px;flex:none;color:var(--color-sun)}.logout{min-height:44px;display:flex;align-items:center;justify-content:flex-start;gap:12px;padding:10px 13px;border:1px solid transparent;border-radius:13px;background:transparent;color:var(--text-muted);font-weight:750}.logout:hover{background:var(--wash-coral);border-color:color-mix(in srgb,var(--color-danger) 14%,var(--border));color:var(--color-danger)}.logout svg{width:20px}.main{position:relative;isolation:isolate;min-width:0;min-height:100vh;background:linear-gradient(150deg,color-mix(in srgb,var(--wash-sky) 16%,var(--background)),var(--background) 42%,color-mix(in srgb,var(--wash-violet) 15%,var(--background)))}.main::before{content:"";position:fixed;inset:0;background-image:var(--school-pattern-image);background-position:center top;background-size:1000px auto;opacity:.035;pointer-events:none;z-index:-1}.content{padding:24px;max-width:1600px;margin:0 auto}.backdrop{display:none}@media(max-width:760px){.shell,.shell.collapsed{display:block}.sidebar{position:fixed;left:0;top:0;width:min(290px,86vw);transform:translateX(-105%);transition:transform var(--transition-fast);box-shadow:var(--shadow-md)}.sidebar.mobileOpen{transform:translateX(0)}.sidebar .collapse{display:none}.backdrop{display:block;position:fixed;inset:0;background:var(--overlay);z-index:30}.content{padding:16px 12px}.main::before{background-size:760px auto;opacity:.028}}
</style>
