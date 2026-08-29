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

test('dashboard uses current Vue Query week data and R7 high-density artwork',()=>{
  const text=read('src/pages/DashboardPage.vue');
  assert.match(text,/useWeekData/);
<<<<<<< HEAD
<<<<<<< HEAD
  assert.match(text,/r7-dashboard-students@2x\.png/);
  assert.match(text,/DashboardHero/);
=======
  assert.match(text,/student-group-dashboard(?:-blend)?\.png/);
>>>>>>> parent of 66b0142 (demo 36)
=======
  assert.match(text,/student-group-dashboard\.png/);
>>>>>>> parent of 656f9a2 (demo 35)
});
