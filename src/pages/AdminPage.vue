<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { Building2, Plus, RefreshCw, ShieldCheck, UserCog, UsersRound } from 'lucide-vue-next'
import { useQueryClient } from '@tanstack/vue-query'
import { useRoute, useRouter } from 'vue-router'
import AppButton from '../components/ui/AppButton.vue'
import AppCard from '../components/ui/AppCard.vue'
import AppTabs from '../components/ui/AppTabs.vue'
import InlineStatus, { type InlineStatusState } from '../components/ui/InlineStatus.vue'
import AdminClassCard from '../components/admin/AdminClassCard.vue'
import AdminTeacherCard from '../components/admin/AdminTeacherCard.vue'
import PermissionMatrix from '../components/admin/PermissionMatrix.vue'
import { assignTeacher, createClass, createTeacher, deleteClass, deleteTeacher, updateClass, updateTeacher, useAdminDirectory, type AdminMutationRuntime } from '../features/admin/admin-directory'
import { useAuthStore } from '../stores/auth'
import { useContextStore } from '../stores/context'

const auth=useAuthStore(),context=useContextStore(),queryClient=useQueryClient(),router=useRouter(),route=useRoute(),directory=useAdminDirectory()
const tabs=[{id:'overview',label:'Tổng quan'},{id:'classes',label:'Lớp học'},{id:'teachers',label:'Giáo viên'},{id:'permissions',label:'Phân quyền'}]
const tab=ref(['classes','teachers','permissions'].includes(String(route.query.tab))?String(route.query.tab):'overview'),busyKey=ref<string|null>(null),status=ref<InlineStatusState>('idle'),statusMessage=ref(''),showClassForm=ref(false),showTeacherForm=ref(false)
const classForm=reactive({code:'',name:''}),teacherForm=reactive({code:'',fullName:'',password:''})

