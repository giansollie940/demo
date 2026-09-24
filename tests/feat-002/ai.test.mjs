import {test} from 'node:test';import assert from 'node:assert/strict';
import {reviewSnapshot} from '../../supabase/functions/homework-review/logic.js';
const n={id:'new',title:'Bài tập',content:'Nội dung',due_at:'2026-09-10T12:00:00Z',subject_id:'s',english_group_id:null};
const fail=async()=>{throw new Error('Semantic must not be called');};
test('disabled semantic still rejects normalized exact duplicates',async()=>{const r=await reviewSnapshot({notice:n,candidates:[{...n,id:'old',title:' BÀI   TẬP '}],settings:{semantic_duplicate_enabled:false}},fail);assert.equal(r.score,100);assert.equal(r.candidate_id,'old');});
test('disabled semantic skips both edit classifier and comparison for a nonexact notice',async()=>{const r=await reviewSnapshot({notice:n,previous:{...n,status:'published'},candidates:[{...n,id:'old',content:'Other'}],settings:{semantic_duplicate_enabled:false}},fail);assert.equal(r.score,0);assert.equal(r.candidate_id,null);});
