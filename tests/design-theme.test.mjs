import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root=resolve(import.meta.dirname,'..');
const read=(p)=>readFileSync(resolve(root,p),'utf8');

test('design tokens define semantic action colors and spacing/radius scale',()=>{
  const css=read('src/styles/tokens.css');
  for(const token of ['--color-primary','--color-info','--color-success','--color-warning','--color-danger','--radius-lg','--space-6']){
    assert.match(css,new RegExp(token.replaceAll('-','\\-')));
  }
});

test('themes support explicit dark mode and system default without forced inversion',()=>{
  const css=read('src/styles/themes.css');
  assert.match(css,/\[data-theme=['"]dark['"]\]/);
  assert.match(css,/color-scheme:\s*dark/);
  assert.doesNotMatch(css,/filter:\s*invert/i);
});

test('base CSS respects reduced motion',()=>{
  assert.match(read('src/styles/base.css'),/@media\s*\(prefers-reduced-motion:\s*reduce\)/);
});
