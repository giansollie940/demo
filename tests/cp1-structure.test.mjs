import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root=resolve(import.meta.dirname,'..');
const required=[
  'package.json','vite.config.ts','index.html',
  'src/main.ts','src/App.vue','src/app/router/index.ts','src/app/query-client.ts',
  'src/stores/auth.ts','src/stores/context.ts','src/stores/preferences.ts',
  'src/services/legacy-supabase.ts','src/layouts/AppShell.vue','src/layouts/AuthLayout.vue',
  'src/pages/LoginPage.vue','src/pages/DashboardPage.vue',
  'src/styles/tokens.css','src/styles/themes.css','src/styles/base.css',
  'public/supabase-service.js','public/assets/images/favicon.png','public/assets/images/login-hero.png'
];

test('Vue checkpoint contains required architecture files',()=>{
  const missing=required.filter(path=>!existsSync(resolve(root,path)));
  assert.deepEqual(missing,[]);
});

test('Vite is configured for GitHub Pages-safe relative base and Vue plugin',()=>{
  const text=readFileSync(resolve(root,'vite.config.ts'),'utf8');
  assert.match(text,/base:\s*['"]\.\/['"]/);
  assert.match(text,/vue\(\)/);
});

test('frontend-vue bridges existing Supabase service rather than changing backend contracts',()=>{
  const text=readFileSync(resolve(root,'src/services/legacy-supabase.ts'),'utf8');
  assert.match(text,/window\.SupabaseService/);
  assert.doesNotMatch(text,/service_role/i);
});
