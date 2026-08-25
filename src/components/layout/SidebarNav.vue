<script setup lang="ts">
import { computed, type Component } from 'vue'
import { useRoute } from 'vue-router'
import { CalendarClock, CalendarRange, ChartNoAxesCombined, ClipboardCheck, GraduationCap, History, LayoutDashboard, MessagesSquare, NotebookPen, Settings, ShieldCheck, UsersRound } from 'lucide-vue-next'
import { useAuthStore } from '../../stores/auth'
import { visibleNavigation } from '../../features/navigation/navigation'
const props=defineProps<{collapsed:boolean}>();const route=useRoute();const auth=useAuthStore()
const icons:Record<string,Component>={LayoutDashboard,NotebookPen,ClipboardCheck,UsersRound,CalendarRange,CalendarClock,GraduationCap,ChartNoAxesCombined,History,MessagesSquare,ShieldCheck,Settings}
const items=computed(()=>visibleNavigation(auth.currentUser?.role))
</script>
<template><nav class="side-nav" aria-label="Điều hướng chính"><RouterLink v-for="item in items" :key="item.to" :to="item.to" class="nav-item" :class="{active:route.path===item.to}" :title="collapsed?item.label:undefined"><component :is="icons[item.icon]"/><span v-if="!collapsed">{{ item.label }}</span></RouterLink></nav></template>
<style scoped>.side-nav{display:grid;gap:6px;padding:8px}.nav-item{min-height:44px;display:flex;align-items:center;gap:12px;padding:9px 12px;border-radius:13px;color:var(--text-muted);font-weight:700;transition:background var(--transition-fast),color var(--transition-fast),transform var(--transition-fast)}.nav-item:hover{background:var(--surface-soft);color:var(--color-primary);transform:translateX(2px)}.nav-item.active{background:color-mix(in srgb,var(--color-primary) 14%,var(--surface));color:var(--color-primary);box-shadow:inset 3px 0 0 var(--color-primary)}.nav-item :deep(svg){width:20px;height:20px;flex:0 0 20px;stroke:currentColor}.nav-item.active :deep(svg){transform:scale(1.06)}</style>
