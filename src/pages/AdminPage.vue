<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { Building2, CalendarDays, GraduationCap, Plus, RefreshCw, ShieldCheck, UserCog } from 'lucide-vue-next'
import { useQueryClient } from '@tanstack/vue-query'
import { useRoute } from 'vue-router'
import AppButton from '../components/ui/AppButton.vue'
import AppCard from '../components/ui/AppCard.vue'
import InlineStatus, { type InlineStatusState } from '../components/ui/InlineStatus.vue'
import AdminClassCard from '../components/admin/AdminClassCard.vue'
import AdminTeacherCard from '../components/admin/AdminTeacherCard.vue'
import AdminStudentCard from '../components/admin/AdminStudentCard.vue'
import AdminSchoolYearCard from '../components/admin/AdminSchoolYearCard.vue'
import AdminAuditLog from '../components/admin/AdminAuditLog.vue'
import AdminRecycleBin from '../components/admin/AdminRecycleBin.vue'
import AdminUserDialog from '../components/admin/AdminUserDialog.vue'
import AdminPasswordDialog from '../components/admin/AdminPasswordDialog.vue'
import AdminClassDialog from '../components/admin/AdminClassDialog.vue'
import PermissionMatrix from '../components/admin/PermissionMatrix.vue'
import {
  assignTeacher, createClass, createManagedUser, createSchoolYear, createTeacher, deleteClass, hardDeleteUser,
  resetManagedPassword, setActiveSchoolYear, updateClass, updateManagedUser, updateSchoolYearWeek,
  updateTeacher, useAdminDirectory, createTimetableTemplate, saveTimetableVersion, assignTimetableTemplate,
  type AdminMutationRuntime, type AdminTeacherRecord, type GeneratedTimetableDay,
} from '../features/admin/admin-directory'
import { useAuthStore } from '../stores/auth'
import { useContextStore } from '../stores/context'
import type { DirectoryUser, TeacherUserChanges } from '../types/legacy'
import type { TimetableConfig } from '../features/timetable/timetable-types'
import { appDialog } from '../features/shared/app-dialog'

const auth=useAuthStore()
const context=useContextStore()
const queryClient=useQueryClient()
const route=useRoute()
const directory=useAdminDirectory()
const validTabs=['overview','years','classes','students','teachers','permissions','recycle','audit']
const tab=computed(()=>{const value=String(route.query.tab??'overview');return validTabs.includes(value)?value:'overview'})

const busyKey=ref<string|null>(null)
const status=ref<InlineStatusState>('idle')
const statusMessage=ref('')
type TimetableFeedback={schoolYearId:string;state:InlineStatusState;message:string;selectedTemplateId?:string;version?:number;token:number}
const timetableFeedback=ref<TimetableFeedback|null>(null)
let timetableFeedbackToken=0
const showYearForm=ref(false)
const showClassForm=ref(false)
const yearForm=reactive({name:'',startDate:'',endDate:'',setActive:true})
const classForm=reactive({code:'',name:''})
const editingClass=ref<import('../features/admin/admin-directory').AdminClassRecord|null>(null)
const classDialogError=ref('')

const userDialogOpen=ref(false)
const userDialogKind=ref<'learner'|'teacher'>('learner')
const editingLearner=ref<DirectoryUser|null>(null)
const editingTeacher=ref<AdminTeacherRecord|null>(null)
const userDialogError=ref('')
const passwordTarget=ref<{id:string;code:string;name:string}|null>(null)
const passwordError=ref('')

const studentSearch=ref('')
const studentYearFilter=ref('')
const studentClassFilter=ref('')
const studentRoleFilter=ref('')
const studentStatusFilter=ref('')

