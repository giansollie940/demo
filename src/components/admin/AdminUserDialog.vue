<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { GraduationCap, UserCog } from 'lucide-vue-next'
import AppButton from '../ui/AppButton.vue'
import type { DirectoryUser, UserRole } from '../../types/legacy'
import type { AdminClassRecord, AdminTeacherRecord } from '../../features/admin/admin-directory'

type Kind='learner'|'teacher'
const props=withDefaults(defineProps<{open:boolean;kind:Kind;user?:DirectoryUser|AdminTeacherRecord|null;classes?:AdminClassRecord[];saving?:boolean;error?:string}>(),{user:null,classes:()=>[],saving:false,error:''})
const emit=defineEmits<{close:[];save:[value:{changeCode:boolean;code:string;fullName:string;role:UserRole;classId:string|null;active:boolean;password:string}]}>()
const form=reactive({changeCode:false,code:'',fullName:'',role:'student' as UserRole,classId:'',active:true,password:''})
const editing=computed(()=>Boolean(props.user))
const title=computed(()=>`${editing.value?'Chỉnh sửa':'Tạo'} ${props.kind==='teacher'?'giáo viên':'học sinh / cán sự'}`)
watch(()=>[props.open,props.kind,(props.user as {id?:string}|null)?.id] as const,()=>{touched.value=false;
  const user=props.user as (DirectoryUser&AdminTeacherRecord)|null
  form.changeCode=!user
  form.code=user?.code??''
  form.fullName=('fullName' in (user??{})?user?.fullName:'')??''
  form.role=props.kind==='teacher'?'teacher':((user as DirectoryUser|null)?.role??'student')
  form.classId=(user as DirectoryUser|null)?.classId??props.classes.find(item=>item.active)?.id??''
  form.active=user?.active!==false
  form.password=''
},{immediate:true})
// novalidate + tự báo lỗi ngay dưới ô nhập: bong bóng mặc định của trình duyệt
// không theo theme và không nói được luật mã đăng nhập; nếu chỉ tắt nó thì bấm
// Lưu sẽ im lặng không phản hồi gì.
const touched=ref(false)
const codeInvalid=computed(()=>touched.value&&!/^[A-Z0-9._-]{2,32}$/.test(form.code.trim().toUpperCase()))
const nameInvalid=computed(()=>touched.value&&!form.fullName.trim())
const classInvalid=computed(()=>touched.value&&props.kind==='learner'&&!form.classId)
function submit(){
  touched.value=true
  const code=form.code.trim().toUpperCase(),fullName=form.fullName.trim()
  if(!/^[A-Z0-9._-]{2,32}$/.test(code)||!fullName)return
  if(props.kind==='learner'&&!form.classId)return
  emit('save',{...form,code,fullName,role:props.kind==='teacher'?'teacher':form.role,classId:props.kind==='teacher'?null:form.classId||null})
}
</script>
<template>
  <div v-if="open" class="backdrop" @click.self="emit('close')" @keydown.esc="emit('close')">
    <section class="dialog" role="dialog" aria-modal="true" aria-labelledby="adminUserDialogTitle">
      <header><span class="dialog-icon"><UserCog v-if="kind==='teacher'"/><GraduationCap v-else/></span><div><small>QUẢN TRỊ TÀI KHOẢN</small><h2 id="adminUserDialogTitle">{{ title }}</h2></div></header>
      <p class="lead">Điền toàn bộ thông tin trong một biểu mẫu. Sau khi lưu, danh sách sẽ cập nhật ngay và tiếp tục đồng bộ với cơ sở dữ liệu.</p>
      <div v-if="error" class="error">{{ error }}</div>
      <form novalidate @submit.prevent="submit">
        <label v-if="editing" class="toggle"><input v-model="form.changeCode" type="checkbox"><span><b>Đổi mã đăng nhập</b><small>Tắt để giữ nguyên mã hiện tại.</small></span></label>
        <div class="form-grid">
          <label>Mã đăng nhập<input v-model="form.code" :disabled="editing&&!form.changeCode" maxlength="32" required :aria-invalid="codeInvalid"><small v-if="codeInvalid" class="field-error" role="alert">Mã đăng nhập cần 2–32 ký tự, chỉ gồm chữ, số và . _ -</small></label>
          <label>Họ và tên<input v-model="form.fullName" maxlength="120" required :aria-invalid="nameInvalid"><small v-if="nameInvalid" class="field-error" role="alert">Hãy nhập họ tên.</small></label>
          <label v-if="kind==='learner'">Vai trò<select v-model="form.role"><option value="student">Học sinh</option><option value="monitor">Cán sự lớp</option></select></label>
          <label v-if="kind==='learner'">Lớp<select v-model="form.classId" required :aria-invalid="classInvalid"><option value="">Chọn lớp</option><option v-for="item in classes.filter(row=>row.active)" :key="item.id" :value="item.id">{{ item.code }} · {{ item.name }}</option></select></label>
          <label v-if="!editing" class="wide">Mật khẩu tạm<input v-model="form.password" type="password" autocomplete="new-password" placeholder="Để trống để hệ thống tự sinh"><small>Nếu nhập: tối thiểu 8 ký tự, gồm chữ và số.</small></label>
        </div>
        <label v-if="editing" class="toggle"><input v-model="form.active" type="checkbox"><span><b>Tài khoản đang hoạt động</b><small>Tắt để khóa mềm; dữ liệu lịch sử vẫn được giữ.</small></span></label>
        <div class="actions"><AppButton variant="secondary" :disabled="saving" @click="emit('close')">Hủy</AppButton><AppButton type="submit" :loading="saving">{{ editing?'Lưu thay đổi':'Tạo tài khoản' }}</AppButton></div>
      </form>
    </section>
  </div>
