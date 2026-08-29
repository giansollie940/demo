import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
<<<<<<< HEAD
const hero=fs.readFileSync('src/components/dashboard/DashboardHero.vue','utf8')
test('R7 dashboard hero artwork is integrated full-bleed rather than nested card',()=>{assert.match(hero,/dashboard-hero-art/);assert.match(hero,/position:\s*absolute/);assert.match(hero,/object-fit:\s*cover/);assert.match(hero,/mask-image:\s*linear-gradient/);assert.doesNotMatch(hero,/box-shadow[^}]*dashboard-hero-art/)})
test('R7 hero has responsive mobile treatment without framed image restoration',()=>{assert.match(hero,/@media \(max-width: 760px\)/);assert.match(hero,/dashboard-hero-art::before/)})
=======
import path from 'node:path'

const root=path.resolve(new URL('..',import.meta.url).pathname)
const read=(file)=>fs.readFileSync(path.join(root,file),'utf8')

test('R6.4 dashboard uses a dedicated blended student-group hero asset',()=>{
  const page=read('src/pages/DashboardPage.vue')
  assert.match(page,/student-group-dashboard-blend\.png/)
  assert.doesNotMatch(page,/student-group-dashboard\.png[`'\"]/)
})

test('R6.4 hero illustration is part of the hero surface rather than an inner card',()=>{
  const page=read('src/pages/DashboardPage.vue')
  assert.match(page,/\.hero-illustration\{[^}]*background:transparent/s)
  assert.match(page,/\.hero-illustration\{[^}]*box-shadow:none/s)
  assert.match(page,/\.hero-illustration\{[^}]*border(?:-radius)?:0/s)
  assert.match(page,/\.hero-illustration img\{[^}]*(?:-webkit-mask-image|mask-image):linear-gradient/s)
  assert.match(page,/\.hero-illustration img\{[^}]*border-radius:0/s)
})

test('R6.4 blend remains responsive without restoring a framed image on smaller screens',()=>{
  const page=read('src/pages/DashboardPage.vue')
  assert.match(page,/@media\(max-width:1100px\)[\s\S]*\.hero-illustration\{[^}]*background:transparent/s)
  assert.doesNotMatch(page,/@media\(max-width:1100px\)[\s\S]*\.hero-illustration\{[^}]*box-shadow:[^n]/s)
})
>>>>>>> parent of 66b0142 (demo 36)
