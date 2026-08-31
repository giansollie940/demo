<script setup lang="ts">
import { KeyRound, LockKeyhole, Pencil, RotateCcw, Trash2 } from 'lucide-vue-next'
import AppButton from '../ui/AppButton.vue'
import RemoteUserAvatar from '../profile/RemoteUserAvatar.vue'
import type { DirectoryUser } from '../../types/legacy'
withDefaults(defineProps<{user:DirectoryUser;classLabel:string;busy?:boolean}>(),{busy:false})
const emit=defineEmits<{edit:[];toggle:[];reset:[];hardDelete:[]}>()
</script>
<template>
  <article class="student-card" :class="{inactive:!user.active,busy}">
    <header><RemoteUserAvatar :user-id="user.id" :name="user.fullName" :code="user.code" size="md"/><div><h3>{{ user.fullName || 'Học sinh' }}</h3><small>{{ user.code }} · {{ user.role==='monitor'?'Cán sự':'Học sinh' }}</small></div><span class="state">{{ user.active?'Hoạt động':'Đã khóa' }}</span></header>
    <div class="class-chip">{{ busy?'Đang đồng bộ…':(classLabel || 'Chưa có lớp') }}</div>
    <footer>
      <AppButton variant="secondary" :disabled="busy" @click="emit('edit')"><Pencil/>Sửa</AppButton>
      <AppButton variant="secondary" :disabled="busy" @click="emit('reset')"><KeyRound/>Mật khẩu</AppButton>
      <AppButton :variant="user.active?'secondary':'success'" :loading="busy" @click="emit('toggle')"><LockKeyhole v-if="user.active"/><RotateCcw v-else/>{{ user.active?'Khóa':'Khôi phục' }}</AppButton>
      <AppButton variant="danger" :disabled="busy" @click="emit('hardDelete')"><Trash2/>Xóa vĩnh viễn</AppButton>
    </footer>
  </article>
</template>
<style scoped>
.student-card{display:grid;gap:12px;padding:15px;border:1px solid var(--border);border-radius:18px;background:color-mix(in srgb,var(--surface) 92%,transparent);box-shadow:0 8px 22px rgb(79 55 73 / .05);transition:transform var(--transition-fast),box-shadow var(--transition-fast),border-color var(--transition-fast),background var(--theme-transition)}.student-card:hover{transform:translateY(-2px);border-color:color-mix(in srgb,var(--color-coral) 22%,var(--border));box-shadow:0 14px 30px color-mix(in srgb,var(--color-coral) 9%,transparent)}.student-card.inactive{opacity:.72}.student-card.busy{border-color:color-mix(in srgb,var(--color-primary) 28%,var(--border));box-shadow:0 0 0 3px color-mix(in srgb,var(--color-primary) 8%,transparent)}.student-card header{display:grid;grid-template-columns:44px minmax(0,1fr) auto;gap:10px;align-items:center}.student-card h3{margin:0;font-size:1rem}.student-card small{color:var(--text-muted)}.state{font-size:var(--font-size-ui-min);font-weight:900;color:var(--color-success)}.class-chip{justify-self:start;padding:5px 9px;border-radius:999px;background:var(--surface-soft);color:var(--text-muted);font-size:var(--font-size-ui-min);font-weight:800}footer{display:flex;gap:7px;flex-wrap:wrap}footer :deep(.app-button){min-height:38px;padding:7px 9px;font-size:var(--font-size-ui-min)}footer :deep(svg){width:14px}@media(max-width:520px){.student-card header{grid-template-columns:44px minmax(0,1fr)}.state{grid-column:2}footer :deep(.app-button){width:100%}}
</style>
