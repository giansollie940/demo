import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const root=resolve(import.meta.dirname,'..');
const read=(p)=>readFileSync(resolve(root,p),'utf8');

test('navigation includes all major migrated route targets and role filtering',()=>{
  const text=read('src/features/navigation/navigation.ts');
  for(const route of ['/dashboard','/register','/review','/tracking','/weeks','/schedule','/students','/statistics','/history','/comments','/admin','/settings']){
    assert.match(text,new RegExp(route.replaceAll('/','\\/')));
  }
  assert.match(text,/roles:/);
  assert.match(text,/visibleNavigation/);
});

test('router uses hash history for GitHub Pages',()=>{
  const text=read('src/app/router/index.ts');
  assert.match(text,/createWebHashHistory/);
});


test('learner-only pages are hidden from teacher and admin navigation and protected at route level',()=>{
  const nav=read('src/features/navigation/navigation.ts');
  assert.match(nav,/const learners:UserRole\[]=/);
  assert.match(nav,/item\('Đăng ký tự học','\/register'.*learners\)/);
  assert.match(nav,/item\('Lịch sử','\/history'.*learners\)/);
  assert.match(nav,/item\('Nhận xét GV','\/comments'.*learners\)/);
  const routes=read('src/app/router/routes.ts');
  assert.match(routes,/const learners: UserRole\[] = \['student', 'monitor'\]/);
  assert.match(routes,/path: 'register'.*roles: learners/);
  assert.match(routes,/path: 'history'.*roles: learners/);
  assert.match(routes,/path: 'comments'.*roles: learners/);
});
