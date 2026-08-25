<script setup lang="ts">
import { ref, watch } from 'vue'
import { LogOut, PanelLeftClose, PanelLeftOpen } from 'lucide-vue-next'
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
const auth=useAuthStore();const context=useContextStore();const preferences=usePreferencesStore();const router=useRouter();const mobileOpen=ref(false)
watch(()=>auth.legacyState,state=>context.hydrate(state),{immediate:true});useWeekLifecycle()
async function logout(){await auth.logout();context.hydrate(null);await router.replace('/login')}
</script>
<template><div class="shell" :class="{collapsed:preferences.sidebarCollapsed}"><aside class="sidebar" :class="{mobileOpen}"><div class="side-head"><img :src="faviconUrl" alt=""/><strong v-if="!preferences.sidebarCollapsed">SỔ TỰ HỌC</strong><IconButton :label="preferences.sidebarCollapsed?'Mở rộng menu':'Thu gọn menu'" class="collapse" @click="preferences.toggleSidebar"><PanelLeftOpen v-if="preferences.sidebarCollapsed"/><PanelLeftClose v-else/></IconButton></div><SidebarNav :collapsed="preferences.sidebarCollapsed"/><button class="logout" type="button" @click="logout"><LogOut/><span v-if="!preferences.sidebarCollapsed">Đăng xuất</span></button></aside><div v-if="mobileOpen" class="backdrop" @click="mobileOpen=false"></div><div class="main"><TopBar @menu="mobileOpen=true"/><main class="content"><RouterView/></main><WiseOwl/></div></div></template>
<style scoped>.shell{min-height:100vh;display:grid;grid-template-columns:var(--sidebar-expanded) minmax(0,1fr);transition:grid-template-columns var(--transition-fast)}.shell.collapsed{grid-template-columns:var(--sidebar-collapsed) minmax(0,1fr)}.sidebar{position:sticky;top:0;height:100vh;display:grid;grid-template-rows:auto 1fr auto;background:var(--sidebar);border-right:1px solid var(--border);z-index:40}.side-head{height:68px;display:flex;align-items:center;gap:10px;padding:10px 12px;border-bottom:1px solid var(--border)}.side-head img{width:38px;height:38px}.side-head strong{white-space:nowrap}.collapse{margin-left:auto}.logout{margin:10px;min-height:44px;display:flex;align-items:center;justify-content:flex-start;gap:12px;padding:10px 13px;border:0;border-radius:12px;background:transparent;color:var(--text-muted);font-weight:700}.logout:hover{background:color-mix(in srgb,var(--color-danger) 10%,transparent);color:var(--color-danger)}.logout svg{width:20px}.main{min-width:0}.content{padding:24px;max-width:1600px;margin:0 auto}.backdrop{display:none}@media(max-width:760px){.shell,.shell.collapsed{display:block}.sidebar{position:fixed;left:0;top:0;width:min(290px,86vw);transform:translateX(-105%);transition:transform var(--transition-fast);box-shadow:var(--shadow-md)}.sidebar.mobileOpen{transform:translateX(0)}.sidebar .collapse{display:none}.backdrop{display:block;position:fixed;inset:0;background:var(--overlay);z-index:30}.content{padding:16px 12px}}</style>