</template>
<style scoped>
.backdrop{position:fixed;inset:0;z-index:120;background:var(--overlay);display:grid;place-items:center;padding:18px}.dialog{width:min(680px,100%);max-height:92vh;overflow:auto;border:1px solid var(--border);border-radius:24px;background:var(--surface-raised);padding:22px;box-shadow:var(--shadow-md)}header{display:flex;align-items:center;gap:12px}.dialog-icon{width:46px;height:46px;border-radius:15px;display:grid;place-items:center;background:linear-gradient(145deg,var(--wash-peach),var(--wash-violet));color:var(--color-primary)}.dialog-icon svg{width:23px}header small{color:var(--color-primary);font-size:var(--font-size-ui-min);font-weight:900;letter-spacing:.08em}h2{margin:3px 0 0}.lead{margin:10px 0 16px;color:var(--text-muted);line-height:1.55}.field-error{color:var(--color-danger);font-weight:800}input[aria-invalid="true"],select[aria-invalid="true"]{border-color:var(--color-danger)}.error{margin-bottom:12px;padding:10px 12px;border:1px solid color-mix(in srgb,var(--color-danger) 30%,var(--border));border-radius:12px;background:color-mix(in srgb,var(--color-danger) 7%,var(--surface));color:var(--color-danger);font-weight:750}form{display:grid;gap:13px}.form-grid{display:grid;grid-template-columns:1fr 1.25fr;gap:12px}.form-grid label{display:grid;gap:6px;font-weight:800}.form-grid input,.form-grid select{min-height:46px;border:1px solid var(--border);border-radius:12px;background:var(--input);color:var(--text);padding:9px 11px}.form-grid small{color:var(--text-muted);font-weight:500}.wide{grid-column:1/-1}.toggle{display:grid;grid-template-columns:auto 1fr;align-items:start;gap:10px;padding:11px 12px;border:1px solid var(--border);border-radius:13px;background:var(--surface-soft)}.toggle input{margin-top:4px}.toggle span{display:grid;gap:2px}.toggle small{color:var(--text-muted);font-weight:500}.actions{display:flex;justify-content:flex-end;gap:8px;margin-top:3px}@media(max-width:600px){.backdrop{align-items:end;padding:8px}.dialog{border-radius:24px 24px 16px 16px}.form-grid{grid-template-columns:1fr}.wide{grid-column:auto}.actions{display:grid;grid-template-columns:1fr}.actions :deep(.app-button){width:100%}}
</style>