const data=computed(()=>directory.data.value??{
  schoolYears:[],weeks:[],periods:[],classes:[],teachers:[],assignments:[],users:[],
  timetableTemplates:[],timetableVersions:[],timetableAssignments:[],
})
const mergedSchoolYears=computed(()=>{
  const byId=new Map(context.schoolYears.map(item=>[item.id,{...item}]))
  for(const item of data.value.schoolYears)byId.set(item.id,{...(byId.get(item.id)??{}),...item})
  return [...byId.values()].sort((a,b)=>String(b.startDate).localeCompare(String(a.startDate)))
})
const schoolYearCount=computed(()=>mergedSchoolYears.value.length)
const selectedYearId=computed(()=>context.selectedSchoolYearId||auth.legacyState?.selectedSchoolYearId||auth.legacyState?.activeSchoolYearId||null)
const selectedYear=computed(()=>mergedSchoolYears.value.find(item=>item.id===selectedYearId.value)??mergedSchoolYears.value.find(item=>item.active)??null)
const yearClasses=computed(()=>data.value.classes.filter(item=>!selectedYear.value||item.schoolYearId===selectedYear.value.id))
const activeClasses=computed(()=>yearClasses.value.filter(item=>item.active))
const activeTeachers=computed(()=>data.value.teachers.filter(item=>item.active))
const activeAssignments=computed(()=>data.value.assignments.filter(item=>item.active&&activeClasses.value.some(cls=>cls.id===item.classId)))
const learners=computed(()=>data.value.users.filter(item=>item.role==='student'||item.role==='monitor'))
const activeLearners=computed(()=>learners.value.filter(item=>item.active))
const classById=computed(()=>new Map(data.value.classes.map(item=>[item.id,item])))
const dialogUser=computed(()=>userDialogKind.value==='learner'?editingLearner.value:editingTeacher.value)
const filteredLearners=computed(()=>{
  const q=studentSearch.value.trim().toLowerCase()
  return learners.value.filter(user=>{
    const cls=user.classId?classById.value.get(user.classId):null
    if(studentYearFilter.value&&cls?.schoolYearId!==studentYearFilter.value)return false
    if(studentClassFilter.value&&user.classId!==studentClassFilter.value)return false
    if(studentRoleFilter.value&&user.role!==studentRoleFilter.value)return false
    if(studentStatusFilter.value==='active'&&!user.active)return false
    if(studentStatusFilter.value==='inactive'&&user.active)return false
    if(q&&![user.code,user.fullName,cls?.code].some(value=>String(value??'').toLowerCase().includes(q)))return false
    return true
  })
})

function assignedTeachers(classId:string){return data.value.teachers.filter(teacher=>data.value.assignments.some(row=>row.classId===classId&&row.teacherId===teacher.id&&row.active))}
function assignedClasses(teacherId:string){return data.value.classes.filter(item=>data.value.assignments.some(row=>row.classId===item.id&&row.teacherId===teacherId&&row.active))}
function runtime():AdminMutationRuntime{return{queryClient,reload:async()=>{await auth.reload(context.selectedClassId,context.selectedSchoolYearId);context.hydrate(auth.legacyState);return auth.legacyState}}}
async function run<T>(key:string,task:()=>Promise<T>,message:string):Promise<T>{
  busyKey.value=key;status.value='saving';statusMessage.value='Đang đồng bộ với cơ sở dữ liệu…'
  try{const result=await task();status.value='success';statusMessage.value=message;return result}
  catch(error){status.value='error';statusMessage.value=error instanceof Error?error.message:'Không thực hiện được thao tác quản trị.';throw error}
  finally{busyKey.value=null}
}
function setTimetableFeedback(input:Omit<TimetableFeedback,'token'>){timetableFeedback.value={...input,token:++timetableFeedbackToken}}
function timetableBusyForYear(yearId:string){const key=busyKey.value;if(!key?.startsWith('timetable:'))return false;const target=key.slice('timetable:'.length);return target===yearId||yearTemplates(yearId).some(item=>item.id===target)}

