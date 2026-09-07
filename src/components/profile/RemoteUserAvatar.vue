<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import UserAvatar from './UserAvatar.vue'
import { useAuthStore } from '../../stores/auth'
import { legacyApi } from '../../services/legacy-supabase'
const props=withDefaults(defineProps<{userId:string;name?:string;code?:string;size?:'sm'|'md'|'lg'}>(),{name:'',code:'',size:'md'})
const auth=useAuthStore()
const src=ref<string|null>(null)
const mounted=ref(false)
onMounted(()=>{mounted.value=true})
const path=computed(()=>{
  if(auth.currentUser?.id===props.userId)return auth.currentUser.avatarPath??null
  return auth.legacyState?.users.find(user=>user.id===props.userId)?.avatarPath??null
})
watch([path,mounted],async([value,ready],_,onCleanup)=>{
  let cancelled=false
  let objectUrl:string|null=null
  src.value=null
  onCleanup(()=>{cancelled=true;if(objectUrl)URL.revokeObjectURL(objectUrl)})
  if(!ready||!value)return
  try{
    const blob=await legacyApi.downloadAvatar(String(value))
    if(cancelled||!blob)return
    objectUrl=URL.createObjectURL(blob);src.value=objectUrl
  }catch{if(!cancelled)src.value=null}
},{immediate:true})
</script>
<template><UserAvatar :src="src" :name="name" :code="code" :size="size"/></template>
