import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'
import { legacyApi, isBackendConfigured } from '../services/legacy-supabase'
import type { CurrentUser, LegacyState } from '../types/legacy'

function messageOf(error:unknown){return error instanceof Error?error.message:'Không thể hoàn tất yêu cầu.'}

export const useAuthStore=defineStore('auth',()=>{
  const currentUser=ref<CurrentUser|null>(null)
  const legacyState=shallowRef<LegacyState|null>(null)
  const ready=ref(false)
  const loading=ref(false)
  const error=ref('')
  const isAuthenticated=computed(()=>Boolean(currentUser.value))
  const role=computed(()=>currentUser.value?.role??null)

  async function bootstrap(preferredClassId:string|null=null){
    if(loading.value)return
    loading.value=true;error.value=''
    try{
      if(!isBackendConfigured()){
        currentUser.value=null;legacyState.value=null;return
      }
      await legacyApi.init()
      const result=await legacyApi.loadState(preferredClassId)
      currentUser.value=result.currentUser
      legacyState.value=result.state
    }catch(err){
      currentUser.value=null;legacyState.value=null;error.value=messageOf(err)
    }finally{loading.value=false;ready.value=true}
  }

  async function login(code:string,password:string){
    loading.value=true;error.value=''
    try{
      await legacyApi.init()
      await legacyApi.signInCode(code,password)
      const result=await legacyApi.loadState()
      if(!result.currentUser||!result.state)throw new Error('Không tải được hồ sơ sau khi đăng nhập.')
      currentUser.value=result.currentUser
      legacyState.value=result.state
    }catch(err){
      error.value=messageOf(err)
      throw err
    }finally{loading.value=false;ready.value=true}
  }

  async function reload(preferredClassId:string|null=null){
    if(!currentUser.value)return
    loading.value=true;error.value=''
    try{
      const result=await legacyApi.loadState(preferredClassId)
      currentUser.value=result.currentUser
      legacyState.value=result.state
    }catch(err){error.value=messageOf(err);throw err}
    finally{loading.value=false}
  }

  async function logout(){
    loading.value=true
    try{await legacyApi.signOut()}
    finally{currentUser.value=null;legacyState.value=null;error.value='';loading.value=false;ready.value=true}
  }

  return{currentUser,legacyState,ready,loading,error,isAuthenticated,role,bootstrap,login,reload,logout}
})