async function submitYear(){
  // Form dùng novalidate nên phải tự nói ra chỗ còn thiếu; nếu chỉ return thì
  // bấm "Tạo năm học" sẽ không phản hồi gì.
  const name=yearForm.name.trim()
  if(!name||!yearForm.startDate||!yearForm.endDate){status.value='error';statusMessage.value='Hãy nhập đủ tên năm học, ngày bắt đầu tuần 1 và ngày kết thúc.';return}
  if(yearForm.endDate<yearForm.startDate){status.value='error';statusMessage.value='Ngày kết thúc năm học phải sau ngày bắt đầu tuần 1.';return}
  let createdId=''
  try{await run('create-year',async()=>{const result=await createSchoolYear(runtime(),{name,startDate:yearForm.startDate,endDate:yearForm.endDate,setActive:yearForm.setActive});createdId=String((result as {schoolYearId?:unknown})?.schoolYearId??'')},'Đã tạo năm học và các tuần cơ sở.') }catch{return}
  if(createdId&&yearForm.setActive){context.selectSchoolYear(createdId);await auth.reload(null,createdId);context.hydrate(auth.legacyState)}
  yearForm.name='';yearForm.startDate='';yearForm.endDate='';yearForm.setActive=true;showYearForm.value=false
}
async function activateYear(id:string){if(!await appDialog.confirm({title:'Đổi năm học đang hoạt động',body:'Đặt năm học này thành năm học đang hoạt động?',confirmLabel:'Đặt làm năm học hiện hành'}))return;try{await run(`year:${id}`,()=>setActiveSchoolYear(runtime(),id),'Đã chuyển năm học đang hoạt động.')}catch{return};context.selectSchoolYear(id);await auth.reload(null,id);context.hydrate(auth.legacyState)}
function yearWeeks(yearId:string){return data.value.weeks.filter(item=>item.schoolYearId===yearId).sort((a,b)=>a.number-b.number)}
function yearTemplates(yearId:string){return data.value.timetableTemplates.filter(item=>item.schoolYearId===yearId)}
function yearVersions(yearId:string){const ids=new Set(yearTemplates(yearId).map(item=>item.id));return data.value.timetableVersions.filter(item=>ids.has(item.templateId))}
function yearTimetableAssignments(yearId:string){return data.value.timetableAssignments.filter(item=>item.schoolYearId===yearId)}
function classesForYear(yearId:string){return data.value.classes.filter(item=>item.schoolYearId===yearId)}
async function saveYearWeek(input:{weekId:string;startDate:string;endDate:string}){try{await run(`week:${input.weekId}`,()=>updateSchoolYearWeek(runtime(),input),'Đã cập nhật lịch tuần chuẩn.')}catch{}}
async function createYearTimetable(input:{schoolYearId:string;name:string;config:TimetableConfig;generatedDays:GeneratedTimetableDay[]}){
  setTimetableFeedback({schoolYearId:input.schoolYearId,state:'saving',message:'Đang tạo mẫu TKB và lưu phiên bản đầu tiên…'})
  try{const result=await run(`timetable:${input.schoolYearId}`,()=>createTimetableTemplate(runtime(),input),'Đã tạo mẫu TKB và phiên bản đầu tiên.');const row=result as {template?:{id?:unknown};version?:{version_number?:unknown;version?:unknown}};const selectedTemplateId=String(row.template?.id??'');const version=Number(row.version?.version_number??row.version?.version??1)||1;setTimetableFeedback({schoolYearId:input.schoolYearId,state:'success',message:`Đã tạo TKB · phiên bản v${version}.`,selectedTemplateId:selectedTemplateId||undefined,version})}
  catch(error){setTimetableFeedback({schoolYearId:input.schoolYearId,state:'error',message:error instanceof Error?error.message:'Không tạo được mẫu TKB.'})}
}
async function saveYearTimetableVersion(input:{templateId:string;config:TimetableConfig;generatedDays:GeneratedTimetableDay[]}){
  const schoolYearId=data.value.timetableTemplates.find(item=>item.id===input.templateId)?.schoolYearId??''
  setTimetableFeedback({schoolYearId,state:'saving',message:'Đang lưu phiên bản TKB mới…',selectedTemplateId:input.templateId})
  try{const result=await run(`timetable:${input.templateId}`,()=>saveTimetableVersion(runtime(),input),'Đã lưu phiên bản TKB mới. Lịch sử phiên bản cũ được giữ nguyên.');const row=result as {version?:{version_number?:unknown;version?:unknown}};const version=Number(row.version?.version_number??row.version?.version??0)||undefined;setTimetableFeedback({schoolYearId,state:'success',message:version?`Đã lưu TKB · phiên bản v${version}.`:'Đã lưu phiên bản TKB mới.',selectedTemplateId:input.templateId,version})}
  catch(error){setTimetableFeedback({schoolYearId,state:'error',message:error instanceof Error?error.message:'Không lưu được phiên bản TKB.',selectedTemplateId:input.templateId})}
}
async function assignYearTimetable(input:{classId:string;schoolYearId:string;templateVersionId:string;effectiveFrom:string;effectiveTo:string}){try{await run(`timetable-assignment:${input.classId}`,()=>assignTimetableTemplate(runtime(),input),'Đã gán mẫu TKB theo khoảng hiệu lực.')}catch{}}
async function submitClass(){const code=classForm.code.trim().toUpperCase(),name=classForm.name.trim();if(!code||!name){status.value='error';statusMessage.value='Hãy nhập đủ mã lớp và tên lớp.';return}if(!selectedYearId.value){status.value='error';statusMessage.value='Hãy chọn năm học trước khi tạo lớp.';return}try{await run('create-class',()=>createClass(runtime(),{code,name,schoolYearId:selectedYearId.value}),'Đã tạo lớp.')}catch{return};classForm.code='';classForm.name='';showClassForm.value=false}
function editClass(id:string){editingClass.value=data.value.classes.find(row=>row.id===id)??null;classDialogError.value=''}
async function saveClassDialog(payload:{code:string;name:string}){const item=editingClass.value;if(!item)return;try{await run(`class:${item.id}`,()=>updateClass(runtime(),item.id,payload),'Đã cập nhật lớp.');editingClass.value=null}catch(error){classDialogError.value=error instanceof Error?error.message:'Không cập nhật được lớp.'}}
async function toggleClass(id:string){const item=data.value.classes.find(row=>row.id===id);if(!item)return;if(item.active&&!await appDialog.confirm({title:'Khóa lớp',body:'Khóa lớp này? Backend chỉ cho phép khi trạng thái hợp lệ.',confirmLabel:'Khóa lớp',danger:true}))return;try{await run(`class:${id}`,()=>updateClass(runtime(),id,{active:!item.active}),item.active?'Đã khóa lớp.':'Đã kích hoạt lớp.')}catch{}}
async function removeClass(id:string){const item=data.value.classes.find(row=>row.id===id);if(!item?.canDelete)return;if(!await appDialog.confirm({title:'Xóa lớp rỗng',body:`Xóa vĩnh viễn lớp rỗng ${item.code}? Thao tác không thể khôi phục.`,confirmLabel:'Xóa vĩnh viễn',danger:true}))return;try{await run(`class:${id}`,()=>deleteClass(runtime(),id),'Đã xóa lớp rỗng.')}catch{}}

