<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { Building2, CalendarDays, Plus, RefreshCw, ShieldCheck, UserCog } from 'lucide-vue-next'
import { useQueryClient } from '@tanstack/vue-query'
import { useRoute, useRouter } from 'vue-router'
import AppButton from '../components/ui/AppButton.vue'
import AppCard from '../components/ui/AppCard.vue'
import AppTabs from '../components/ui/AppTabs.vue'
import InlineStatus, { type InlineStatusState } from '../components/ui/InlineStatus.vue'
import AdminClassCard from '../components/admin/AdminClassCard.vue'
import AdminTeacherCard from '../components/admin/AdminTeacherCard.vue'
import AdminSchoolYearCard from '../components/admin/AdminSchoolYearCard.vue'
import PermissionMatrix from '../components/admin/PermissionMatrix.vue'
import { assignTeacher, createClass, createSchoolYear, createTeacher, deleteClass, deleteTeacher, setActiveSchoolYear, updateClass, updateSchoolYearPeriods, updateSchoolYearWeek, updateTeacher, useAdminDirectory, type AdminMutationRuntime } from '../features/admin/admin-directory'
import { useAuthStore } from '../stores/auth'
import { useContextStore } from '../stores/context'

const auth=useAuthStore(),context=useContextStore(),queryClient=useQueryClient(),router=useRouter(),route=useRoute(),directory=useAdminDirectory()
const tabs=[{id:'overview',label:'Tổng quan'},{id:'years',label:'Năm học'},{id:'classes',label:'Lớp học'},{id:'teachers',label:'Giáo viên'},{id:'permissions',label:'Phân quyền'}]
const validTabs=['years','classes','teachers','permissions']
const tab=ref(validTabs.includes(String(route.query.tab))?String(route.query.tab):'overview'),busyKey=ref<string|null>(null),status=ref<InlineStatusState>('idle'),statusMessage=ref(''),showYearForm=ref(false),showClassForm=ref(false),showTeacherForm=ref(false)
const yearForm=reactive({name:'',startDate:'',endDate:'',setActive:true}),classForm=reactive({code:'',name:''}),teacherForm=reactive({code:'',fullName:'',password:''})

