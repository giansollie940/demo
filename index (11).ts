import { createRouter, createWebHashHistory } from 'vue-router'
import { pinia } from '../pinia'
import { useAuthStore } from '../../stores/auth'
import type { UserRole } from '../../types/legacy'
import { routes } from './routes'
import { dirtyRegistry } from '../../features/shared/dirty-registry'
export const router=createRouter({history:createWebHashHistory(),routes})
router.beforeEach(async(to,from)=>{if(from.fullPath!==to.fullPath&&dirtyRegistry.hasDirty()){if(!window.confirm('Thay đổi chưa được lưu sẽ bị bỏ. Tiếp tục chuyển trang?'))return false;dirtyRegistry.discardAll()}const auth=useAuthStore(pinia);if(!auth.ready)await auth.bootstrap();if(to.meta.public)return auth.isAuthenticated?'/dashboard':true;if(!auth.isAuthenticated)return{path:'/login',query:{redirect:to.fullPath}};const roles=to.meta.roles as UserRole[]|undefined;if(roles&&!roles.includes(auth.currentUser!.role))return'/dashboard';return true})
