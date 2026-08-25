import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const root=resolve(import.meta.dirname,'..');
const read=(p)=>readFileSync(resolve(root,p),'utf8');

test('auth store bootstraps and signs in through legacyApi',()=>{
  const text=read('src/stores/auth.ts');
  assert.match(text,/legacyApi\.init\(\)/);
  assert.match(text,/legacyApi\.loadState\(/);
  assert.match(text,/legacyApi\.signInCode\(/);
  assert.match(text,/legacyApi\.signOut\(\)/);
});

test('login page keeps hero visual separate from the form and supports theme toggle',()=>{
  const text=read('src/pages/LoginPage.vue');
  assert.match(text,/login-hero\.png/);
  assert.match(text,/toggleTheme/);
  assert.match(text,/type="password"|:type="showPassword/);
  assert.match(text,/auth\.login/);
});

test('app shell exposes class and week context selectors',()=>{
  const text=read('src/components/layout/TopBar.vue');
  assert.match(text,/selectedClassId/);
  assert.match(text,/selectedWeekId/);
});
