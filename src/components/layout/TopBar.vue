<script setup lang="ts">
import { computed } from 'vue'
import { Menu, Moon, Sun } from 'lucide-vue-next'
import IconButton from '../ui/IconButton.vue'
import { useAuthStore } from '../../stores/auth'
import { useContextStore } from '../../stores/context'
import { usePreferencesStore } from '../../stores/preferences'
import { getWeekLifecycle } from '../../features/weeks/week-lifecycle'
import { dirtyRegistry } from '../../features/shared/dirty-registry'
const emit=defineEmits<{menu:[]}>();const auth=useAuthStore();const context=useContextStore();const preferences=usePreferencesStore()
const state=computed(()=>auth.legacyState)
const operationalWeekId=computed(()=>state.value?getWeekLifecycle({weeks:state.value.weeks,periods:state.value.periods,getSlots:()=>state.value?.schedule??[]}).currentWeekId:null)
function confirmContextChange(){if(!dirtyRegistry.hasDirty())return true;if(!window.confirm('Thay đổi chưa được lưu sẽ bị bỏ. Tiếp tục?'))return false;dirtyRegistry.discardAll();return true}
async function changeClass(event:Event){const select=event.target as HTMLSelectElement;const id=select.value;if(!confirmContextChange()){select.value=context.selectedClassId??'';return}context.selectClass(id);await auth.reload(id);context.hydrate(auth.legacyState)}
function changeWeek(event:Event){const select=event.target as HTMLSelectElement;const id=select.value;if(!confirmContextChange()){select.value=context.selectedWeekId??'';return}context.selectWeek(id,{manual:id!==operationalWeekId.value})}
</script>
<template><header class="topbar"><div class="left"><IconButton label="Mở menu" class="mobile-menu" @click="emit('menu')"><Menu/></IconButton><div><b>{{ context.selectedClass?.name||context.selectedClass?.code||state?.settings.className||'Sổ Tự Học' }}</b><span>{{ state?.settings.schoolYear||'' }}</span></div></div><div class="context-controls"><label v-if="auth.currentUser?.role==='teacher'||auth.currentUser?.role==='admin'" class="compact"><span>Lớp</span><select :value="context.selectedClassId??''" @change="changeClass"><option v-for="item in context.classes" :key="item.id" :value="item.id">{{ item.code }}{{ item.name&&item.name!==item.code?` · ${item.name}`:'' }}</option></select></label><label class="compact"><span>Tuần</span><select :value="context.selectedWeekId??''" @change="changeWeek"><option v-for="item in context.weeks" :key="item.id" :value="item.id">Tuần {{ item.number }}</option></select></label><IconButton label="Đổi giao diện" @click="preferences.toggleTheme"><Sun v-if="preferences.resolvedTheme==='dark'"/><Moon v-else/></IconButton></div></header></template>
<style scoped>.topbar{position:sticky;top:0;z-index:20;min-height:68px;display:flex;align-items:center;justify-content:space-between;gap:14px;padding:10px 18px;border-bottom:1px solid var(--border);background:color-mix(in srgb,var(--surface) 90%,transparent);backdrop-filter:blur(14px)}.left{display:flex;gap:10px;align-items:center}.left div{display:grid}.left span{font-size:.78rem;color:var(--text-muted)}.context-controls{display:flex;align-items:center;gap:10px}.compact{display:flex;align-items:center;gap:7px;color:var(--text-muted);font-size:.78rem}.compact select{height:38px;border:1px solid var(--border);border-radius:10px;background:var(--input);color:var(--text);padding:0 9px}.mobile-menu{display:none}@media(max-width:760px){.mobile-menu{display:grid}.compact span{display:none}.compact select{max-width:130px}.left>div{display:none}.topbar{padding:8px 10px}}</style>