function openCreateLearner(){userDialogKind.value='learner';editingLearner.value=null;editingTeacher.value=null;userDialogError.value='';userDialogOpen.value=true}
function openEditLearner(user:DirectoryUser){userDialogKind.value='learner';editingLearner.value=user;editingTeacher.value=null;userDialogError.value='';userDialogOpen.value=true}
function openCreateTeacher(){userDialogKind.value='teacher';editingTeacher.value=null;editingLearner.value=null;userDialogError.value='';userDialogOpen.value=true}
function openEditTeacher(teacher:AdminTeacherRecord){userDialogKind.value='teacher';editingTeacher.value=teacher;editingLearner.value=null;userDialogError.value='';userDialogOpen.value=true}
async function saveUser(payload:TeacherUserChanges){
  userDialogError.value='';const editing=userDialogKind.value==='learner'?editingLearner.value:editingTeacher.value
  const isEdit=Boolean(editing);busyKey.value='user-dialog';status.value='saving';statusMessage.value=isEdit?'Đang lưu và đồng bộ tài khoản…':'Đang tạo tài khoản…'
  try{
    let result:unknown
    if(userDialogKind.value==='learner'){
      if(editingLearner.value)await updateManagedUser(runtime(),editingLearner.value.id,payload)
      else result=await createManagedUser(runtime(),payload)
    }else{
      const teacherPayload={...payload,role:'teacher' as const,classId:null}
      if(editingTeacher.value)await updateTeacher(runtime(),editingTeacher.value.id,teacherPayload)
      else result=await createTeacher(runtime(),teacherPayload)
    }
    userDialogOpen.value=false;status.value='success';statusMessage.value=isEdit?'Đã lưu tài khoản.':'Đã tạo tài khoản.'
    const password=String((result as {password?:unknown}|undefined)?.password??'');if(password)statusMessage.value+=` Mật khẩu tạm: ${password}`
  }catch(error){userDialogError.value=error instanceof Error?error.message:'Không lưu được tài khoản.';status.value='error';statusMessage.value=userDialogError.value}
  finally{busyKey.value=null}
}
async function toggleStudent(user:DirectoryUser){try{await run(`student:${user.id}`,()=>updateManagedUser(runtime(),user.id,{changeCode:false,code:user.code,fullName:user.fullName,role:user.role,classId:user.classId,active:!user.active}),user.active?'Đã khóa tài khoản.':'Đã khôi phục tài khoản.')}catch{}}
async function toggleTeacher(id:string){const teacher=data.value.teachers.find(row=>row.id===id);if(!teacher)return;try{await run(`teacher:${id}`,()=>updateTeacher(runtime(),id,{changeCode:false,code:teacher.code,fullName:teacher.fullName,role:'teacher',classId:null,active:!teacher.active}),teacher.active?'Đã khóa giáo viên.':'Đã mở khóa giáo viên.')}catch{}}
function openPassword(target:{id:string;code:string;fullName?:string;name?:string}){passwordError.value='';passwordTarget.value={id:target.id,code:target.code,name:target.fullName??target.name??target.code}}
async function savePassword(password:string){if(!passwordTarget.value)return;const target=passwordTarget.value;busyKey.value=`password:${target.id}`;status.value='saving';statusMessage.value='Đang đặt lại mật khẩu…';try{await resetManagedPassword(target.id,password);status.value='success';statusMessage.value=`Đã đặt lại mật khẩu cho ${target.code}.`;passwordTarget.value=null}catch(error){passwordError.value=error instanceof Error?error.message:'Không đặt lại được mật khẩu.';status.value='error';statusMessage.value=passwordError.value}finally{busyKey.value=null}}
async function hardDeleteConfirmation(code:string,label:string){const typedCode=await appDialog.prompt({title:`Xóa vĩnh viễn ${label}`,body:'Bước 1/2 · Thao tác này KHÔNG THỂ khôi phục.',label:`Nhập mã ${code} để xác nhận`,placeholder:code,confirmLabel:'Tiếp tục',danger:true,validate:value=>value.trim().toUpperCase()===code.toUpperCase()?null:'Mã xác nhận chưa đúng.'});if(!typedCode)return null;const typedPhrase=await appDialog.prompt({title:`Xóa vĩnh viễn ${label}`,body:'Bước 2/2 · Xác nhận lần cuối.',label:'Nhập chính xác: XÓA VĨNH VIỄN',placeholder:'XÓA VĨNH VIỄN',confirmLabel:'Xóa vĩnh viễn',danger:true,validate:value=>value.trim().toUpperCase()==='XÓA VĨNH VIỄN'?null:'Cụm từ xác nhận chưa đúng.'});if(!typedPhrase)return null;return{confirmCode:typedCode.trim().toUpperCase(),phrase:typedPhrase.trim().toUpperCase()}}
async function hardDeleteLearner(user:DirectoryUser){const confirmation=await hardDeleteConfirmation(user.code,user.fullName||user.code);if(!confirmation)return;try{await run(`hard:${user.id}`,()=>hardDeleteUser(runtime(),user.id,confirmation.confirmCode,confirmation.phrase),'Đã xóa vĩnh viễn học sinh/cán sự.')}catch{}}
async function hardDeleteTeacher(id:string){const teacher=data.value.teachers.find(row=>row.id===id);if(!teacher)return;if(assignedClasses(id).length){status.value='error';statusMessage.value='Hãy gỡ toàn bộ phân công lớp trước khi xóa vĩnh viễn giáo viên.';return}const confirmation=await hardDeleteConfirmation(teacher.code,teacher.fullName||teacher.code);if(!confirmation)return;try{await run(`hard:${id}`,()=>hardDeleteUser(runtime(),id,confirmation.confirmCode,confirmation.phrase),'Đã xóa vĩnh viễn giáo viên.')}catch{}}
async function permission(payload:{classId:string;teacherId:string;enabled:boolean}){const key=`${payload.classId}:${payload.teacherId}`;try{await run(key,()=>assignTeacher(runtime(),payload.classId,payload.teacherId,payload.enabled),'Đã cập nhật phân quyền giáo viên.')}catch{}}
</script>

