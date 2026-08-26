<script setup lang="ts">
import { computed, ref } from 'vue'
import { onClickOutside } from '@vueuse/core'
import { ChevronDown, LogOut, Menu, Moon, Sun } from 'lucide-vue-next'
import IconButton from '../ui/IconButton.vue'
import { useAuthStore } from '../../stores/auth'
import { useContextStore } from '../../stores/context'
import { usePreferencesStore } from '../../stores/preferences'
import { getWeekLifecycle } from '../../features/weeks/week-lifecycle'
import { dirtyRegistry } from '../../features/shared/dirty-registry'
import type { UserRole } from '../../types/legacy'

const emit=defineEmits<{menu:[];logout:[]}>()
const auth=useAuthStore();const context=useContextStore();const preferences=usePreferencesStore()
const profileOpen=ref(false);const profileMenu=ref<HTMLElement|null>(null)
onClickOutside(profileMenu,()=>{profileOpen.value=false})
const state=computed(()=>auth.legacyState)
const operationalWeekId=computed(()=>state.value?getWeekLifecycle({weeks:state.value.weeks,periods:state.value.periods,getSlots:()=>state.value?.schedule??[]}).currentWeekId:null)
const roleLabels:Record<UserRole,string>={student:'Học sinh',monitor:'Cán sự lớp',teacher:'Giáo viên',admin:'Quản trị viên'}
const roleLabel=computed(()=>auth.currentUser?roleLabels[auth.currentUser.role]:'')
const initials=computed(()=>String(auth.currentUser?.name||auth.currentUser?.code||'?').trim().split(/\s+/).slice(-2).map(part=>part[0]||'').join('').toUpperCase()||'?')
function confirmContextChange(){if(!dirtyRegistry.hasDirty())return true;if(!window.confirm('Thay đổi chưa được lưu sẽ bị bỏ. Tiếp tục?'))return false;dirtyRegistry.discardAll();return true}
async function changeClass(event:Event){const select=event.target as HTMLSelectElement;const id=select.value;if(!confirmContextChange()){select.value=context.selectedClassId??'';return}context.selectClass(id);await auth.reload(id);context.hydrate(auth.legacyState)}
function changeWeek(event:Event){const select=event.target as HTMLSelectElement;const id=select.value;if(!confirmContextChange()){select.value=context.selectedWeekId??'';return}context.selectWeek(id,{manual:id!==operationalWeekId.value})}
function requestLogout(){profileOpen.value=false;emit('logout')}
</script>
<template>
  <header class="topbar">
    <div class="left"><IconButton label="Mở menu" class="mobile-menu" @click="emit('menu')"><Menu/></IconButton><div><b>{{ context.selectedClass?.name||context.selectedClass?.code||state?.settings.className||'Sổ Tự Học' }}</b><span>{{ state?.settings.schoolYear||'' }}</span></div></div>
    <div class="context-controls">
      <label v-if="auth.currentUser?.role==='teacher'||auth.currentUser?.role==='admin'" class="compact"><span>Lớp</span><select :value="context.selectedClassId??''" @change="changeClass"><option v-for="item in context.classes" :key="item.id" :value="item.id">{{ item.code }}{{ item.name&&item.name!==item.code?` · ${item.name}`:'' }}</option></select></label>
      <label class="compact"><span>Tuần</span><select :value="context.selectedWeekId??''" @change="changeWeek"><option v-for="item in context.weeks" :key="item.id" :value="item.id">Tuần {{ item.number }}</option></select></label>
      <IconButton label="Đổi giao diện" @click="preferences.toggleTheme"><Sun v-if="preferences.resolvedTheme==='dark'"/><Moon v-else/></IconButton>
      <div v-if="auth.currentUser" ref="profileMenu" class="profile-menu">
        <button class="profile-chip" type="button" :title="`${auth.currentUser.name} · ${roleLabel}`" :aria-expanded="profileOpen" aria-haspopup="menu" @click="profileOpen=!profileOpen">
          <span class="profile-avatar">{{ initials }}</span><span class="profile-copy"><b>{{ auth.currentUser.name }}</b><small>{{ roleLabel }}</small></span><ChevronDown class="profile-chevron" :class="{open:profileOpen}"/>
        </button>
        <div v-if="profileOpen" class="profile-dropdown" role="menu">
          <div class="profile-summary"><span class="profile-avatar large">{{ initials }}</span><div><b>{{ auth.currentUser.name }}</b><small>{{ roleLabel }} · {{ auth.currentUser.code }}</small></div></div>
          <div class="profile-class"><span>{{ context.selectedClass?.name||context.selectedClass?.code||state?.settings.className||'Lớp học' }}</span><small>{{ state?.settings.schoolYear||'' }}</small></div>
          <button type="button" class="profile-logout" role="menuitem" @click="requestLogout"><LogOut/>Đăng xuất</button>
        </div>
      </div>
    </div>
  </header>
