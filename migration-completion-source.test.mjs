import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
const text = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('migration source has no placeholder production routes', async()=>{
  const routes=await text('src/app/router/routes.ts')
  assert.doesNotMatch(routes,/ComingSoonPage/)
  for(const page of ['RegistrationPage','ApprovalPage','TrackingPage','WeeksPage','SchedulePage','StudentsPage','StatisticsPage','HistoryPage','CommentsPage','AdminPage','SettingsPage']) assert.match(routes,new RegExp(`component: ${page}`))
})

test('realtime is centralized and app source avoids deprecated unsafe execution APIs', async()=>{
  const app=await text('src/App.vue'), realtime=await text('src/realtime/useRealtimeInvalidation.ts'), shell=await text('src/layouts/AppShell.vue')
  assert.match(app,/useRealtimeInvalidation\(\)/)
  assert.equal((realtime.match(/legacyApi\.subscribeRealtime\(/g)||[]).length,1)
  for(const source of [app,realtime,shell]) assert.doesNotMatch(source,/beforeunload|addEventListener\(['"]unload|eval\(|new Function|unsafe-eval/)
})

test('package identifies the V8.7.1 release and exposes verification scripts', async()=>{
  const pkg=JSON.parse(await text('package.json'))
  assert.equal(pkg.version,'8.7.1')
  assert.equal(pkg.scripts.typecheck,'vue-tsc -b')
  assert.equal(pkg.scripts.test,'node --test tests/*.test.mjs')
  assert.equal(pkg.scripts['test:unit'],'vitest run --configLoader runner tests/unit')
  assert.match(pkg.scripts.build,/vue-tsc -b/)
  assert.match(pkg.scripts.build,/vite build/)
})
