<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { GraduationCap, UsersRound } from 'lucide-vue-next'
import AppCard from '../ui/AppCard.vue'
import RemoteUserAvatar from './RemoteUserAvatar.vue'
import { legacyApi } from '../../services/legacy-supabase'
import { useAuthStore } from '../../stores/auth'

type Person={id:string;studentCode:string;fullName:string;role:'student'|'monitor'|'teacher'}
const auth=useAuthStore()
const people=ref<Person[]>([])
const loading=ref(true)
const failed=ref(false)

const teachers=computed(()=>people.value.filter(person=>person.role==='teacher'))
const learners=computed(()=>people.value.filter(person=>person.role!=='teacher'))
const learnerRole=(role:Person['role'])=>role==='monitor'?'Cán sự':'Học sinh'

async function load(){
  loading.value=true
  failed.value=false
  try{
    const client=await legacyApi.init() as {
      rpc:(name:string,args?:Record<string,unknown>)=>Promise<{data:Array<Record<string,unknown>>|null;error:unknown|null}>
    }
    const {data,error}=await client.rpc('visible_class_people')
    if(error)throw error
    people.value=(Array.isArray(data)?data:[]).map(row=>({
      id:String(row.id??''),
      studentCode:String(row.student_code??''),
      fullName:String(row.full_name??''),
      role:String(row.role??'student') as Person['role'],
    })).filter(person=>person.id&&person.fullName)
  }catch{
    failed.value=true
    people.value=[]
  }finally{
    loading.value=false
  }
}

onMounted(load)
</script>

<template>
  <AppCard padding="lg" class="class-people-panel">
    <header class="panel-heading">
      <div><span>THÀNH VIÊN LỚP</span><h2>Bạn học và giáo viên</h2><p>Những thành viên thuộc lớp hiện tại và giáo viên được phân công.</p></div>
      <UsersRound aria-hidden="true"/>
    </header>

    <div v-if="loading" class="people-state">Đang tải thành viên lớp…</div>
    <div v-else-if="failed" class="people-state">Chưa tải được danh sách thành viên lớp.</div>
    <div v-else class="people-groups">
      <section v-if="teachers.length" class="people-group">
        <div class="group-title"><GraduationCap aria-hidden="true"/><b>Giáo viên</b><span>{{ teachers.length }}</span></div>
        <div class="people-grid teacher-grid">
          <article v-for="person in teachers" :key="person.id" class="person-card teacher-card">
            <RemoteUserAvatar :user-id="person.id" :name="person.fullName" size="md"/>
            <div><b>{{ person.fullName }}</b><small>Giáo viên của lớp</small></div>
          </article>
        </div>
      </section>

      <section v-if="learners.length" class="people-group">
        <div class="group-title"><UsersRound aria-hidden="true"/><b>Thành viên lớp</b><span>{{ learners.length }}</span></div>
        <div class="people-grid">
          <article v-for="person in learners" :key="person.id" class="person-card">
            <RemoteUserAvatar :user-id="person.id" :name="person.fullName" :code="person.studentCode" size="sm"/>
            <div><b>{{ person.fullName }}<em v-if="person.id===auth.currentUser?.id">Bạn</em></b><small>{{ learnerRole(person.role) }}</small></div>
          </article>
        </div>
      </section>

      <div v-if="!teachers.length&&!learners.length" class="people-state">Chưa có thành viên lớp để hiển thị.</div>
    </div>
  </AppCard>
</template>

<style scoped>
.class-people-panel{display:grid;gap:18px}.panel-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:18px}.panel-heading>div>span{color:var(--color-primary);font-size:var(--font-size-ui-min);font-weight:900;letter-spacing:.07em}.panel-heading h2{margin:5px 0}.panel-heading p{margin:0;color:var(--text-muted)}.panel-heading>svg{width:30px;color:var(--color-primary);flex:none}.people-groups{display:grid;gap:18px}.people-group{display:grid;gap:10px}.group-title{display:flex;align-items:center;gap:7px}.group-title svg{width:17px;color:var(--color-primary)}.group-title span{margin-left:auto;padding:3px 7px;border-radius:999px;background:var(--surface-soft);color:var(--text-muted);font-size:var(--font-size-ui-min);font-weight:850}.people-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.teacher-grid{grid-template-columns:repeat(3,minmax(0,1fr))}.person-card{display:flex;align-items:center;gap:10px;min-width:0;padding:10px 11px;border:1px solid var(--border);border-radius:14px;background:linear-gradient(145deg,var(--surface),var(--surface-soft))}.teacher-card{background:linear-gradient(145deg,var(--surface),color-mix(in srgb,var(--wash-mint) 55%,var(--surface)))}.person-card>div{min-width:0;display:grid;gap:3px}.person-card b{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.88rem}.person-card small{color:var(--text-muted);font-size:var(--font-size-ui-min)}.person-card em{display:inline-flex;margin-left:6px;padding:2px 6px;border-radius:999px;background:var(--wash-violet);color:var(--color-primary);font-size:.66rem;font-style:normal;vertical-align:middle}.people-state{padding:14px;border-radius:13px;background:var(--surface-soft);color:var(--text-muted);text-align:center}@media(max-width:980px){.people-grid,.teacher-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:620px){.panel-heading>svg{display:none}.people-grid,.teacher-grid{grid-template-columns:1fr}}
</style>
