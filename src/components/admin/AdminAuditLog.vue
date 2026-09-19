<script setup lang="ts">
import { computed, ref } from 'vue'
import { AlertTriangle, RefreshCw, Search, X } from 'lucide-vue-next'
import { useQuery } from '@tanstack/vue-query'
import AppButton from '../ui/AppButton.vue'
import AppCard from '../ui/AppCard.vue'
import { legacyApi } from '../../services/legacy-supabase'

type AuditRow={id:string|number;actorId?:string|null;actorName?:string|null;classId?:string|null;classCode?:string|null;action:string;entityType:string;entityId?:string|null;oldData?:unknown;newData?:unknown;source?:string;createdAt:string}
const search=ref(''),actor=ref(''),action=ref(''),entity=ref(''),fromDate=ref(''),toDate=ref(''),selected=ref<AuditRow|null>(null)
const query=useQuery({
  queryKey:['admin-audit-log'],
  queryFn:async()=>{
    const raw=await legacyApi.adminListAudit({limit:250})
    return raw.logs as AuditRow[]
  },
  staleTime:10_000,
  retry:1,
})
const rows=computed(()=>{
  const q=search.value.trim().toLowerCase()
  return (query.data.value??[]).filter(row=>{
    const stamp=String(row.createdAt||'').slice(0,10)
    if(fromDate.value&&stamp<fromDate.value)return false
    if(toDate.value&&stamp>toDate.value)return false
    if(actor.value&&String(row.actorName||'')!==actor.value)return false
    if(action.value&&row.action!==action.value)return false
    if(entity.value&&row.entityType!==entity.value)return false
    if(!q)return true
    return [row.actorName,row.classCode,row.action,row.entityType,row.entityId].some(value=>String(value??'').toLowerCase().includes(q))
  })
})
const actors=computed(()=>[...new Set((query.data.value??[]).map(row=>String(row.actorName||'')).filter(Boolean))].sort())
const actions=computed(()=>[...new Set((query.data.value??[]).map(row=>row.action).filter(Boolean))].sort())
const entities=computed(()=>[...new Set((query.data.value??[]).map(row=>row.entityType).filter(Boolean))].sort())
const hasAuditData=computed(()=>(query.data.value?.length??0)>0)
const queryErrorMessage=computed(()=>{
  const error=query.error.value
  return error instanceof Error&&error.message?error.message:'Không xác định được lỗi backend.'
})
const queryErrorCode=computed(()=>String((query.error.value as (Error&{code?:string})|null)?.code||''))
const queryErrorHelp=computed(()=>{
  if(queryErrorCode.value==='AUDIT_EDGE_OUTDATED') return 'Chỉ cần deploy lại Edge Function audit-log từ đúng gói release hiện tại. Database không cần chạy lại nếu VERIFY đang overall=true.'
  if(queryErrorCode.value==='AUDIT_SCHEMA_NOT_READY'||/schema.*nhật ký|audit.*schema/i.test(queryErrorMessage.value)) return 'Edge Function đã phản hồi nhưng schema Audit chưa sẵn sàng. Hãy chạy SQL upgrade/VERIFY của phiên bản đang dùng.'
  if(queryErrorCode.value==='AUDIT_INVALID_RESPONSE') return 'Backend đang trả một contract Audit không nhận diện được. Hãy kiểm tra frontend và Edge Function audit-log có cùng phiên bản release.'
  return 'Hãy kiểm tra quyền Root Admin, Edge Function audit-log và trạng thái kết nối Supabase.'
})
const pretty=(value:unknown)=>value==null?'—':JSON.stringify(value,null,2)
const when=(value:string)=>{const d=new Date(value);return Number.isFinite(d.getTime())?d.toLocaleString('vi-VN'):value}
</script>
<template>
  <section class="audit-section">
    <div class="audit-heading"><div><h2>Nhật ký hệ thống</h2><p>Theo dõi các thay đổi quản trị đã được backend ghi nhận.</p></div><AppButton variant="secondary" :loading="query.isFetching.value" @click="query.refetch()"><RefreshCw/>Làm mới</AppButton></div>

    <AppCard v-if="query.isError.value" padding="md">
      <div class="audit-error" role="alert">
        <AlertTriangle aria-hidden="true"/>
        <div><b>Không tải được Nhật ký hệ thống</b><p>{{ queryErrorMessage }}</p><small>{{ queryErrorHelp }}</small></div>
        <AppButton variant="secondary" @click="query.refetch()"><RefreshCw/>Thử lại</AppButton>
      </div>
    </AppCard>

    <template v-else>
      <AppCard padding="md"><div class="filters"><label class="search"><Search/><input v-model="search" placeholder="Tìm hành động, người thực hiện, lớp..."></label><select v-model="actor"><option value="">Tất cả người thực hiện</option><option v-for="value in actors" :key="value">{{ value }}</option></select><select v-model="action"><option value="">Tất cả hành động</option><option v-for="value in actions" :key="value">{{ value }}</option></select><select v-model="entity"><option value="">Tất cả đối tượng</option><option v-for="value in entities" :key="value">{{ value }}</option></select><input v-model="fromDate" type="date" aria-label="Từ ngày"><input v-model="toDate" type="date" aria-label="Đến ngày"></div></AppCard>
      <AppCard padding="none"><div class="table-wrap"><table><thead><tr><th>Thời gian</th><th>Người thực hiện</th><th>Hành động</th><th>Đối tượng</th><th>Lớp</th><th>Kết quả</th></tr></thead><tbody><tr v-for="row in rows" :key="row.id" tabindex="0" @click="selected=row" @keydown.enter="selected=row"><td>{{ when(row.createdAt) }}</td><td>{{ row.actorName||'Tài khoản đã xóa' }}</td><td><b>{{ row.action }}</b></td><td>{{ row.entityType }}</td><td>{{ row.classCode||'—' }}</td><td><span class="ok">Đã ghi nhận</span></td></tr><tr v-if="query.isPending.value"><td colspan="6" class="empty">Đang tải Nhật ký hệ thống...</td></tr><tr v-else-if="!rows.length"><td colspan="6" class="empty">{{ hasAuditData?'Không có nhật ký phù hợp bộ lọc.':'Chưa có nhật ký hệ thống. Các thao tác quản trị mới sẽ xuất hiện tại đây.' }}</td></tr></tbody></table></div></AppCard>
    </template>

    <div v-if="selected" class="audit-drawer-backdrop" @click.self="selected=null"><aside class="audit-detail drawer" aria-label="Chi tiết nhật ký"><header><div><small>{{ when(selected.createdAt) }}</small><h3>{{ selected.action }}</h3><p>{{ selected.actorName||'Tài khoản đã xóa' }} · {{ selected.entityType }}</p></div><button type="button" aria-label="Đóng" @click="selected=null"><X/></button></header><section><h4>Trước thay đổi</h4><pre>{{ pretty(selected.oldData) }}</pre></section><section><h4>Sau thay đổi</h4><pre>{{ pretty(selected.newData) }}</pre></section></aside></div>
  </section>