watch(()=>route.query.tab,value=>{const next=String(value??'');tab.value=validTabs.includes(next)?next:'overview'})
watch(tab,value=>{const target=value==='overview'?{}:{tab:value};if(String(route.query.tab??'')!==(value==='overview'?'':value))void router.replace({path:'/admin',query:target})})
const data=computed(()=>directory.data.value??{schoolYears:[],weeks:[],periods:[],classes:[],teachers:[],assignments:[]})
const mergedSchoolYears=computed(()=>{const schoolYearsById=new Map(context.schoolYears.map(item=>[item.id,{...item}]));for(const item of data.value.schoolYears){schoolYearsById.set(item.id,{...(schoolYearsById.get(item.id)??{}),...item})}return [...schoolYearsById.values()].sort((a,b)=>String(b.startDate).localeCompare(String(a.startDate)))})
const schoolYearCount=computed(()=>mergedSchoolYears.value.length)
const selectedYearId=computed(()=>context.selectedSchoolYearId||auth.legacyState?.selectedSchoolYearId||auth.legacyState?.activeSchoolYearId||null)
const selectedYear=computed(()=>mergedSchoolYears.value.find(item=>item.id===selectedYearId.value)??mergedSchoolYears.value.find(item=>item.active)??null)
const yearClasses=computed(()=>data.value.classes.filter(item=>!selectedYear.value||item.schoolYearId===selectedYear.value.id))
const activeClasses=computed(()=>yearClasses.value.filter(item=>item.active)),activeTeachers=computed(()=>data.value.teachers.filter(item=>item.active)),activeAssignments=computed(()=>data.value.assignments.filter(item=>item.active&&activeClasses.value.some(cls=>cls.id===item.classId)))
function assignedTeachers(classId:string){return data.value.teachers.filter(teacher=>data.value.assignments.some(row=>row.classId===classId&&row.teacherId===teacher.id&&row.active))}
function assignedClasses(teacherId:string){return yearClasses.value.filter(item=>data.value.assignments.some(row=>row.classId===item.id&&row.teacherId===teacherId&&row.active))}
function runtime():AdminMutationRuntime{return{queryClient,reload:async()=>{await auth.reload(context.selectedClassId,context.selectedSchoolYearId);context.hydrate(auth.legacyState);return auth.legacyState}}}
async function run(key:string,task:()=>Promise<unknown>,message:string){busyKey.value=key;try{await task();status.value='success';statusMessage.value=message}catch(error){status.value='error';statusMessage.value=error instanceof Error?error.message:'Không thực hiện được thao tác quản trị.'}finally{busyKey.value=null}}
async function submitYear(){const name=yearForm.name.trim();if(!name||!yearForm.startDate||!yearForm.endDate)return;if(yearForm.endDate<yearForm.startDate){status.value='error';statusMessage.value='Ngày kết thúc năm học phải sau ngày bắt đầu tuần 1.';return}let createdId='';await run('create-year',async()=>{const result=await createSchoolYear(runtime(),{name,startDate:yearForm.startDate,endDate:yearForm.endDate,setActive:yearForm.setActive});createdId=String((result as {schoolYearId?:unknown})?.schoolYearId??'')},'Đã tạo năm học và các tuần cơ sở.');if(createdId&&yearForm.setActive){context.selectSchoolYear(createdId);await auth.reload(null,createdId);context.hydrate(auth.legacyState)}if(status.value==='success'){yearForm.name='';yearForm.startDate='';yearForm.endDate='';yearForm.setActive=true;showYearForm.value=false}}
async function activateYear(id:string){if(!window.confirm('Đặt năm học này thành năm học đang hoạt động?'))return;await run(`year:${id}`,()=>setActiveSchoolYear(runtime(),id),'Đã chuyển năm học đang hoạt động.');if(status.value==='success'){context.selectSchoolYear(id);await auth.reload(null,id);context.hydrate(auth.legacyState)}}
function yearWeeks(yearId:string){return data.value.weeks.filter(item=>item.schoolYearId===yearId).sort((a,b)=>a.number-b.number)}
function yearPeriods(yearId:string){return data.value.periods.filter(item=>item.schoolYearId===yearId).sort((a,b)=>a.number-b.number)}
async function saveYearWeek(input:{weekId:string;startDate:string;endDate:string}){await run(`week:${input.weekId}`,()=>updateSchoolYearWeek(runtime(),input),'Đã cập nhật lịch tuần chuẩn.')}
async function saveYearPeriods(input:{schoolYearId:string;periods:Array<{number:number;start:string;end:string}>}){await run(`periods:${input.schoolYearId}`,()=>updateSchoolYearPeriods(runtime(),input),'Đã cập nhật khung giờ tiết học của năm học.')} 
async function submitClass(){const code=classForm.code.trim().toUpperCase(),name=classForm.name.trim();if(!code||!name||!selectedYearId.value)return;await run('create-class',()=>createClass(runtime(),{code,name,schoolYearId:selectedYearId.value}),'Đã tạo lớp.');classForm.code='';classForm.name='';showClassForm.value=false}
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
    <header class="admin-header"><div><span class="page-context"><ShieldCheck/>ROOT ADMIN · TRUNG TÂM ĐIỀU PHỐI</span><h1>Quản trị hệ thống</h1><p>Quản lý năm học, lớp, giáo viên và quyền truy cập bằng các thao tác backend có kiểm soát.</p></div><AppButton variant="secondary" :loading="directory.isFetching.value" @click="directory.refetch()"><RefreshCw/>Làm mới</AppButton></header>
    <InlineStatus :state="status" :message="statusMessage"/>
    <AppTabs v-model="tab" :items="tabs" label="Khu vực quản trị"/>

    <template v-if="tab==='overview'">
      <section class="summary"><AppCard padding="lg"><span><CalendarDays/>Năm học</span><b>{{ schoolYearCount }}</b></AppCard><AppCard padding="lg"><span><Building2/>Lớp hoạt động</span><b>{{ activeClasses.length }}</b></AppCard><AppCard padding="lg"><span><UserCog/>Giáo viên hoạt động</span><b>{{ activeTeachers.length }}</b></AppCard><AppCard padding="lg"><span><ShieldCheck/>Phân quyền</span><b>{{ activeAssignments.length }}</b></AppCard></section>
      <AppCard padding="lg" class="overview-copy"><h2>Ngữ cảnh hiện tại: {{ selectedYear?.name||'Chưa có năm học' }} <small v-if="selectedYear?.active">· Đang hoạt động</small></h2><p>Năm học quyết định danh sách lớp và tuần hiển thị. Chuyển năm học ở bong bóng trên đầu trang để xem dữ liệu lịch sử hoặc chuẩn bị năm học mới.</p></AppCard>
    </template>

    <template v-else-if="tab==='years'">
      <div class="section-actions"><div><h2>Năm học</h2><p>{{ schoolYearCount }} năm học. Chỉ một năm được đặt là đang hoạt động.</p></div><AppButton @click="showYearForm=!showYearForm"><Plus/>Tạo năm học</AppButton></div>
      <AppCard v-if="showYearForm" padding="md"><form class="quick-form year-form" @submit.prevent="submitYear"><label>Tên năm học<input v-model="yearForm.name" required maxlength="40" placeholder="2027–2028"></label><label>Ngày bắt đầu tuần 1<input v-model="yearForm.startDate" type="date" required></label><label>Ngày kết thúc năm học<input v-model="yearForm.endDate" type="date" required></label><label class="check-field"><input v-model="yearForm.setActive" type="checkbox">Đặt là năm học đang hoạt động</label><AppButton type="submit" :loading="busyKey==='create-year'">Tạo năm học</AppButton></form></AppCard>
      <section class="year-grid"><AdminSchoolYearCard v-for="item in mergedSchoolYears" :key="item.id" :item="item" :weeks="yearWeeks(item.id)" :periods="yearPeriods(item.id)" :busy="busyKey===`year:${item.id}`" :busy-week-id="busyKey?.startsWith('week:')?busyKey.slice(5):null" :busy-periods="busyKey===`periods:${item.id}`" @activate="activateYear" @save-week="saveYearWeek" @save-periods="saveYearPeriods"/></section>
    </template>

    <template v-else-if="tab==='classes'">
      <div class="section-actions"><div><h2>Lớp học · {{ selectedYear?.name||'—' }}</h2><p>{{ yearClasses.length }} lớp trong năm học đang chọn.</p></div><AppButton :disabled="!selectedYearId" @click="showClassForm=!showClassForm"><Plus/>Tạo lớp</AppButton></div>
      <AppCard v-if="showClassForm" padding="md"><form class="quick-form" @submit.prevent="submitClass"><label>Mã lớp<input v-model="classForm.code" required maxlength="40" placeholder="7A1"></label><label>Tên lớp<input v-model="classForm.name" required maxlength="120" placeholder="Lớp 7A1"></label><AppButton type="submit" :loading="busyKey==='create-class'">Tạo lớp</AppButton></form></AppCard>
      <section class="class-grid"><AdminClassCard v-for="item in yearClasses" :key="item.id" :item="item" :teachers="assignedTeachers(item.id)" @edit="editClass(item.id)" @toggle="toggleClass(item.id)" @delete="removeClass(item.id)"/></section>
    </template>

    <template v-else-if="tab==='teachers'">
      <div class="section-actions"><div><h2>Giáo viên</h2><p>{{ data.teachers.length }} tài khoản giáo viên.</p></div><AppButton @click="showTeacherForm=!showTeacherForm"><Plus/>Tạo giáo viên</AppButton></div>
      <AppCard v-if="showTeacherForm" padding="md"><form class="quick-form teacher-form" @submit.prevent="submitTeacher"><label>Mã đăng nhập<input v-model="teacherForm.code" required maxlength="32" placeholder="GV-HIEU"></label><label>Họ và tên<input v-model="teacherForm.fullName" required maxlength="120"></label><label>Mật khẩu tạm<input v-model="teacherForm.password" type="password" autocomplete="new-password" placeholder="Để trống để tự sinh"></label><AppButton type="submit" :loading="busyKey==='create-teacher'">Tạo giáo viên</AppButton></form></AppCard>
      <section class="teacher-grid"><AdminTeacherCard v-for="teacher in data.teachers" :key="teacher.id" :teacher="teacher" :classes="assignedClasses(teacher.id)" @toggle="toggleTeacher(teacher.id)" @delete="removeTeacher(teacher.id)"/></section>
    </template>

    <template v-else>
      <div class="section-actions"><div><h2>Phân quyền · {{ selectedYear?.name||'—' }}</h2><p>Bật/tắt quyền phụ trách từng lớp trong năm học đang chọn.</p></div></div>
      <AppCard padding="lg"><PermissionMatrix :classes="activeClasses" :teachers="data.teachers" :assignments="data.assignments" :busy-key="busyKey" @change="permission"/></AppCard>
    </template>
  </div>