<template>
  <div class="page-stack admin-page">
    <header class="admin-header"><div><span class="page-context"><ShieldCheck/>ROOT ADMIN · QUẢN TRỊ HỆ THỐNG</span><h1>{{ tab==='overview'?'Tổng quan hệ thống':tab==='years'?'Năm học':tab==='classes'?'Lớp học':tab==='students'?'Học sinh':tab==='teachers'?'Giáo viên':tab==='permissions'?'Phân quyền':tab==='recycle'?'Thùng rác':'Nhật ký hệ thống' }}</h1><p>Admin quản lý cấu trúc, tài khoản và quyền hệ thống; nghiệp vụ vận hành lớp thuộc Giáo viên.</p></div><AppButton v-if="tab!=='audit'" variant="secondary" :loading="directory.isFetching.value" @click="directory.refetch()"><RefreshCw/>Làm mới</AppButton></header>
    <InlineStatus :state="status" :message="statusMessage"/>

    <template v-if="tab==='overview'">
      <section class="summary"><AppCard padding="lg"><span><CalendarDays/>Năm học</span><b>{{ schoolYearCount }}</b></AppCard><AppCard padding="lg"><span><Building2/>Lớp hoạt động</span><b>{{ activeClasses.length }}</b></AppCard><AppCard padding="lg"><span><GraduationCap/>HS/Cán sự hoạt động</span><b>{{ activeLearners.length }}</b></AppCard><AppCard padding="lg"><span><UserCog/>Giáo viên hoạt động</span><b>{{ activeTeachers.length }}</b></AppCard><AppCard padding="lg"><span><ShieldCheck/>Phân quyền</span><b>{{ activeAssignments.length }}</b></AppCard></section>
      <AppCard padding="lg" class="overview-copy"><h2>Ngữ cảnh hiện tại: {{ selectedYear?.name||'Chưa có năm học' }}</h2><p>Năm học quyết định danh sách lớp và lịch chuẩn. Các thao tác xóa vĩnh viễn đều được kiểm quyền ở backend và ghi vào Nhật ký hệ thống.</p></AppCard>
    </template>

    <template v-else-if="tab==='years'">
      <div class="section-actions"><div><h2>Năm học</h2><p>{{ schoolYearCount }} năm học. Mỗi năm có thể có nhiều mẫu thời khóa biểu.</p></div><AppButton @click="showYearForm=!showYearForm"><Plus/>Tạo năm học</AppButton></div>
      <AppCard v-if="showYearForm" padding="md"><form class="quick-form year-form" novalidate @submit.prevent="submitYear"><label>Tên năm học<input v-model="yearForm.name" required maxlength="40" placeholder="2027–2028"></label><label>Ngày bắt đầu tuần 1<input v-model="yearForm.startDate" type="date" required></label><label>Ngày kết thúc năm học<input v-model="yearForm.endDate" type="date" required></label><label class="check-field"><input v-model="yearForm.setActive" type="checkbox">Đặt là năm học đang hoạt động</label><AppButton type="submit" :loading="busyKey==='create-year'">Tạo năm học</AppButton></form></AppCard>
      <section class="year-grid"><AdminSchoolYearCard v-for="item in mergedSchoolYears" :key="item.id" :item="item" :weeks="yearWeeks(item.id)" :classes="classesForYear(item.id)" :templates="yearTemplates(item.id)" :versions="yearVersions(item.id)" :assignments="yearTimetableAssignments(item.id)" :busy="busyKey===`year:${item.id}`" :busy-week-id="busyKey?.startsWith('week:')?busyKey.slice(5):null" :busy-timetable="timetableBusyForYear(item.id)" :timetable-feedback="timetableFeedback?.schoolYearId===item.id?timetableFeedback:undefined" :busy-assignment="Boolean(busyKey?.startsWith('timetable-assignment:'))" @activate="activateYear" @save-week="saveYearWeek" @create-template="createYearTimetable" @save-version="saveYearTimetableVersion" @assign-template="assignYearTimetable"/></section>
    </template>

    <template v-else-if="tab==='classes'">
      <div class="section-actions"><div><h2>Lớp học · {{ selectedYear?.name||'—' }}</h2><p>{{ yearClasses.length }} lớp trong năm học đang chọn.</p></div><AppButton :disabled="!selectedYearId" @click="showClassForm=!showClassForm"><Plus/>Tạo lớp</AppButton></div>
      <AppCard v-if="showClassForm" padding="md"><form class="quick-form" novalidate @submit.prevent="submitClass"><label>Mã lớp<input v-model="classForm.code" required maxlength="40" placeholder="7A1"></label><label>Tên lớp<input v-model="classForm.name" required maxlength="120" placeholder="Lớp 7A1"></label><AppButton type="submit" :loading="busyKey==='create-class'">Tạo lớp</AppButton></form></AppCard>
      <section class="class-grid"><AdminClassCard v-for="item in yearClasses" :key="item.id" :item="item" :teachers="assignedTeachers(item.id)" :busy="busyKey===`class:${item.id}`" @edit="editClass(item.id)" @toggle="toggleClass(item.id)" @delete="removeClass(item.id)"/></section>
    </template>

    <template v-else-if="tab==='students'">
      <div class="section-actions"><div><h2>Học sinh & Cán sự</h2><p>{{ learners.length }} tài khoản trên toàn hệ thống; sửa và đặt lại mật khẩu bằng hộp thoại trực quan.</p></div><AppButton @click="openCreateLearner"><Plus/>Tạo học sinh</AppButton></div>
      <AppCard padding="md"><div class="student-filters"><input v-model="studentSearch" placeholder="Tìm tên, mã, lớp..."><select v-model="studentYearFilter"><option value="">Tất cả năm học</option><option v-for="year in mergedSchoolYears" :key="year.id" :value="year.id">{{ year.name }}</option></select><select v-model="studentClassFilter"><option value="">Tất cả lớp</option><option v-for="item in data.classes" :key="item.id" :value="item.id">{{ item.code }}</option></select><select v-model="studentRoleFilter"><option value="">HS + Cán sự</option><option value="student">Học sinh</option><option value="monitor">Cán sự</option></select><select v-model="studentStatusFilter"><option value="">Mọi trạng thái</option><option value="active">Hoạt động</option><option value="inactive">Đã khóa</option></select></div></AppCard>
      <section class="student-grid"><AdminStudentCard v-for="user in filteredLearners" :key="user.id" :user="user" :class-label="classById.get(user.classId||'')?.code||'Chưa có lớp'" :busy="busyKey===`student:${user.id}`||busyKey===`hard:${user.id}`" @edit="openEditLearner(user)" @toggle="toggleStudent(user)" @reset="openPassword(user)" @hard-delete="hardDeleteLearner(user)"/></section>
    </template>

    <template v-else-if="tab==='teachers'">
      <div class="section-actions"><div><h2>Giáo viên</h2><p>{{ data.teachers.length }} tài khoản. Admin có thể chỉnh sửa, đặt lại mật khẩu và xóa vĩnh viễn khi đã gỡ hết phân công.</p></div><AppButton @click="openCreateTeacher"><Plus/>Tạo giáo viên</AppButton></div>
      <section class="teacher-grid"><AdminTeacherCard v-for="teacher in data.teachers" :key="teacher.id" :teacher="teacher" :classes="assignedClasses(teacher.id)" :busy="busyKey===`teacher:${teacher.id}`||busyKey===`hard:${teacher.id}`" @edit="openEditTeacher(teacher)" @toggle="toggleTeacher(teacher.id)" @reset="openPassword(teacher)" @hard-delete="hardDeleteTeacher(teacher.id)"/></section>
    </template>

    <template v-else-if="tab==='permissions'">
      <div class="section-actions"><div><h2>Phân quyền · {{ selectedYear?.name||'—' }}</h2><p>Bật/tắt quyền phụ trách từng lớp trong năm học đang chọn.</p></div></div><AppCard padding="lg"><PermissionMatrix :classes="activeClasses" :teachers="data.teachers" :assignments="data.assignments" :busy-key="busyKey" @change="permission"/></AppCard>
    </template>

    <AdminRecycleBin v-else-if="tab==='recycle'"/>

    <AdminAuditLog v-else-if="tab==='audit'"/>

    <AdminClassDialog :open="Boolean(editingClass)" :item="editingClass" :saving="Boolean(editingClass&&busyKey===`class:${editingClass.id}`)" :error="classDialogError" @close="editingClass=null" @save="saveClassDialog"/>
    <AdminUserDialog :open="userDialogOpen" :kind="userDialogKind" :user="dialogUser" :classes="data.classes" :saving="busyKey==='user-dialog'" :error="userDialogError" @close="userDialogOpen=false" @save="saveUser"/>
    <AdminPasswordDialog :open="Boolean(passwordTarget)" :name="passwordTarget?.name" :code="passwordTarget?.code" :saving="Boolean(passwordTarget&&busyKey===`password:${passwordTarget.id}`)" :error="passwordError" @close="passwordTarget=null" @save="savePassword"/>
  </div>
