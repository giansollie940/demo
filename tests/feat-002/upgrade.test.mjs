import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {createFixture,ids} from '../homework/fixture.mjs';
test('07 upgrades a populated FEAT-001 database without changing old notice/child/master values',async()=>{
 const db=await createFixture();try{
 for(const f of ['05-FEAT-001-BAO-BAI.sql','06-FEAT-001-AI-RECOVERY.sql'])await db.exec(await readFile(new URL('../../database/upgrade/'+f,import.meta.url),'utf8'));
 const subject=crypto.randomUUID(),notice=crypto.randomUUID();
 await db.query('insert into class_subjects(id,class_id,name) values($1,$2,$3)',[subject,ids.c,'Preserved subject']);
 await db.query("insert into homework_notices(id,class_id,school_year_id,subject_id,author_id,title,content,due_at,request_id) values($1,$2,$3,$4,$5,'Old title','Old content','2026-09-10T12:00:00Z',$6)",[notice,ids.c,ids.y,subject,ids.s,crypto.randomUUID()]);
 await db.query('insert into homework_notice_reactions(notice_id,user_id) values($1,$2)',[notice,ids.other]);
 const tables=['school_years','classes','profiles','class_subjects','homework_notices','homework_notice_reactions'];const before={};
 for(const t of tables)before[t]=(await db.query(`select to_jsonb(t) row from ${t} t`)).rows;
 await db.exec(await readFile(new URL('../../database/upgrade/07-FEAT-002-PERMISSIONS-LIFECYCLE.sql',import.meta.url),'utf8'));
 for(const t of tables){const after=(await db.query(`select to_jsonb(t)${t==='homework_notices'?"-'duplicate_tombstone_id'":''} row from ${t} t`)).rows;assert.deepEqual(after,before[t],t);}
 assert.equal((await db.query('select count(*)::int n from homework_tombstones')).rows[0].n,0);
 }finally{await db.close();}
});
