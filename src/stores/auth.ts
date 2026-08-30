import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'
import { legacyApi, isBackendConfigured } from '../services/legacy-supabase'
import type { CurrentUser, LegacyState, RealtimeChange, RegistrationRecord, TeacherNotificationRecord } from '../types/legacy'

function messageOf(error:unknown){return error instanceof Error?error.message:'Không thể hoàn tất yêu cầu.'}

export const useAuthStore=defineStore('auth',()=>{
  const currentUser=ref<CurrentUser|null>(null)
  const legacyState=shallowRef<LegacyState|null>(null)
  const ready=ref(false)
  const loading=ref(false)
  const error=ref('')
  const isAuthenticated=computed(()=>Boolean(currentUser.value))
  const role=computed(()=>currentUser.value?.role??null)

  async function bootstrap(preferredClassId:string|null=null,preferredSchoolYearId:string|null=null){
    if(loading.value)return
    loading.value=true;error.value=''
    try{
      if(!isBackendConfigured()){
        currentUser.value=null;legacyState.value=null;return
      }
      await legacyApi.init()
      const result=await legacyApi.loadState(preferredClassId,preferredSchoolYearId)
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

  async function reload(preferredClassId:string|null=null,preferredSchoolYearId:string|null=null){
    if(!currentUser.value)return
    loading.value=true;error.value=''
    try{
      const result=await legacyApi.loadState(preferredClassId,preferredSchoolYearId)
      currentUser.value=result.currentUser
      legacyState.value=result.state
    }catch(err){error.value=messageOf(err);throw err}
    finally{loading.value=false}
  }


  function applyRealtimeChange(change:RealtimeChange){
    const source=legacyState.value
    if(!source)return
    const table=String(change.table??'')
    const id=String(change.id??change.record?.id??'')
    if(!id)return
    if(table==='registrations'){
      const next=structuredClone(source)
      if(change.deleted)next.registrations=next.registrations.filter(row=>row.id!==id)
      else if(change.record){
        const record=change.record as unknown as RegistrationRecord
        const index=next.registrations.findIndex(row=>row.id===id)
        if(index>=0)next.registrations[index]={...next.registrations[index],...record}
        else next.registrations.push(record)
      }
      legacyState.value=next
      return
    }
    if(table==='teacher_notifications'){
      const next=structuredClone(source)
      if(change.deleted)next.notifications=next.notifications.filter(row=>row.id!==id)
      else if(change.record){
        const record=change.record as unknown as TeacherNotificationRecord
        const index=next.notifications.findIndex(row=>row.id===id)
        if(index>=0)next.notifications[index]={...next.notifications[index],...record}
        else next.notifications.unshift(record)
      }
      legacyState.value=next
    }
  }

  async function logout(){
    loading.value=true
    try{await legacyApi.signOut()}
    finally{currentUser.value=null;legacyState.value=null;error.value='';loading.value=false;ready.value=true}
  }

  return{currentUser,legacyState,ready,loading,error,isAuthenticated,role,bootstrap,login,reload,applyRealtimeChange,logout}
})