</template>
<style scoped>
.topbar{position:sticky;top:0;z-index:20;min-height:74px;display:flex;align-items:center;justify-content:space-between;gap:14px;padding:11px 18px;border-bottom:1px solid color-mix(in srgb,var(--color-primary) 10%,var(--border));background:linear-gradient(90deg,color-mix(in srgb,var(--surface) 92%,transparent),color-mix(in srgb,var(--wash-sky) 74%,transparent));backdrop-filter:blur(16px);box-shadow:0 5px 20px rgb(54 44 104 / .05)}
.left{display:flex;gap:11px;align-items:center}.left div{display:grid;gap:1px}.left b{font-size:1.05rem;font-weight:850;line-height:1.2}.left span{font-size:.82rem;color:var(--text-muted);font-weight:650}.context-controls{display:flex;align-items:center;gap:10px}.compact{display:flex;align-items:center;gap:8px;color:var(--text-muted);font-size:.86rem;font-weight:800}.compact span{color:var(--color-primary)}.compact select{height:42px;min-width:108px;border:1px solid color-mix(in srgb,var(--color-primary) 16%,var(--border));border-radius:12px;background:linear-gradient(145deg,var(--input),var(--wash-violet));color:var(--text);padding:0 11px;font-size:.95rem;font-weight:800;box-shadow:0 3px 10px rgb(54 44 104 / .05);transition:border-color var(--transition-fast),box-shadow var(--transition-fast),transform var(--transition-fast)}.compact select:hover{border-color:color-mix(in srgb,var(--color-primary) 45%,var(--border));transform:translateY(-1px)}.compact select:focus{border-color:var(--color-primary);box-shadow:0 0 0 4px color-mix(in srgb,var(--color-primary) 12%,transparent)}
.profile-menu{position:relative}.profile-chip{display:flex;align-items:center;gap:9px;min-height:44px;padding:5px 9px 5px 6px;border:1px solid color-mix(in srgb,var(--color-primary) 14%,var(--border));border-radius:14px;background:linear-gradient(145deg,var(--surface),color-mix(in srgb,var(--wash-violet) 58%,var(--surface)));color:var(--text);box-shadow:0 4px 14px rgb(49 48 65 / .05);transition:transform var(--transition-fast),box-shadow var(--transition-fast),border-color var(--transition-fast),background var(--transition-fast);cursor:pointer}.profile-chip:hover{transform:translateY(-2px) scale(1.01);box-shadow:0 10px 26px color-mix(in srgb,var(--color-primary) 14%,transparent);border-color:color-mix(in srgb,var(--color-primary) 38%,var(--border));background:linear-gradient(145deg,var(--surface),color-mix(in srgb,var(--wash-sky) 66%,var(--surface)))}.profile-avatar{width:34px;height:34px;display:grid;place-items:center;border-radius:11px;background:linear-gradient(135deg,var(--wash-sky),var(--wash-violet));color:var(--color-primary);font-weight:900;transition:transform var(--transition-fast),box-shadow var(--transition-fast)}.profile-chip:hover .profile-avatar{transform:rotate(-2deg) scale(1.06);box-shadow:0 5px 12px color-mix(in srgb,var(--color-primary) 16%,transparent)}.profile-avatar.large{width:42px;height:42px;border-radius:13px}.profile-copy{display:grid;line-height:1.15;min-width:0;text-align:left}.profile-copy b{max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.84rem}.profile-copy small,.profile-summary small,.profile-class small{margin-top:3px;color:var(--text-muted);font-size:.7rem;font-weight:750}.profile-chevron{width:15px;height:15px;color:var(--text-muted);transition:transform var(--transition-fast)}.profile-chevron.open{transform:rotate(180deg)}.profile-dropdown{position:absolute;right:0;top:calc(100% + 8px);width:min(290px,calc(100vw - 24px));padding:10px;border:1px solid var(--border);border-radius:16px;background:var(--surface);box-shadow:var(--shadow-md);display:grid;gap:8px}.profile-summary{display:flex;align-items:center;gap:10px;padding:6px}.profile-summary>div,.profile-class{display:grid;min-width:0}.profile-summary b{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.profile-class{padding:9px 10px;border-radius:11px;background:linear-gradient(135deg,var(--wash-violet),var(--wash-sky));font-size:.8rem;font-weight:800}.profile-logout{display:flex;align-items:center;gap:9px;min-height:42px;padding:9px 11px;border:1px solid transparent;border-radius:11px;background:transparent;color:var(--color-danger);font-weight:850;cursor:pointer}.profile-logout:hover{background:var(--wash-coral);border-color:color-mix(in srgb,var(--color-danger) 14%,var(--border))}.profile-logout svg{width:18px}.mobile-menu{display:none}
@media(max-width:980px){.profile-copy{display:none}.profile-chip{padding:5px}.profile-chevron{display:none}}
@media(max-width:760px){.mobile-menu{display:grid}.compact span{display:none}.compact{font-size:.82rem}.compact select{max-width:118px;min-width:88px;height:40px;font-size:.86rem}.left>div{display:none}.topbar{min-height:64px;padding:8px 10px}.context-controls{gap:6px}}
@media(max-width:430px){.compact select{max-width:105px}.profile-dropdown{position:fixed;right:10px;top:66px}}
</style>
