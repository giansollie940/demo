import { computed, type Ref } from 'vue'
import { useQuery, type QueryClient } from '@tanstack/vue-query'
import { legacyApi } from '../../services/legacy-supabase'
import type { DirectoryUser, TeacherDirectoryResponse, TeacherUserChanges } from '../../types/legacy'

export const studentDirectoryKey=(classId:string|null)=>['student-directory',classId??'none'] as const

function bool(value:unknown, fallback=true){return value===undefined||value===null?fallback:value!==false}
function text(value:unknown){return String(value??'').trim()}

export function normalizeDirectoryUser(raw:Record<string,unknown>):DirectoryUser{
  const role=String(raw.role??'student') as DirectoryUser['role']
  return {
    id:text(raw.id),
    code:text(raw.code??raw.student_code).toUpperCase(),
    fullName:text(raw.fullName??raw.full_name??raw.name),
    role,
    classId:(raw.classId??raw.class_id??null) as string|null,
    active:bool(raw.active,true),
    deletedAt:(raw.deletedAt??raw.deleted_at??null) as string|null,
  }
}

export function directoryUsersFromResponse(response:TeacherDirectoryResponse):DirectoryUser[]{
  return (Array.isArray(response.users)?response.users:[]).map(item=>normalizeDirectoryUser(item)).filter(user=>Boolean(user.id))
}

export function useStudentDirectory(classId:Ref<string|null>){
  return useQuery({
    queryKey:computed(()=>studentDirectoryKey(classId.value)),
    enabled:computed(()=>Boolean(classId.value)),
    queryFn:async()=>directoryUsersFromResponse(await legacyApi.teacherListUsers(classId.value)),
    staleTime:30_000,
  })
}

export interface StudentMutationRuntime{
  classId:string
  queryClient:QueryClient
  reload():Promise<void>
}

async function refresh(runtime:StudentMutationRuntime){
  await runtime.reload()
  await runtime.queryClient.invalidateQueries({queryKey:studentDirectoryKey(runtime.classId)})
}

export async function createStudentAccount(runtime:StudentMutationRuntime,changes:TeacherUserChanges){
  const response=await legacyApi.teacherCreateUser(changes)
  await refresh(runtime)
  return response
}
export async function updateStudentAccount(runtime:StudentMutationRuntime,userId:string,changes:TeacherUserChanges){await legacyApi.teacherUpdateUser(userId,changes);await refresh(runtime)}
export async function resetStudentPassword(userId:string,password:string){return legacyApi.teacherResetPassword(userId,password)}
export async function softDeleteStudent(runtime:StudentMutationRuntime,userId:string,confirmCode:string){await legacyApi.teacherDeleteUser(userId,confirmCode);await refresh(runtime)}
export async function restoreStudent(runtime:StudentMutationRuntime,user:DirectoryUser){await legacyApi.teacherUpdateUser(user.id,{changeCode:false,code:user.code,fullName:user.fullName,role:user.role,classId:user.classId??runtime.classId,active:true});await refresh(runtime)}
