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