</template>
<style scoped>
.admin-page{max-width:1560px;margin:0 auto}.admin-header,.section-actions{display:flex;justify-content:space-between;align-items:flex-start;gap:16px}.admin-header h1{margin:8px 0;font-size:clamp(2rem,4vw,3rem)}.admin-header p,.section-actions p,.overview-copy p{margin:0;color:var(--text-muted)}.page-context{display:flex;align-items:center;gap:7px;color:var(--color-primary);font-size:.75rem;font-weight:900;letter-spacing:.04em}.page-context svg,.admin-header :deep(svg),.section-actions :deep(svg){width:17px}.summary{display:grid;grid-template-columns:repeat(4,1fr);gap:11px}.summary :deep(.app-card){display:flex;align-items:center;justify-content:space-between}.summary span{display:flex;align-items:center;gap:7px;color:var(--text-muted);font-weight:800}.summary svg{width:18px}.summary b{font-size:1.8rem}.overview-copy h2,.section-actions h2{margin:0 0 5px}.year-grid{display:grid;grid-template-columns:1fr;gap:11px}.class-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:11px}.teacher-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:11px}.quick-form{display:grid;grid-template-columns:1fr 2fr auto;gap:10px;align-items:end}.quick-form.year-form{grid-template-columns:1.1fr 1fr 1fr 1.3fr auto}.quick-form.teacher-form{grid-template-columns:1fr 1.5fr 1.3fr auto}.quick-form label{display:grid;gap:5px;font-size:.78rem;font-weight:800;color:var(--text-muted)}.quick-form input{min-height:44px;border:1px solid var(--border);border-radius:11px;background:var(--surface);color:var(--text);padding:8px 10px}.quick-form .check-field{display:flex;align-items:center;gap:8px;min-height:44px;padding:8px 10px;border:1px solid var(--border);border-radius:11px;background:color-mix(in srgb,var(--wash-cream) 48%,var(--surface));color:var(--text)}.quick-form .check-field input{min-height:0;width:17px;height:17px}@media(max-width:1180px){.summary{grid-template-columns:repeat(2,1fr)}.quick-form.year-form{grid-template-columns:1fr 1fr}.teacher-grid{grid-template-columns:repeat(2,1fr)}.quick-form,.quick-form.teacher-form{grid-template-columns:1fr 1fr}.quick-form :deep(.app-button){width:100%}}@media(max-width:720px){.admin-header,.section-actions{flex-direction:column}.summary,.year-grid,.class-grid,.teacher-grid{grid-template-columns:1fr}.quick-form,.quick-form.year-form,.quick-form.teacher-form{grid-template-columns:1fr}.admin-header :deep(.app-button),.section-actions :deep(.app-button){width:100%}}
</style>
