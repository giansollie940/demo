<script setup lang="ts">
import { reactive, watch } from 'vue'
import { Building2, X } from 'lucide-vue-next'
import AppButton from '../ui/AppButton.vue'
import type { AdminClassRecord } from '../../features/admin/admin-directory'
const props=defineProps<{open:boolean;item:AdminClassRecord|null;saving?:boolean;error?:string}>()
const emit=defineEmits<{close:[];save:[payload:{code:string;name:string}]}>()
const form=reactive({code:'',name:''})
watch(()=>[props.open,props.item] as const,()=>{form.code=props.item?.code??'';form.name=props.item?.name??''},{immediate:true})
function submit(){const code=form.code.trim().toUpperCase(),name=form.name.trim();if(!code||!name)return;emit('save',{code,name})}
</script>
<template><Teleport to="body"><div v-if="open" class="dialog-backdrop" @click.self="emit('close')"><form class="dialog" @submit.prevent="submit"><header><div><Building2/><span><b>Chỉnh sửa lớp</b><small>{{ item?.code }}</small></span></div><button type="button" aria-label="Đóng" @click="emit('close')"><X/></button></header><label>Mã lớp<input v-model="form.code" required maxlength="40"></label><label>Tên lớp<input v-model="form.name" required maxlength="120"></label><p v-if="error" class="error">{{ error }}</p><footer><AppButton type="button" variant="secondary" :disabled="saving" @click="emit('close')">Hủy</AppButton><AppButton type="submit" :loading="saving">Lưu thay đổi</AppButton></footer></form></div></Teleport></template>
<style scoped>.dialog-backdrop{position:fixed;inset:0;z-index:130;display:grid;place-items:center;padding:18px;background:rgb(36 25 35/.45);backdrop-filter:blur(8px)}.dialog{width:min(480px,100%);display:grid;gap:14px;padding:20px;border:1px solid var(--border);border-radius:22px;background:var(--surface);box-shadow:0 30px 80px rgb(30 20 30/.28)}header,header>div,footer{display:flex;align-items:center;gap:10px}header{justify-content:space-between}header>div>svg{width:25px;color:var(--color-primary)}header span{display:grid}header small{color:var(--text-muted)}header button{border:0;background:transparent;color:var(--text-muted)}header button svg{width:20px}label{display:grid;gap:6px;font-size:var(--font-size-ui-min);font-weight:800;color:var(--text-muted)}input{min-height:44px;border:1px solid var(--border);border-radius:11px;padding:8px 10px;background:var(--input);color:var(--text)}footer{justify-content:flex-end}.error{margin:0;color:var(--color-danger);font-weight:750}</style>