watch(()=>route.query.tab,value=>{const next=String(value??'');tab.value=['classes','teachers','permissions'].includes(next)?next:'overview'})
watch(tab,value=>{const target=value==='overview'?{}:{tab:value};if(String(route.query.tab??'')!==(value==='overview'?'':value))void router.replace({path:'/admin',query:target})})
const data=computed(()=>directory.data.value??{classes:[],teachers:[],assignments:[]})
const activeClasses=computed(()=>data.value.classes.filter(item=>item.active)),activeTeachers=computed(()=>data.value.teachers.filter(item=>item.active)),activeAssignments=computed(()=>data.value.assignments.filter(item=>item.active))
function assignedTeachers(classId:string){return data.value.teachers.filter(teacher=>data.value.assignments.some(row=>row.classId===classId&&row.teacherId===teacher.id&&row.active))}
function assignedClasses(teacherId:string){return data.value.classes.filter(item=>data.value.assignments.some(row=>row.classId===item.id&&row.teacherId===teacherId&&row.active))}
function runtime():AdminMutationRuntime{return{queryClient,reload:async()=>{await auth.reload(context.selectedClassId);context.hydrate(auth.legacyState);return auth.legacyState}}}
async function run(key:string,task:()=>Promise<unknown>,message:string){busyKey.value=key;try{await task();status.value='success';statusMessage.value=message}catch(error){status.value='error';statusMessage.value=error instanceof Error?error.message:'Không thực hiện được thao tác quản trị.'}finally{busyKey.value=null}}
function openClass(id:string){context.selectClass(id);void auth.reload(id).then(()=>{context.hydrate(auth.legacyState);void router.push('/students')})}
async function submitClass(){const code=classForm.code.trim().toUpperCase(),name=classForm.name.trim();if(!code||!name)return;await run('create-class',()=>createClass(runtime(),{code,name,schoolYearId:auth.legacyState?.activeSchoolYearId??null}),'Đã tạo lớp.');classForm.code='';classForm.name='';showClassForm.value=false}
async function editClass(id:string){const item=data.value.classes.find(row=>row.id===id);if(!item)return;const code=window.prompt('Mã lớp:',item.code)?.trim().toUpperCase();if(!code)return;const name=window.prompt('Tên lớp:',item.name)?.trim();if(!name)return;await run(`class:${id}`,()=>updateClass(runtime(),id,{code,name}),'Đã cập nhật lớp.')}
async function toggleClass(id:string){const item=data.value.classes.find(row=>row.id===id);if(!item)return;if(item.active&&!window.confirm('Khóa lớp này? Backend chỉ cho phép khi trạng thái hợp lệ.'))return;await run(`class:${id}`,()=>updateClass(runtime(),id,{active:!item.active}),item.active?'Đã khóa lớp.':'Đã kích hoạt lớp.')}
async function removeClass(id:string){const item=data.value.classes.find(row=>row.id===id);if(!item?.canDelete||!window.confirm(`Xóa vĩnh viễn lớp rỗng ${item.code}?`))return;await run(`class:${id}`,()=>deleteClass(runtime(),id),'Đã xóa lớp rỗng.')}
async function submitTeacher(){const code=teacherForm.code.trim().toUpperCase(),fullName=teacherForm.fullName.trim();if(!code||!fullName)return;const response=await (async()=>{let result:unknown;await run('create-teacher',async()=>{result=await createTeacher(runtime(),{code,fullName,role:'teacher',classId:null,active:true,password:teacherForm.password})},'Đã tạo giáo viên.');return result})();const password=String((response as {password?:unknown}|undefined)?.password??'');if(password)statusMessage.value=`Đã tạo ${code}. Mật khẩu tạm: ${password}`;teacherForm.code='';teacherForm.fullName='';teacherForm.password='';showTeacherForm.value=false}
async function toggleTeacher(id:string){const teacher=data.value.teachers.find(row=>row.id===id);if(!teacher)return;await run(`teacher:${id}`,()=>updateTeacher(runtime(),id,{changeCode:false,code:teacher.code,fullName:teacher.fullName,role:'teacher',classId:null,active:!teacher.active}),teacher.active?'Đã khóa giáo viên.':'Đã mở khóa giáo viên.')}
async function removeTeacher(id:string){const teacher=data.value.teachers.find(row=>row.id===id);if(!teacher)return;const confirmCode=window.prompt(`Xóa mềm giáo viên ${teacher.fullName}. Nhập mã ${teacher.code}:`)?.trim().toUpperCase();if(!confirmCode||confirmCode!==teacher.code.toUpperCase())return;await run(`teacher:${id}`,()=>deleteTeacher(runtime(),id,confirmCode),'Đã xóa mềm giáo viên.')}
async function permission(payload:{classId:string;teacherId:string;enabled:boolean}){const key=`${payload.classId}:${payload.teacherId}`;await run(key,()=>assignTeacher(runtime(),payload.classId,payload.teacherId,payload.enabled),'Đã cập nhật phân quyền giáo viên.')}
</script>
<template>
  <div class="page-stack admin-page">
    <header class="admin-header"><div><span class="page-context"><ShieldCheck/>ROOT ADMIN · TRUNG TÂM ĐIỀU PHỐI</span><h1>Quản trị lớp</h1><p>Quản lý lớp, giáo viên và quyền truy cập bằng đúng Edge Function hiện có.</p></div><AppButton variant="secondary" :loading="directory.isFetching.value" @click="directory.refetch()"><RefreshCw/>Làm mới</AppButton></header>
    <InlineStatus :state="status" :message="statusMessage"/>
    <AppTabs v-model="tab" :items="tabs" label="Khu vực quản trị"/>

    <template v-if="tab==='overview'">
      <section class="summary"><AppCard padding="lg"><span><Building2/>Lớp hoạt động</span><b>{{ activeClasses.length }}</b></AppCard><AppCard padding="lg"><span><UserCog/>Giáo viên hoạt động</span><b>{{ activeTeachers.length }}</b></AppCard><AppCard padding="lg"><span><ShieldCheck/>Phân quyền</span><b>{{ activeAssignments.length }}</b></AppCard></section>
      <AppCard padding="lg" class="overview-copy"><h2>Mỗi nhiệm vụ quản trị có một khu vực riêng</h2><p>Tab Lớp học quản lý trạng thái lớp; tab Giáo viên quản lý tài khoản; tab Phân quyền là ma trận giáo viên × lớp. Backend vẫn là nơi quyết định quyền và điều kiện xóa/khóa.</p></AppCard>
    </template>

    <template v-else-if="tab==='classes'">
      <div class="section-actions"><div><h2>Lớp học</h2><p>{{ data.classes.length }} lớp trong danh mục quản trị.</p></div><AppButton @click="showClassForm=!showClassForm"><Plus/>Tạo lớp</AppButton></div>
      <AppCard v-if="showClassForm" padding="md"><form class="quick-form" @submit.prevent="submitClass"><label>Mã lớp<input v-model="classForm.code" required maxlength="40" placeholder="7A1"></label><label>Tên lớp<input v-model="classForm.name" required maxlength="120" placeholder="Lớp 7A1"></label><AppButton type="submit" :loading="busyKey==='create-class'">Tạo lớp</AppButton></form></AppCard>
      <section class="class-grid"><AdminClassCard v-for="item in data.classes" :key="item.id" :item="item" :teachers="assignedTeachers(item.id)" @open="openClass(item.id)" @edit="editClass(item.id)" @toggle="toggleClass(item.id)" @delete="removeClass(item.id)"/></section>
    </template>

    <template v-else-if="tab==='teachers'">
      <div class="section-actions"><div><h2>Giáo viên</h2><p>{{ data.teachers.length }} tài khoản giáo viên.</p></div><AppButton @click="showTeacherForm=!showTeacherForm"><Plus/>Tạo giáo viên</AppButton></div>
      <AppCard v-if="showTeacherForm" padding="md"><form class="quick-form teacher-form" @submit.prevent="submitTeacher"><label>Mã đăng nhập<input v-model="teacherForm.code" required maxlength="32" placeholder="GV-HIEU"></label><label>Họ và tên<input v-model="teacherForm.fullName" required maxlength="120"></label><label>Mật khẩu tạm<input v-model="teacherForm.password" type="password" autocomplete="new-password" placeholder="Để trống để tự sinh"></label><AppButton type="submit" :loading="busyKey==='create-teacher'">Tạo giáo viên</AppButton></form></AppCard>
      <section class="teacher-grid"><AdminTeacherCard v-for="teacher in data.teachers" :key="teacher.id" :teacher="teacher" :classes="assignedClasses(teacher.id)" @toggle="toggleTeacher(teacher.id)" @delete="removeTeacher(teacher.id)"/></section>
    </template>

    <template v-else>
      <div class="section-actions"><div><h2>Phân quyền</h2><p>Bật/tắt quyền phụ trách từng lớp; quyền backend vẫn là nguồn thẩm quyền cuối cùng.</p></div></div>
      <AppCard padding="lg"><PermissionMatrix :classes="activeClasses" :teachers="data.teachers" :assignments="data.assignments" :busy-key="busyKey" @change="permission"/></AppCard>
    </template>
  </div>
