<script setup lang="ts">
import { Edit3, LockKeyhole, RotateCcw, Trash2 } from 'lucide-vue-next'
import AppButton from '../ui/AppButton.vue'
import type { AdminClassRecord, AdminTeacherRecord } from '../../features/admin/admin-directory'
withDefaults(defineProps<{item:AdminClassRecord;teachers:AdminTeacherRecord[];busy?:boolean}>(),{busy:false})
const emit=defineEmits<{edit:[];toggle:[];delete:[]}>()
</script>
<template>
  <article class="class-card" :class="{inactive:!item.active,busy}">
    <header><div class="class-symbol">{{ item.code.slice(0,2) }}</div><div class="title"><h3>{{ item.code }} · {{ item.name }}</h3><span :class="{off:!item.active}">{{ item.active?'Đang hoạt động':'Đã khóa' }}</span></div></header>
    <div class="metrics"><span><small>HS/cán sự</small><b>{{ item.learnerCount }}</b></span><span><small>Hồ sơ</small><b>{{ item.profileCount }}</b></span><span><small>Đăng ký</small><b>{{ item.registrationCount }}</b></span><span><small>GV phụ trách</small><b>{{ teachers.length }}</b></span></div>
    <div class="teacher-chips"><span v-for="teacher in teachers" :key="teacher.id">{{ teacher.fullName || teacher.code }}</span><small v-if="!teachers.length">Chưa có giáo viên phụ trách.</small></div>
    <div v-if="!item.canDelete&&item.deleteBlockers.length" class="blockers"><b>Chưa thể xóa:</b><span v-for="(blocker,index) in item.deleteBlockers" :key="index">{{ blocker.message || blocker.code }}</span></div>
    <footer><AppButton variant="warning" :disabled="busy" @click="emit('edit')"><Edit3/>Sửa</AppButton><AppButton :variant="item.active?'secondary':'success'" :loading="busy" @click="emit('toggle')"><LockKeyhole v-if="item.active"/><RotateCcw v-else/>{{ item.active?'Khóa':'Kích hoạt' }}</AppButton><AppButton variant="danger" :disabled="busy||!item.canDelete" @click="emit('delete')"><Trash2/>Xóa</AppButton></footer>
  </article>
</template>
<style scoped>
.class-card{display:grid;gap:13px;border:1px solid var(--border);border-radius:17px;background:linear-gradient(145deg,var(--surface-raised),color-mix(in srgb,var(--wash-violet) 56%,var(--surface)));padding:16px}.class-card.inactive{opacity:.78}.class-card.busy{border-color:color-mix(in srgb,var(--color-primary) 28%,var(--border));box-shadow:0 0 0 3px color-mix(in srgb,var(--color-primary) 7%,transparent)}.class-card header{display:flex;gap:11px;align-items:center}.class-symbol{width:44px;height:44px;display:grid;place-items:center;border-radius:13px;background:var(--wash-sky);color:var(--color-info);font-weight:900}.title h3{margin:0;font-size:1rem}.title span{display:inline-flex;margin-top:4px;color:var(--color-success);font-size:var(--font-size-ui-min);font-weight:900}.title span.off{color:var(--text-muted)}.metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:7px}.metrics span{display:grid;padding:8px;border-radius:10px;background:var(--surface-soft);text-align:center}.metrics small{font-size:var(--font-size-ui-min);color:var(--text-muted)}.metrics b{font-size:1.1rem}.teacher-chips{display:flex;gap:6px;flex-wrap:wrap}.teacher-chips span{font-size:var(--font-size-ui-min);padding:5px 8px;border-radius:999px;background:var(--surface-soft);color:var(--text-muted)}.teacher-chips small{color:var(--text-muted)}.blockers{display:grid;gap:4px;border-radius:10px;padding:9px;background:color-mix(in srgb,var(--color-warning) 8%,var(--surface));color:var(--color-warning);font-size:var(--font-size-ui-min)}.class-card footer{display:flex;gap:6px;flex-wrap:wrap}.class-card footer :deep(.app-button){min-height:39px;padding:7px 10px;font-size:var(--font-size-ui-min)}.class-card footer :deep(svg){width:14px}@media(max-width:620px){.metrics{grid-template-columns:repeat(2,1fr)}.class-card footer :deep(.app-button){flex:1 1 calc(50% - 6px)}}
</style>
