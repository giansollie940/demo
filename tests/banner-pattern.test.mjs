import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { parse } from '@vue/compiler-sfc'
import { parse as parseTemplate } from '@vue/compiler-dom'
import postcss from 'postcss'

const files = dir => readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? files(`${dir}/${e.name}`) : e.name.endsWith('.vue') ? [`${dir}/${e.name}`] : [])
const classes = n => (n.props?.find(p => p.name === 'class')?.value?.content || '').split(/\s+/)
const local = new Map([
  ['src/pages/DashboardPage.vue', 'dashboard-hero'], // Deliberate two-column hero.
  ['src/pages/HomeworkPage.vue', 'homework-banner'], // Existing operational board banner.
  ['src/pages/IssuesPage.vue', 'issues-header'], // Warning banner has its own treatment.
])
function audit(source, file) {
  const { descriptor } = parse(source)
  if (!descriptor.template) return []
  const root = parseTemplate(descriptor.template.content)
  const failures = []
  function walk(n, ancestors = []) {
    if (n.type !== 1) { for (const c of n.children || []) walk(c, ancestors); return }
    const isArt = ['PageArtwork', 'PageBannerArt'].includes(n.tag)
    const isHeading = n.tag === 'h1' && ancestors.some(a => a.tag === 'header')
    if (isArt || isHeading || classes(n).includes('page-header')) {
      // Login's brand header is intentionally not part of the signed-in page banner family.
      if (file !== 'src/pages/LoginPage.vue') {
        const containers = [...ancestors, n]
        const shared = containers.some(a => classes(a).includes('page-banner'))
        const explicit = containers.some(a => classes(a).includes(local.get(file)))
        if (!shared && !explicit) failures.push(`${file}: ${n.tag} lacks shared/local banner treatment`)
      }
    }
    for (const c of n.children || []) walk(c, [...ancestors, n])
  }
  walk(root)
  return failures
}
test('all page headers and artwork containers declare shared or reviewed local treatment', () => {
  assert.deepEqual(files('src').flatMap(file => audit(readFileSync(file, 'utf8'), file)), [])
})
test('audit rejects a new page that forgets banner styling', () => {
  for (const html of ['<header><h1>New page</h1></header>', '<header><PageArtwork /></header>', '<header class="page-header"><PageBannerArt /></header>']) {
    assert.ok(audit(`<template>${html}</template>`, 'src/pages/NewPage.vue').length)
    assert.deepEqual(audit(`<template><header class="page-banner">${html}</header></template>`, 'src/pages/NewPage.vue'), [])
  }
})
test('shared banner owns complete theme-aware treatment and safe artwork layering', () => {
  const css = postcss.parse(readFileSync('src/styles/base.css', 'utf8'))
  const props = new Map()
  css.walkRules('.page-banner', rule => rule.walkDecls(d => props.set(d.prop, d.value)))
  for (const key of ['padding','border','border-radius','background','box-shadow','position','overflow']) assert.ok(props.has(key), key)
  assert.match(props.get('background'), /var\(--page-wash-a/)
  assert.match(props.get('background'), /var\(--page-wash-b/)
  const art = readFileSync('src/components/ui/PageBannerArt.vue', 'utf8')
  assert.match(art, /pointer-events:\s*none/)
  assert.match(art, /aria-hidden="true"/)
})
test('intentional local banners retain explicit backgrounds, padding and clipping', () => {
  for (const [file, selector] of local) {
    const { descriptor } = parse(readFileSync(file,'utf8'))
    const props = new Set()
    for (const style of descriptor.styles) postcss.parse(style.content).walkRules(`.${selector}`, r => r.walkDecls(d => props.add(d.prop)))
    for (const key of ['background','padding','border-radius','position','overflow']) assert.ok(props.has(key), `${file}: ${key}`)
  }
})

test('Admin Homework reuses the homework artwork before its title in the shared lead layout', () => {
  const source = readFileSync('src/components/homework/HomeworkAdminOversight.vue', 'utf8')
  const { descriptor } = parse(source)
  const nodes = node => [node, ...(node.children || []).flatMap(nodes)]
  const header = nodes(parseTemplate(descriptor.template.content)).find(n => classes(n).includes('oversight-banner'))
  assert.ok(header)
  const lead = header.children.find(n => classes(n).includes('page-head-lead'))
  assert.ok(lead, 'leading artwork and text must share the standard layout')
  const elements = lead.children.filter(n => n.type === 1)
  assert.equal(elements[0]?.tag, 'PageArtwork')
  assert.equal(elements[0].props.find(p => p.name === 'name')?.value?.content, 'homework')
  assert.ok(nodes(elements[1]).some(n => n.tag === 'h1'))
  assert.match(descriptor.scriptSetup.content, /import PageArtwork from ['"]\.\.\/ui\/PageArtwork\.vue['"]/)
})
