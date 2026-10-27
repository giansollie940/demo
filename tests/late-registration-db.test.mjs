// FEAT-LATE-001: chạy migration ghi nhận trễ trên PGlite với một schema rút gọn
// mô phỏng các bảng/hàm có sẵn trên Supabase (auth.uid(), can_manage_class, ...).
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'

const MIGRATION = readFileSync(new URL('../supabase/migrations/20261027090000_late_registration_tracking.sql', import.meta.url), 'utf8')

const ID = {
  year: '00000000-0000-0000-0000-0000000000a1', otherYear: '00000000-0000-0000-0000-0000000000a2',
  cls: '00000000-0000-0000-0000-0000000000c1', otherCls: '00000000-0000-0000-0000-0000000000c2',
  teacher: '00000000-0000-0000-0000-0000000000e1', otherTeacher: '00000000-0000-0000-0000-0000000000e2',
  monitor: '00000000-0000-0000-0000-0000000000f1', student: '00000000-0000-0000-0000-0000000000f2',
  student2: '00000000-0000-0000-0000-0000000000f3', outsider: '00000000-0000-0000-0000-0000000000f4',
  week: '00000000-0000-0000-0000-0000000000d1', futureWeek: '00000000-0000-0000-0000-0000000000d2',
  otherYearWeek: '00000000-0000-0000-0000-0000000000d3',
}

const BASE = `
create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.uid', true), '')::uuid $$;
create role anon; create role authenticated;
create type app_role as enum ('student','monitor','teacher','admin');
create type registration_status as enum ('draft','submitted','needs_revision','approved');
create table school_years (id uuid primary key);
create table classes (id uuid primary key, school_year_id uuid references school_years(id), active boolean default true);
create table profiles (id uuid primary key, role app_role not null, class_id uuid references classes(id), active boolean default true, deleted_at timestamptz);
create table class_teachers (teacher_id uuid references profiles(id), class_id uuid references classes(id), active boolean default true);
create table weeks (id uuid primary key, school_year_id uuid references school_years(id));
create table class_settings (class_id uuid primary key references classes(id), announcement text);
create table registrations (id uuid primary key default gen_random_uuid(), student_id uuid, week_id uuid, weekday int, period_number int, status registration_status, is_deleted boolean default false);
create table audit_logs (id bigserial primary key, actor_id uuid, action text not null, entity_type text not null, entity_id text, old_data jsonb, new_data jsonb, created_at timestamptz default now(), class_id uuid, source text default 'server');
create table test_session_starts (week_id uuid, weekday int, period_number int, starts_at timestamptz);
create function current_app_role() returns app_role language sql stable security definer as $$ select role from profiles where id=auth.uid() and active=true $$;
create function current_student_class_id() returns uuid language sql stable security definer as $$ select class_id from profiles where id=auth.uid() and active=true and role::text in ('student','monitor') $$;
create function is_root_admin() returns boolean language sql stable security definer as $$ select coalesce(current_app_role()::text='admin',false) $$;
create function teacher_has_class(p_class_id uuid) returns boolean language sql stable security definer as $$
  select coalesce(exists(select 1 from class_teachers ct join classes c on c.id=ct.class_id and c.active where ct.teacher_id=auth.uid() and ct.class_id=p_class_id and ct.active),false) $$;
create function can_manage_class(p_class_id uuid) returns boolean language sql stable security definer as $$ select is_root_admin() or teacher_has_class(p_class_id) $$;
create function study_session_start(p_class_id uuid, p_week_id uuid, p_weekday int, p_period_number int) returns timestamptz language sql stable as $$
  select starts_at from test_session_starts where week_id=p_week_id and weekday=p_weekday and period_number=p_period_number $$;
`

