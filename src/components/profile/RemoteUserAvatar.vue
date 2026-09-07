<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import UserAvatar from './UserAvatar.vue'
import { legacyApi } from '../../services/legacy-supabase'

const props=withDefaults(defineProps<{
  userId:string
  name?:string
  code?:string
  size?:'sm'|'md'|'lg'
}>(),{name:'',code:'',size:'md'})

const src=ref<string|null>(null)
let objectUrl:string|null=null
let requestToken=0

function clear(){
  if(objectUrl)URL.revokeObjectURL(objectUrl)
  objectUrl=null
  src.value=null
}

async function load(){
  const token=++requestToken
  clear()
  if(!props.userId)return
  try{
    const client=await legacyApi.init() as {
      from:(table:string)=>{
        select:(columns:string)=>{
          eq:(column:string,value:string)=>{
            maybeSingle:()=>Promise<{data:{avatar_path?:string|null}|null;error:unknown|null}>
          }
        }
      }
    }
    const {data,error}=await client.from('profiles').select('avatar_path').eq('id',props.userId).maybeSingle()
    if(error||token!==requestToken)return
    const path=String(data?.avatar_path??'').trim()
    if(!path)return
    const blob=await legacyApi.downloadAvatar(path)
    if(!blob||token!==requestToken)return
    objectUrl=URL.createObjectURL(blob)
    src.value=objectUrl
  }catch{
    if(token===requestToken)clear()
  }
}

watch(()=>props.userId,load,{immediate:true})
onBeforeUnmount(()=>{requestToken++;clear()})
</script>

<template>
  <UserAvatar :src="src" :name="name" :code="code" :size="size"/>
</template>
