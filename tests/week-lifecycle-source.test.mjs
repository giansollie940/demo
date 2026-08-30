import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const root=resolve(import.meta.dirname,'..');
const read=(p)=>readFileSync(resolve(root,p),'utf8');

test('week lifecycle is independent of network and exposes next boundary',()=>{
  const text=read('src/features/weeks/week-lifecycle.ts');
  assert.match(text,/getWeekLifecycle/);
  assert.match(text,/getWeekLastSessionEnd/);
  assert.match(text,/nextBoundaryMs/);
  assert.doesNotMatch(text,/Supabase|fetch\(|legacyApi/);
});

test('Vue Query owns week data and supports prefetch',()=>{
  const text=read('src/features/weeks/queries.ts');
  assert.match(text,/queryKey/);
  assert.match(text,/prefetchQuery/);
  assert.match(text,/legacyApi\.loadWeekData/);
});
