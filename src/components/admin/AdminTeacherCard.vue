<script setup lang="ts">
import { LockKeyhole, RotateCcw, Trash2 } from 'lucide-vue-next'
import AppButton from '../ui/AppButton.vue'
import type { AdminClassRecord, AdminTeacherRecord } from '../../features/admin/admin-directory'
defineProps<{teacher:AdminTeacherRecord;classes:AdminClassRecord[]}>()
const emit=defineEmits<{toggle:[];delete:[]}>()
</script>
<template>
  <article class="teacher-card" :class="{inactive:!teacher.active}"><header><span class="avatar">{{ (teacher.fullName||teacher.code).split(' ').slice(-2).map(x=>x[0]).join('').toUpperCase() }}</span><div><h3>{{ teacher.fullName || 'Giáo viên' }}</h3><small>{{ teacher.code }}</small></div><span class="state">{{ teacher.active?'Hoạt động':'Đã khóa' }}</span></header><div class="classes"><span v-for="item in classes" :key="item.id">{{ item.code }}</span><small v-if="!classes.length">Chưa được phân lớp</small></div><footer><AppButton :variant="teacher.active?'secondary':'success'" @click="emit('toggle')"><LockKeyhole v-if="teacher.active"/><RotateCcw v-else/>{{ teacher.active?'Khóa':'Mở khóa' }}</AppButton><AppButton v-if="teacher.active" variant="danger" @click="emit('delete')"><Trash2/>Xóa giáo viên</AppButton></footer></article>
</template>
<style scoped>
.teacher-card{display:grid;gap:12px;border:1px solid var(--border);border-radius:16px;background:linear-gradient(145deg,var(--surface-raised),color-mix(in srgb,var(--wash-mint) 48%,var(--surface)));padding:15px}.teacher-card.inactive{opacity:.75}.teacher-card header{display:grid;grid-template-columns:42px minmax(0,1fr) auto;gap:10px;align-items:center}.avatar{width:42px;height:42px;border-radius:13px;display:grid;place-items:center;background:var(--wash-pink);color:var(--color-pink);font-weight:900}.teacher-card h3{margin:0;font-size:1rem}.teacher-card small{color:var(--text-muted)}.state{font-size:.72rem;font-weight:900;color:var(--color-success)}.classes{display:flex;gap:6px;flex-wrap:wrap}.classes span{padding:4px 8px;border-radius:999px;background:var(--surface-soft);font-size:.72rem;color:var(--text-muted)}footer{display:flex;gap:7px;flex-wrap:wrap}footer :deep(.app-button){min-height:39px;padding:7px 10px;font-size:.76rem}footer :deep(svg){width:14px}@media(max-width:480px){.teacher-card header{grid-template-columns:42px minmax(0,1fr)}.state{grid-column:2}.teacher-card footer :deep(.app-button){width:100%}}
</style>
