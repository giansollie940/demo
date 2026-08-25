import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
const root=new URL('../',import.meta.url);const read=p=>fs.readFileSync(new URL(p,root),'utf8');const exists=p=>fs.existsSync(new URL(p,root))
test('CP5 students route uses real account management page',()=>{
  assert.equal(exists('src/pages/StudentsPage.vue'),true)
  const routes=read('src/app/router/routes.ts');assert.match(routes,/path:\s*'students',\s*component:\s*StudentsPage/)
  const page=read('src/pages/StudentsPage.vue')
  for(const token of ['Sao chép mã','Thêm học sinh','Đặt lại mật khẩu','Khôi phục','Xóa mềm']) assert.ok(page.includes(token),token)
})
test('typed bridge exposes existing teacher account methods without backend replacement',()=>{
  const types=read('src/types/legacy.ts')
  for(const token of ['teacherListUsers','teacherCreateUser','teacherUpdateUser','teacherDeleteUser','teacherResetPassword']) assert.ok(types.includes(token),token)
})
