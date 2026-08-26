import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
const root=new URL('../',import.meta.url)
const exists=(p)=>fs.existsSync(new URL(p,root))
const read=(p)=>fs.readFileSync(new URL(p,root),'utf8')
test('CP4 tracking route is a real page with session summary and one filterable list',()=>{
  assert.equal(exists('src/pages/TrackingPage.vue'),true)
  const routes=read('src/app/router/routes.ts')
  assert.match(routes,/path:\s*'tracking',\s*component:\s*TrackingPage/)
  const page=read('src/pages/TrackingPage.vue')
  const filters=read('src/components/tracking/TrackingFilters.vue')
  for(const token of ['SessionSummaryCard','TrackingFilters','StudentTrackingRow']) assert.ok(page.includes(token),token)
  for(const token of ['Có thiết bị','Không thiết bị']) assert.ok(filters.includes(token),token)
})
