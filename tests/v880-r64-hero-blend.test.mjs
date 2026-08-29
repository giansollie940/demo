import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root=path.resolve(new URL('..',import.meta.url).pathname)
const read=(file)=>fs.readFileSync(path.join(root,file),'utf8')

test('R6.4/R6.6 dashboard blends a sharp student-group source in CSS instead of a pre-blurred asset',()=>{
  const page=read('src/pages/DashboardPage.vue')
  assert.match(page,/student-group-dashboard\.png/)
  assert.doesNotMatch(page,/student-group-dashboard-blend\.png/)
  assert.match(page,/\.hero-illustration img\{[^}]*(?:-webkit-mask-image|mask-image):linear-gradient/s)
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
  assert.match(page,/\.hero-illustration\{[^}]*background:transparent[^}]*box-shadow:none/s)
  assert.match(page,/@media\(max-width:1100px\)[\s\S]*\.hero-illustration\{[^}]*position:relative[^}]*width:100%[^}]*height:160px/s)
  assert.doesNotMatch(page,/@media\(max-width:1100px\)[\s\S]*\.hero-illustration\{[^}]*background:(?!transparent)/s)
})