</template>
<style scoped>
.audit-section{display:grid;gap:12px}.audit-heading{display:flex;justify-content:space-between;gap:14px;align-items:flex-start}.audit-heading h2{margin:0 0 5px}.audit-heading p{margin:0;color:var(--text-muted)}.audit-error{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:14px;padding:4px}.audit-error>svg{width:28px;height:28px;color:var(--color-danger)}.audit-error b{display:block;color:var(--color-danger)}.audit-error p{margin:4px 0;color:var(--text)}.audit-error small{color:var(--text-muted);line-height:1.45}.audit-error code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace}.filters{display:grid;grid-template-columns:minmax(220px,1.5fr) repeat(3,minmax(130px,.8fr)) 140px 140px;gap:8px}.filters input,.filters select{min-height:42px;border:1px solid var(--border);border-radius:11px;background:var(--input);color:var(--text);padding:7px 9px}.search{position:relative}.search svg{position:absolute;left:11px;top:12px;width:17px;color:var(--text-muted)}.search input{width:100%;padding-left:35px}.table-wrap{overflow:auto}table{width:100%;border-collapse:collapse}th,td{padding:11px 12px;border-bottom:1px solid var(--border);text-align:left;white-space:nowrap}thead th{font-size:var(--font-size-ui-min);color:var(--text-muted)}tbody tr{cursor:pointer;transition:background var(--transition-fast)}tbody tr:hover,tbody tr:focus{background:color-mix(in srgb,var(--wash-peach) 55%,var(--surface));outline:none}.ok{padding:4px 8px;border-radius:999px;background:var(--wash-mint);color:var(--color-success);font-size:var(--font-size-ui-min);font-weight:900}.empty{text-align:center;color:var(--text-muted)}.audit-drawer-backdrop{position:fixed;z-index:120;inset:0;background:rgb(20 16 24 / .34);display:flex;justify-content:flex-end}.audit-detail{width:min(560px,92vw);height:100%;overflow:auto;padding:20px;background:var(--surface-raised);box-shadow:-24px 0 60px rgb(20 16 24 / .22);animation:drawer-in .2s var(--ease-out)}.audit-detail header{display:flex;justify-content:space-between;gap:14px}.audit-detail h3{margin:3px 0}.audit-detail p,.audit-detail small{color:var(--text-muted)}.audit-detail button{width:38px;height:38px;border:1px solid var(--border);border-radius:12px;background:var(--surface);color:var(--text);cursor:pointer}.audit-detail button svg{width:18px}.audit-detail section{margin-top:18px}.audit-detail h4{margin:0 0 7px}.audit-detail pre{white-space:pre-wrap;word-break:break-word;padding:12px;border:1px solid var(--border);border-radius:13px;background:var(--surface-soft);font-size:var(--font-size-ui-min);line-height:1.45}@keyframes drawer-in{from{transform:translateX(28px);opacity:.4}to{transform:none;opacity:1}}@media(max-width:1100px){.filters{grid-template-columns:1fr 1fr 1fr}.search{grid-column:1/-1}}@media(max-width:680px){.filters{grid-template-columns:1fr}.search{grid-column:auto}.audit-heading{display:grid}.audit-heading :deep(.app-button){width:100%}.audit-error{grid-template-columns:auto 1fr}.audit-error :deep(.app-button){grid-column:1/-1;width:100%}}
</style>
