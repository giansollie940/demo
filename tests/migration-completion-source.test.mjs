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

test('package and checkpoint identify CP8 source status without claiming a build', async()=>{
  const pkg=JSON.parse(await text('package.json'))
  const status=await text('V8.6.0-CP8-SOURCE-STATUS.md')
  assert.equal(pkg.version,'8.6.0-cp8-source')
  assert.match(status,/34\/34/)
  assert.match(status,/EAI_AGAIN/)
  assert.match(status,/root-admin transfer/i)
  assert.match(status,/one full-width|một danh sách/i)
  assert.match(status,/NOT VERIFIED|CHƯA XÁC MINH/i)
})
