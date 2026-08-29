<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  name: string
  roleLabel: string
  collapsed: boolean
}>()

const initials = computed(() => props.name
  .split(/\s+/)
  .filter(Boolean)
  .slice(-2)
  .map(part => part[0]?.toUpperCase() ?? '')
  .join('') || 'ST')
</script>

<template>
  <div class="sidebar-profile" :class="{ collapsed }" :aria-label="`${name} · ${roleLabel}`">
    <span class="profile-avatar" aria-hidden="true">{{ initials }}</span>
    <span v-if="!collapsed" class="profile-copy">
      <strong>{{ name }}</strong>
      <small><i></i>{{ roleLabel }}</small>
    </span>
  </div>
</template>

<style scoped>
.sidebar-profile {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  padding: 10px;
  border: 1px solid color-mix(in srgb, var(--color-sky) 14%, var(--border));
  border-radius: 16px;
  background: linear-gradient(145deg, color-mix(in srgb, var(--surface) 96%, transparent), color-mix(in srgb, var(--wash-sky) 42%, var(--surface)));
}
.profile-avatar {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  flex: 0 0 40px;
  border-radius: 50%;
  background: linear-gradient(145deg, var(--wash-sky), var(--wash-violet));
  color: var(--color-primary);
  font-size: .78rem;
  font-weight: 900;
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--color-primary) 12%, var(--border));
}
.profile-copy { min-width: 0; display: grid; gap: 2px; }
.profile-copy strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: .79rem; color: var(--text); }
.profile-copy small { display: flex; align-items: center; gap: 5px; color: var(--text-muted); font-size: .68rem; }
.profile-copy i { width: 7px; height: 7px; border-radius: 50%; background: var(--color-success); box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-success) 12%, transparent); }
.sidebar-profile.collapsed { justify-content: center; padding: 7px 5px; border-color: transparent; background: transparent; }
.sidebar-profile.collapsed .profile-avatar { width: 38px; height: 38px; flex-basis: 38px; }
</style>
