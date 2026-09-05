import { createRouter, createWebHashHistory } from 'vue-router'
import { pinia } from '../pinia'
import { useAuthStore } from '../../stores/auth'
import type { UserRole } from '../../types/legacy'
import { routes } from './routes'
import { dirtyRegistry } from '../../features/shared/dirty-registry'
import { appDialog } from '../../features/shared/app-dialog'
export const router=createRouter({history:createWebHashHistory(),routes})
router.beforeEach(async(to,from)=>{
  if(from.fullPath!==to.fullPath&&dirtyRegistry.hasDirty()){
    if(!await appDialog.confirm({title:'Thay đổi chưa được lưu',body:'Thay đổi chưa được lưu sẽ bị bỏ. Tiếp tục chuyển trang?',confirmLabel:'Bỏ thay đổi và chuyển trang',danger:true}))return false
    dirtyRegistry.discardAll()
  }
  const auth=useAuthStore(pinia)
  if(!auth.ready)await auth.bootstrap()
  if(to.meta.public){
    if(!auth.isAuthenticated)return true
    return auth.currentUser?.role==='admin'?'/admin':'/dashboard'
  }
  if(!auth.isAuthenticated)return{path:'/login',query:{redirect:to.fullPath}}
  if(auth.currentUser?.role==='admin'&&to.path!=='/admin'&&to.path!=='/settings')return'/admin'
  const roles=to.meta.roles as UserRole[]|undefined
  if(roles&&!roles.includes(auth.currentUser!.role))return auth.currentUser?.role==='admin'?'/admin':'/dashboard'
  return true
})