const SEED = `
insert into school_years values ('${ID.year}'), ('${ID.otherYear}');
insert into classes values ('${ID.cls}', '${ID.year}', true), ('${ID.otherCls}', '${ID.year}', true);
insert into profiles values
  ('${ID.teacher}','teacher',null,true,null), ('${ID.otherTeacher}','teacher',null,true,null),
  ('${ID.monitor}','monitor','${ID.cls}',true,null), ('${ID.student}','student','${ID.cls}',true,null),
  ('${ID.student2}','student','${ID.cls}',true,null), ('${ID.outsider}','student','${ID.otherCls}',true,null);
insert into class_teachers values ('${ID.teacher}','${ID.cls}',true), ('${ID.otherTeacher}','${ID.otherCls}',true);
insert into weeks values ('${ID.week}','${ID.year}'), ('${ID.futureWeek}','${ID.year}'), ('${ID.otherYearWeek}','${ID.otherYear}');
insert into class_settings (class_id) values ('${ID.cls}');
insert into test_session_starts
  select '${ID.week}', d, p, now() - interval '1 hour' from generate_series(1,5) d, generate_series(1,9) p;
insert into test_session_starts
  select '${ID.futureWeek}', d, p, now() + interval '2 days' from generate_series(1,5) d, generate_series(1,9) p;
insert into test_session_starts
  select '${ID.otherYearWeek}', d, p, now() - interval '1 hour' from generate_series(1,5) d, generate_series(1,9) p;
`

async function db() {
  const pg = new PGlite()
  await pg.exec(BASE)
  await pg.exec(MIGRATION)
  await pg.exec(SEED)
  return pg
}

const as = (pg, uid) => pg.query(`select set_config('request.uid', $1, false)`, [uid ?? ''])
const record = (pg, student, weekday, period = 1, week = ID.week) =>
  pg.query('select record_late_registration($1,$2,$3,$4) as r', [student, week, weekday, period]).then(res => res.rows[0].r)
const fails = async (promise, pattern) => assert.rejects(promise, error => pattern.test(error.message))

test('the third late registration becomes one conduct case and the counter restarts', async () => {
  const pg = await db(); await as(pg, ID.monitor)
  const first = await record(pg, ID.student, 1)
  assert.deepEqual({ ...first, late_id: typeof first.late_id }, { late_id: 'string', pending: 1, threshold: 3, conduct_case_id: null })
  // Another student's late registrations count separately.
  assert.equal((await record(pg, ID.student2, 1)).pending, 1)
  await record(pg, ID.student, 2)
  const third = await record(pg, ID.student, 3)
  assert.equal(third.pending, 0)
  assert.ok(third.conduct_case_id)
  const counted = await pg.query(`select count(*)::int n from late_registrations where conduct_case_id=$1`, [third.conduct_case_id])
  assert.equal(counted.rows[0].n, 3)
  const fourth = await record(pg, ID.student, 4)
  assert.equal(fourth.pending, 1); assert.equal(fourth.conduct_case_id, null)
  const audit = await pg.query(`select count(*)::int n from audit_logs where action='late_registration.record'`)
  assert.equal(audit.rows[0].n, 5)
})

test('the teacher can change the threshold for the class', async () => {
  const pg = await db()
  await pg.exec(`update class_settings set late_conduct_threshold=2 where class_id='${ID.cls}'`)
  await as(pg, ID.teacher)
  await record(pg, ID.student, 1)
  const second = await record(pg, ID.student, 2)
  assert.equal(second.threshold, 2); assert.ok(second.conduct_case_id)
  await fails(pg.exec(`update class_settings set late_conduct_threshold=0 where class_id='${ID.cls}'`), /late_conduct_threshold_check/)
})

test('one late registration per student and session; registered students and unstarted sessions are refused', async () => {
  const pg = await db(); await as(pg, ID.monitor)
  await record(pg, ID.student, 1)
  await fails(record(pg, ID.student, 1), /Đã ghi trễ/)
  await fails(record(pg, ID.student, 1, 1, ID.futureWeek), /chưa bắt đầu/)
  await pg.exec(`insert into registrations (student_id, week_id, weekday, period_number, status) values ('${ID.student2}','${ID.week}',2,1,'submitted')`)
  await fails(record(pg, ID.student2, 2), /đã có đăng ký/)
  // A draft is not a registration.
  await pg.exec(`insert into registrations (student_id, week_id, weekday, period_number, status) values ('${ID.student2}','${ID.week}',3,1,'draft')`)
  assert.equal((await record(pg, ID.student2, 3)).pending, 1)
  await fails(record(pg, ID.student, 2, 1, ID.otherYearWeek), /năm học/)
})

