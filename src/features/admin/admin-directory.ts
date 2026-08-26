import { useQuery, type QueryClient } from '@tanstack/vue-query'
import { legacyApi } from '../../services/legacy-supabase'
import type { LegacyState, TeacherUserChanges } from '../../types/legacy'

export interface AdminClassRecord {
  id:string
  code:string
  name:string
  active:boolean
  learnerCount:number
  profileCount:number
  registrationCount:number
  canDelete:boolean
  deleteBlockers:Array<{code?:string;message?:string}>
}
export interface AdminTeacherRecord {
  id:string
  code:string
  fullName:string
  active:boolean
}
export interface AdminAssignmentRecord {
  classId:string
  teacherId:string
  active:boolean
}
export interface AdminDirectory {
  classes:AdminClassRecord[]
  teachers:AdminTeacherRecord[]
  assignments:AdminAssignmentRecord[]
}

const text=(value:unknown)=>String(value??'').trim()
const num=(value:unknown)=>Number(value??0)||0
const on=(value:unknown)=>value!==false

export function normalizeAdminDirectory(raw:Record<string,unknown>):AdminDirectory{
  const classes=(Array.isArray(raw.classes)?raw.classes:[]).map(item=>{
    const row=item as Record<string,unknown>
    return {
      id:text(row.id),code:text(row.code),name:text(row.name??row.code),active:on(row.active),
      learnerCount:num(row.learnerCount??row.learner_count),profileCount:num(row.profileCount??row.profile_count),registrationCount:num(row.registrationCount??row.registration_count),
      canDelete:row.canDelete===true||row.can_delete===true,
      deleteBlockers:(Array.isArray(row.deleteBlockers)?row.deleteBlockers:Array.isArray(row.delete_blockers)?row.delete_blockers:[]) as Array<{code?:string;message?:string}>,
    }
  }).filter(row=>row.id)
  const teachers=(Array.isArray(raw.teachers)?raw.teachers:[]).map(item=>{
    const row=item as Record<string,unknown>
    return {id:text(row.id),code:text(row.student_code??row.code),fullName:text(row.full_name??row.fullName??row.name),active:on(row.active)}
  }).filter(row=>row.id)
  const assignments=(Array.isArray(raw.assignments)?raw.assignments:[]).map(item=>{
    const row=item as Record<string,unknown>
    return {classId:text(row.class_id??row.classId),teacherId:text(row.teacher_id??row.teacherId),active:on(row.active)}
  }).filter(row=>row.classId&&row.teacherId)
  return {classes,teachers,assignments}
}

export const adminDirectoryKey=['admin-directory'] as const
export function useAdminDirectory(){return useQuery({queryKey:adminDirectoryKey,queryFn:async()=>normalizeAdminDirectory(await legacyApi.adminManageClasses('list')),staleTime:180_000})}

export interface AdminMutationRuntime{queryClient:QueryClient;reload():Promise<LegacyState|null>}
async function refresh(runtime:AdminMutationRuntime){await runtime.reload();await runtime.queryClient.invalidateQueries({queryKey:adminDirectoryKey})}
export async function assignTeacher(runtime:AdminMutationRuntime,classId:string,teacherId:string,enabled:boolean){await legacyApi.adminManageClasses(enabled?'assign_teacher':'unassign_teacher',{classId,teacherId});await refresh(runtime)}
export async function createClass(runtime:AdminMutationRuntime,input:{code:string;name:string;schoolYearId:string|null}){await legacyApi.adminManageClasses('create_class',{code:input.code,name:input.name,schoolYearId:input.schoolYearId});await refresh(runtime)}
export async function updateClass(runtime:AdminMutationRuntime,classId:string,changes:Record<string,unknown>){await legacyApi.adminManageClasses('update_class',{classId,...changes});await refresh(runtime)}
export async function deleteClass(runtime:AdminMutationRuntime,classId:string){await legacyApi.adminManageClasses('delete_class',{classId});await refresh(runtime)}
export async function createTeacher(runtime:AdminMutationRuntime,input:TeacherUserChanges){const result=await legacyApi.teacherCreateUser(input);await refresh(runtime);return result}
export async function updateTeacher(runtime:AdminMutationRuntime,userId:string,input:TeacherUserChanges){await legacyApi.teacherUpdateUser(userId,input);await refresh(runtime)}
export async function deleteTeacher(runtime:AdminMutationRuntime,userId:string,confirmCode:string){await legacyApi.teacherDeleteUser(userId,confirmCode);await refresh(runtime)}
