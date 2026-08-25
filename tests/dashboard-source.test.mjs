import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const root=resolve(import.meta.dirname,'..');
const read=p=>readFileSync(resolve(root,p),'utf8');

test('dashboard model derives registration KPIs without DOM rendering',()=>{
  const text=read('src/features/dashboard/dashboard-model.ts');
  assert.match(text,/buildDashboardMetrics/);
  assert.doesNotMatch(text,/document\.|innerHTML|querySelector/);
});

test('dashboard uses current Vue Query week data',()=>{
  const text=read('src/pages/DashboardPage.vue');
  assert.match(text,/useWeekData/);
  assert.match(text,/teacher-dashboard-illustration\.png/);
});