</template>

<style scoped>
.admin-page{max-width:1560px;margin:0 auto}.admin-header,.section-actions{display:flex;justify-content:space-between;align-items:flex-start;gap:16px}.admin-header h1{margin:8px 0;font-size:clamp(2rem,4vw,3rem)}.admin-header p,.section-actions p,.overview-copy p{margin:0;color:var(--text-muted)}.page-context{display:flex;align-items:center;gap:7px;color:var(--color-primary);font-size:var(--font-size-ui-min);font-weight:900;letter-spacing:.04em}.page-context svg,.admin-header :deep(svg),.section-actions :deep(svg){width:17px}.summary{display:grid;grid-template-columns:repeat(5,1fr);gap:11px}.summary :deep(.app-card){display:flex;align-items:center;justify-content:space-between}.summary span{display:flex;align-items:center;gap:7px;color:var(--text-muted);font-weight:800}.summary svg{width:18px}.summary b{font-size:1.8rem}.overview-copy h2,.section-actions h2{margin:0 0 5px}.year-grid{display:grid;grid-template-columns:1fr;gap:11px}.class-grid,.student-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:11px}.teacher-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:11px}.quick-form{display:grid;grid-template-columns:1fr 2fr auto;gap:10px;align-items:end}.quick-form.year-form{grid-template-columns:1.1fr 1fr 1fr 1.3fr auto}.quick-form label{display:grid;gap:5px;font-size:var(--font-size-ui-min);font-weight:800;color:var(--text-muted)}.quick-form input,.student-filters input,.student-filters select{min-height:44px;border:1px solid var(--border);border-radius:11px;background:var(--surface);color:var(--text);padding:8px 10px}.quick-form .check-field{display:flex;align-items:center;gap:8px;min-height:44px;padding:8px 10px;border:1px solid var(--border);border-radius:11px;background:color-mix(in srgb,var(--wash-cream) 48%,var(--surface));color:var(--text)}.quick-form .check-field input{min-height:0;width:17px;height:17px}.student-filters{display:grid;grid-template-columns:minmax(220px,1.5fr) repeat(4,minmax(130px,.7fr));gap:8px}@media(max-width:1180px){.summary{grid-template-columns:repeat(3,1fr)}.quick-form.year-form{grid-template-columns:1fr 1fr}.teacher-grid{grid-template-columns:repeat(2,1fr)}.quick-form{grid-template-columns:1fr 1fr}.quick-form :deep(.app-button){width:100%}.student-filters{grid-template-columns:1fr 1fr}}@media(max-width:720px){.admin-header,.section-actions{flex-direction:column}.summary,.year-grid,.class-grid,.student-grid,.teacher-grid{grid-template-columns:1fr}.quick-form,.quick-form.year-form,.student-filters{grid-template-columns:1fr}.admin-header :deep(.app-button),.section-actions :deep(.app-button){width:100%}}
</style>
