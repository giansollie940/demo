<script setup lang="ts">
import { computed, type Component } from 'vue'
import { useRoute } from 'vue-router'
import { Building2, CalendarClock, CalendarRange, ChartNoAxesCombined, ClipboardCheck, GraduationCap, History, LayoutDashboard, MessagesSquare, NotebookPen, Settings, ShieldCheck, TriangleAlert, UserCog, UsersRound } from 'lucide-vue-next'
import { useAuthStore } from '../../stores/auth'
import { visibleNavigationGroups } from '../../features/navigation/navigation'
const props=defineProps<{collapsed:boolean}>();const route=useRoute();const auth=useAuthStore()
const icons:Record<string,Component>={LayoutDashboard,NotebookPen,ClipboardCheck,UsersRound,CalendarRange,CalendarClock,GraduationCap,ChartNoAxesCombined,History,MessagesSquare,ShieldCheck,TriangleAlert,Settings,Building2,UserCog}
const groups=computed(()=>visibleNavigationGroups(auth.currentUser?.role))
</script>
<template>
  <nav class="side-nav" :class="{collapsed}" aria-label="Điều hướng chính">
    <section v-for="group in groups" :key="group.label" class="nav-group">
      <div v-if="!collapsed" class="nav-group-label">{{ group.label }}</div>
      <RouterLink v-for="item in group.items" :key="`${group.label}-${item.to}-${item.label}`" :to="item.to" class="nav-item" :class="{active:route.fullPath===item.to||(route.path===item.to&&!item.to.includes('?'))}" :aria-label="collapsed?item.label:undefined">
        <component :is="icons[item.icon]"/>
        <span v-if="!collapsed" class="nav-label">{{ item.label }}</span>
        <span v-if="collapsed" class="nav-tooltip" role="tooltip">{{ item.label }}</span>
      </RouterLink>
    </section>
  </nav>
</template>
<style scoped>
.side-nav{display:grid;align-content:start;gap:13px;padding:12px 9px 18px;overflow-y:auto;overflow-x:visible}.nav-group{display:grid;gap:5px}.nav-group-label{padding:0 11px 3px;color:color-mix(in srgb,var(--text-muted) 82%,var(--color-primary));font-size:.66rem;font-weight:900;letter-spacing:.13em}.nav-item{--nav-accent:var(--color-primary);position:relative;isolation:isolate;overflow:visible;min-height:48px;display:flex;align-items:center;gap:11px;padding:8px 12px;border:1px solid transparent;border-radius:14px;color:var(--text-muted);font-size:.92rem;font-weight:760;transition:background var(--transition-fast),color var(--transition-fast),transform var(--transition-fast),border-color var(--transition-fast),box-shadow var(--transition-fast)}.nav-item::before{content:"";position:absolute;z-index:-1;inset:0;border-radius:inherit;background:linear-gradient(110deg,transparent 18%,color-mix(in srgb,var(--nav-accent) 12%,transparent) 50%,transparent 82%);transform:translateX(-115%);transition:transform .38s var(--ease-out)}
.nav-group:nth-child(1) .nav-item:nth-child(2){--nav-accent:var(--color-sky)}.nav-group:nth-child(1) .nav-item:nth-child(3){--nav-accent:var(--color-coral)}.nav-group:nth-child(1) .nav-item:nth-child(4){--nav-accent:var(--color-mint)}.nav-group:nth-child(2) .nav-item{--nav-accent:var(--color-sun)}.nav-group:nth-child(3) .nav-item{--nav-accent:var(--color-lilac)}.nav-group:nth-child(4) .nav-item{--nav-accent:var(--color-info)}.nav-group:nth-child(5) .nav-item{--nav-accent:var(--color-pink)}
.nav-item:hover{background:color-mix(in srgb,var(--nav-accent) 10%,var(--surface));border-color:color-mix(in srgb,var(--nav-accent) 22%,var(--border));color:var(--nav-accent);transform:translateX(4px) scale(1.01);box-shadow:0 8px 20px color-mix(in srgb,var(--nav-accent) 10%,transparent)}.nav-item:hover::before{transform:translateX(115%)}.nav-item.active{background:linear-gradient(105deg,color-mix(in srgb,var(--nav-accent) 17%,var(--surface)),color-mix(in srgb,var(--nav-accent) 6%,var(--surface)));border-color:color-mix(in srgb,var(--nav-accent) 18%,var(--border));color:var(--nav-accent);box-shadow:inset 3px 0 0 var(--nav-accent),0 5px 14px color-mix(in srgb,var(--nav-accent) 10%,transparent)}.nav-item :deep(svg){width:19px;height:19px;flex:0 0 19px;stroke:currentColor;transition:transform var(--transition-fast),filter var(--transition-fast)}.nav-item:hover :deep(svg){transform:translateX(1px) scale(1.1);filter:drop-shadow(0 4px 7px color-mix(in srgb,var(--nav-accent) 26%,transparent))}.nav-item.active :deep(svg){transform:scale(1.06)}.nav-label{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.collapsed{padding-inline:8px;gap:9px}.collapsed .nav-group{gap:5px}.collapsed .nav-item{justify-content:center;padding:8px;min-height:48px;border-radius:14px}.collapsed .nav-item:hover{transform:translateY(-1px) scale(1.04)}.nav-tooltip{position:absolute;z-index:100;left:calc(100% + 11px);top:50%;padding:7px 10px;border:1px solid var(--border);border-radius:9px;background:var(--surface-raised);color:var(--text);font-size:.78rem;font-weight:800;white-space:nowrap;box-shadow:var(--shadow-sm);opacity:0;pointer-events:none;transform:translate(5px,-50%) scale(.97);transition:opacity var(--transition-fast),transform var(--transition-fast)}.collapsed .nav-item:hover .nav-tooltip,.collapsed .nav-item:focus-visible .nav-tooltip{opacity:1;transform:translate(0,-50%) scale(1)}
@media(prefers-reduced-motion:reduce){.nav-item,.nav-item::before,.nav-item :deep(svg),.nav-tooltip{transition:none!important}.nav-item:hover,.collapsed .nav-item:hover{transform:none}}
</style>
