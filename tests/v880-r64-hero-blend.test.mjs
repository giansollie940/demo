import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
const hero=fs.readFileSync('src/components/dashboard/DashboardHero.vue','utf8')
test('R7 dashboard hero artwork is integrated full-bleed rather than nested card',()=>{assert.match(hero,/dashboard-hero-art/);assert.match(hero,/position:\s*absolute/);assert.match(hero,/object-fit:\s*cover/);assert.match(hero,/mask-image:\s*linear-gradient/);assert.doesNotMatch(hero,/box-shadow[^}]*dashboard-hero-art/)})
test('R7 hero has responsive mobile treatment without framed image restoration',()=>{assert.match(hero,/@media \(max-width: 760px\)/);assert.match(hero,/dashboard-hero-art::before/)})
