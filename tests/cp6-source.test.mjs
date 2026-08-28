import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
const root=new URL('../',import.meta.url);const read=p=>fs.readFileSync(new URL(p,root),'utf8');const exists=p=>fs.existsSync(new URL(p,root))
test('CP6 admin route exposes overview classes teachers and permission matrix',()=>{
  assert.equal(exists('src/pages/AdminPage.vue'),true)
  const routes=read('src/app/router/routes.ts');assert.match(routes,/path:\s*'admin',\s*component:\s*AdminPage/)
  const page=read('src/pages/AdminPage.vue')
  for(const token of ['Tổng quan','Lớp học','Giáo viên','Phân quyền','PermissionMatrix','Tạo lớp','Tạo giáo viên']) assert.ok(page.includes(token),token)
})
test('admin feature calls only existing bridge management actions',()=>{
  const feature=read('src/features/admin/admin-directory.ts')
  for(const token of ["adminManageClasses('list')","'assign_teacher'","'unassign_teacher'","'create_class'","'update_class'","'delete_class'","teacherCreateUser","teacherUpdateUser","teacherDeleteUser"]) assert.ok(feature.includes(token),token)
})