</template>
<style scoped>
.admin-page{max-width:1560px;margin:0 auto}.admin-header,.section-actions{display:flex;justify-content:space-between;align-items:flex-start;gap:16px}.admin-header h1{margin:8px 0;font-size:clamp(2rem,4vw,3rem)}.admin-header p,.section-actions p,.overview-copy p{margin:0;color:var(--text-muted)}.page-context{display:flex;align-items:center;gap:7px;color:var(--color-primary);font-size:.75rem;font-weight:900;letter-spacing:.04em}.page-context svg,.admin-header :deep(svg),.section-actions :deep(svg){width:17px}.summary{display:grid;grid-template-columns:repeat(3,1fr);gap:11px}.summary :deep(.app-card){display:flex;align-items:center;justify-content:space-between}.summary span{display:flex;align-items:center;gap:7px;color:var(--text-muted);font-weight:800}.summary svg{width:18px}.summary b{font-size:1.8rem}.overview-copy h2,.section-actions h2{margin:0 0 5px}.class-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:11px}.teacher-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:11px}.quick-form{display:grid;grid-template-columns:1fr 2fr auto;gap:10px;align-items:end}.quick-form.teacher-form{grid-template-columns:1fr 1.5fr 1.3fr auto}.quick-form label{display:grid;gap:5px;font-size:.78rem;font-weight:800;color:var(--text-muted)}.quick-form input{min-height:44px;border:1px solid var(--border);border-radius:11px;background:var(--surface);color:var(--text);padding:8px 10px}@media(max-width:1080px){.teacher-grid{grid-template-columns:repeat(2,1fr)}.quick-form,.quick-form.teacher-form{grid-template-columns:1fr 1fr}.quick-form :deep(.app-button){width:100%}}@media(max-width:720px){.admin-header,.section-actions{flex-direction:column}.summary,.class-grid,.teacher-grid{grid-template-columns:1fr}.quick-form,.quick-form.teacher-form{grid-template-columns:1fr}.admin-header :deep(.app-button),.section-actions :deep(.app-button){width:100%}}
</style>
