import { createRouter, createWebHashHistory } from 'vue-router'
import { pinia } from '../pinia'
import { useAuthStore } from '../../stores/auth'
import type { UserRole } from '../../types/legacy'
import { routes } from './routes'
import { dirtyRegistry } from '../../features/shared/dirty-registry'
import { appDialog } from '../../features/shared/app-dialog'
export const router=createRouter({history:createWebHashHistory(),routes})
// A deploy replaces the hashed page chunks, so an open tab can ask for a file that no longer exists.
// Reload once onto the target route to pick up the new build; the timestamp guard stops a reload loop.
const staleChunk=/Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed/i
const reloadKey='sth:chunk-reload-at'
router.onError((error,to)=>{
  if(!staleChunk.test(String((error as Error)?.message??error)))return
  let last=0
  try{last=Number(sessionStorage.getItem(reloadKey))||0;sessionStorage.setItem(reloadKey,String(Date.now()))}catch{}
  if(Date.now()-last<10_000)return
  window.history.replaceState(window.history.state,'',router.resolve(to).href)
  window.location.reload()
})
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
  if(auth.currentUser?.role==='admin'&&to.path!=='/admin'&&to.path!=='/settings'&&to.path!=='/homework')return'/admin'
  const roles=to.meta.roles as UserRole[]|undefined
  if(roles&&!roles.includes(auth.currentUser!.role))return auth.currentUser?.role==='admin'?'/admin':'/dashboard'
  return true
})