test('only class managers and monitors of the same class may record, never for themselves', async () => {
  const pg = await db()
  await as(pg, ID.student); await fails(record(pg, ID.student2, 1), /Chỉ cán sự hoặc giáo viên/)
  await as(pg, ID.otherTeacher); await fails(record(pg, ID.student, 1), /không phụ trách/)
  await as(pg, ID.monitor); await fails(record(pg, ID.outsider, 1), /lớp của mình/)
  await fails(record(pg, ID.monitor, 1), /chính mình/)
  await as(pg, ID.teacher); assert.equal((await record(pg, ID.monitor, 1)).pending, 1)
  await as(pg, null); await fails(record(pg, ID.student, 2), /chưa đăng nhập/)
})

test('a mistaken late registration can be revoked until it has been counted', async () => {
  const pg = await db(); await as(pg, ID.monitor)
  const first = await record(pg, ID.student, 1)
  const revoke = id => pg.query('select revoke_late_registration($1) ok', [id]).then(r => r.rows[0].ok)
  assert.equal(await revoke(first.late_id), true)
  assert.equal(await revoke(first.late_id), false)
  // The session is free again, and the revoked one no longer counts.
  assert.equal((await record(pg, ID.student, 1)).pending, 1)
  await record(pg, ID.student, 2)
  const third = await record(pg, ID.student, 3)
  assert.ok(third.conduct_case_id)
  await fails(revoke(third.late_id), /đã được tính/)
})

test('a conduct case is resolved once, keeping the history', async () => {
  const pg = await db(); await as(pg, ID.teacher)
  await record(pg, ID.student, 1); await record(pg, ID.student, 2)
  const { conduct_case_id: caseId } = await record(pg, ID.student, 3)
  const resolve = (id, note) => pg.query('select resolve_conduct_case($1,$2) ok', [id, note]).then(r => r.rows[0].ok)
  await as(pg, ID.student); await fails(resolve(caseId, null), /Chỉ cán sự hoặc giáo viên/)
  await as(pg, ID.monitor)
  assert.equal(await resolve(caseId, '  Trực nhật 1 buổi  '), true)
  assert.equal(await resolve(caseId, null), false)
  const row = (await pg.query('select resolved_by, resolution_note from conduct_cases where id=$1', [caseId])).rows[0]
  assert.deepEqual(row, { resolved_by: ID.monitor, resolution_note: 'Trực nhật 1 buổi' })
  assert.equal((await pg.query('select count(*)::int n from late_registrations where conduct_case_id=$1', [caseId])).rows[0].n, 3)
})

test('row level security: manager, same-class monitor and the student see rows; others do not; nobody writes directly', async () => {
  const pg = await db(); await as(pg, ID.teacher)
  await record(pg, ID.student, 1)
  await pg.exec('grant usage on schema public, auth to authenticated')
  const visible = async uid => { await as(pg, uid); await pg.exec('set role authenticated'); const n = (await pg.query('select count(*)::int n from late_registrations')).rows[0].n; await pg.exec('reset role'); return n }
  assert.equal(await visible(ID.teacher), 1)
  assert.equal(await visible(ID.monitor), 1)
  assert.equal(await visible(ID.student), 1)
  assert.equal(await visible(ID.student2), 0)
  assert.equal(await visible(ID.otherTeacher), 0)
  await as(pg, ID.teacher); await pg.exec('set role authenticated')
  await fails(pg.exec(`delete from late_registrations`), /permission denied/)
  await fails(pg.exec(`update conduct_cases set resolved_at=now()`), /permission denied/)
  await pg.exec('reset role')
})
