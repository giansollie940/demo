import { readFile } from 'node:fs/promises';

const sql = name => readFile(new URL('../../database/upgrade/' + name, import.meta.url), 'utf8');
const local = name => readFile(new URL(name, import.meta.url), 'utf8');

export const ids = {
  y: '00000000-0000-0000-0000-0000000000f0', // school year
  c: '00000000-0000-0000-0000-0000000000f1', // class under test
  c2: '00000000-0000-0000-0000-0000000000f2', // a second class, same year
  s: '00000000-0000-0000-0000-0000000000f3', // student of c
  s2: '00000000-0000-0000-0000-0000000000f8', // a second student of c
  m: '00000000-0000-0000-0000-0000000000f4', // monitor of c
  t: '00000000-0000-0000-0000-0000000000f5', // teacher of c
  t2: '00000000-0000-0000-0000-0000000000f6', // teacher of c2 only
  a: '00000000-0000-0000-0000-0000000000f7', // admin
};

/**
 * NO FAKE CLOCK.
 *
 * Every boundary in FEAT-010 compares a session's start against a server
 * timestamp, so the tests need to control which side of `now()` a session falls
 * on. The tempting way is a `current_setting('…clock')` hook the tests can set —
 * and that would be a hole in production, because a boundary that a client can
 * move is not a boundary.
 *
 * So time is controlled from the other end instead: the weeks are laid out
 * around the real current Monday. Sessions in `past`/`prev` have genuinely
 * started; sessions in `next`/`later`/`far` genuinely have not. The exact-
 * equality cases in BR-010-005 (session_start == locked_at) are set up by
 * writing an interval whose `locked_at` is the value `study_session_start()`
 * itself returns — see `sessionStart()` below.
 */
export const weeks = {
  past:  '00000000-0000-0000-0000-0000000000e0',
  prev:  '00000000-0000-0000-0000-0000000000e1',
  cur:   '00000000-0000-0000-0000-0000000000e2',
  next:  '00000000-0000-0000-0000-0000000000e3',
  later: '00000000-0000-0000-0000-0000000000e4',
  far:   '00000000-0000-0000-0000-0000000000e5',
};

const OFFSET_DAYS = { past: -21, prev: -14, cur: -7, next: 7, later: 14, far: 21 };

function isoDate(d) { return d.toISOString().slice(0, 10); }

/** Monday of the current ISO week, in UTC terms. */
function thisMonday() {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  const dow = (d.getUTCDay() + 6) % 7; // 0 = Monday
  d.setUTCDate(d.getUTCDate() - dow);
  return d;
}

function shift(base, days) {
  const d = new Date(base);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

export const WEEK_START = Object.fromEntries(
  Object.entries(OFFSET_DAYS).map(([k, n]) => [k, isoDate(shift(thisMonday(), n))]));

export const PERIODS = { 1: '07:15', 2: '08:05', 3: '09:10', 4: '10:00', 5: '10:50' };

/**
 * The migration text as the fixture will install it — including the mutation
 * named by `FEAT010_MUTATION`, if any.
 *
 * A test that asserts something about the *source* must read it through here
 * rather than with `readFile`, or the mutation runner cannot reach it. That is
 * not hypothetical: Sol RC5's `for key share` mutation escaped exactly this way
 * on the first run, because the assertion read the file from disk while the
 * fixture installed a mutated copy from memory.
 */
export async function migrationSql() {
  let rc8 = await sql('13-FEAT-010-DEVICE-USE-LOCK.sql');
  let rc9 = await sql('14-FEAT-010-RC9-CASCADE-FREEZE-FIX.sql');
  // scripts/mutate-feat010.mjs re-runs this whole suite once per mutation.
  // RC1…RC8 mutations target migration 13; RC9 mutations explicitly name 14.
  // The suite itself never sets this, so an ordinary run is unmutated.
  const named = process.env.FEAT010_MUTATION;
  if (named) {
    const { mutations } = await import('./mutations.mjs');
    const mutation = mutations[named];
    if (!mutation) throw new Error(`không có mutation tên ${named}`);
    if (mutation.file === '14-FEAT-010-RC9-CASCADE-FREEZE-FIX.sql') {
      rc9 = mutation.apply(rc9);
    } else {
      rc8 = mutation.apply(rc8);
    }
  }
  return `${rc8}\n\n-- FEAT-010 RC9 upgrade applied after RC8 baseline.\n${rc9}`;
}

export async function createFixture({ migrate = true, mutate = null } = {}) {
  const modulePath = process.env.PGLITE_MODULE || '@electric-sql/pglite';
  const { PGlite } = await import(modulePath);
  const db = new PGlite();
  await db.exec(await local('baseline.sql'));
  await db.exec(seedSql());
  if (migrate) {
    let text = await migrationSql();
    if (mutate) text = mutate(text);
    await db.exec(text);
  }
  return db;
}

function seedSql() {
  const users = [ids.s, ids.s2, ids.m, ids.t, ids.t2, ids.a];
  const yearStart = isoDate(shift(thisMonday(), -120));
  const yearEnd = isoDate(shift(thisMonday(), 200));
  const weekRows = Object.entries(OFFSET_DAYS).map(([k, n], i) =>
    `('${weeks[k]}','${ids.y}',${i + 1},'${WEEK_START[k]}','${isoDate(shift(new Date(WEEK_START[k] + 'T00:00:00Z'), 6))}')`);
  return `
insert into auth.users(id) values ${users.map(u => `('${u}')`).join(',')};
insert into public.school_years(id,name,start_date,end_date,is_active)
  values('${ids.y}','2026-2027','${yearStart}','${yearEnd}',true);
insert into public.classes(id,school_year_id,code,name,grade) values
  ('${ids.c}','${ids.y}','7A9','7A9',7),
  ('${ids.c2}','${ids.y}','7A8','7A8',7);
insert into public.profiles(id,full_name,role,class_id) values
  ('${ids.s}','Học sinh','student','${ids.c}'),
  ('${ids.s2}','Học sinh hai','student','${ids.c}'),
  ('${ids.m}','Lớp trưởng','monitor','${ids.c}'),
  ('${ids.t}','Giáo viên','teacher',null),
  ('${ids.t2}','Giáo viên lớp khác','teacher',null),
  ('${ids.a}','Quản trị','admin',null);
insert into public.class_teachers(class_id,teacher_id) values
  ('${ids.c}','${ids.t}'),('${ids.c2}','${ids.t2}');
insert into public.class_settings(class_id) values ('${ids.c}'),('${ids.c2}');
insert into public.periods(period_number,start_time,end_time) values
  (1,'07:15','08:00'),(2,'08:05','08:50'),(3,'09:10','09:55'),(4,'10:00','10:45'),(5,'10:50','11:35');
insert into public.school_year_periods(school_year_id,period_number,start_time,end_time) values
  ('${ids.y}',1,'07:15','08:00'),('${ids.y}',2,'08:05','08:50'),('${ids.y}',3,'09:10','09:55'),
  ('${ids.y}',4,'10:00','10:45'),('${ids.y}',5,'10:50','11:35');
insert into public.weeks(id,school_year_id,week_number,start_date,end_date) values ${weekRows.join(',')};
insert into public.class_weeks(class_id,week_id,status,manual_status)
  select c.id,w.id,'open'::public.week_status,'open'::public.week_status
  from public.classes c cross join public.weeks w;
insert into public.study_schedule(class_id,weekday,period_number)
  select c.id,d.wd,p.pn from public.classes c
  cross join (values(1),(2),(3),(4),(5)) d(wd)
  cross join (values(1),(2),(3),(4),(5)) p(pn);
`;
}

/** Run `fn` with the session acting as `user` through PostgREST's role. */
export async function as(db, user, fn) {
  await db.exec(`set role authenticated; set request.jwt.claim.sub='${user}'`);
  try { return await fn(); } finally { await db.exec("reset role; set request.jwt.claim.sub=''"); }
}

/** Run `fn` as the AI worker / Edge Function would: service_role, no JWT. */
export async function asService(db, fn) {
  await db.exec("set role service_role; set request.jwt.claim.sub=''");
  try { return await fn(); } finally { await db.exec("reset role"); }
}

/**
 * Run `fn` as the **database owner** — the role a human gets in the Supabase SQL
 * editor, and the one no application grant governs.
 *
 * This is not the same thing as `asService()`, and after Sol RC6 R-007 the
 * difference is the point: `service_role` no longer has DML on the policy
 * tables at all, so a scenario that needs a row written outside the RPC — a
 * historical interval, a manual fix, a restore — has to be written by the
 * owner. The year-freeze trigger still applies here, which is exactly what
 * makes it a freeze rather than a permission.
 */
export async function asOwner(db, fn) {
  await db.exec("reset role; set request.jwt.claim.sub=''");
  return fn();
}

/** The canonical resolver's own answer, so boundary tests use the real value. */
export async function sessionStart(db, week, weekday, period, classId = ids.c) {
  const r = await db.query('select public.study_session_start($1,$2,$3,$4) s',
    [classId, weeks[week], weekday, period]);
  return r.rows[0].s;
}

/** Teacher-facing RPC. */
export async function policy(db, user, action, payload = {}) {
  return as(db, user, async () => (await db.query(
    'select public.device_use_policy($1,$2::jsonb) r', [action, JSON.stringify({ class_id: ids.c, ...payload })])).rows[0].r);
}

export async function state(db, week, weekday, period, classId = ids.c) {
  const r = await db.query('select public.device_use_policy_state($1,$2,$3,$4) s',
    [classId, weeks[week], weekday, period]);
  return r.rows[0].s;
}

/**
 * A registration written the way the app writes one: as the student, straight
 * at the table through PostgREST, with RLS and the whole trigger chain live.
 */
export async function register(db, user, { week, weekday, period, device = false, content = 'Ôn tập chương 1', status = 'submitted' }) {
  return as(db, user, async () => (await db.query(
    `insert into public.registrations(student_id,week_id,weekday,period_number,content,status,uses_electronic_device)
     values($1,$2,$3,$4,$5,$6::public.registration_status,$7) returning *`,
    [user, weeks[week], weekday, period, content, status, device])).rows[0]);
}

/**
 * A registration in a week that has already happened. RLS deliberately forbids
 * a student from writing one, so history is seeded the way history arrives:
 * already in the table. service_role models the server-side path.
 */
export async function seedRegistration(db, student, { week, weekday, period, device = false, status = 'approved', content = 'Ôn tập chương 1' }) {
  return asService(db, async () => (await db.query(
    `insert into public.registrations(student_id,class_id,week_id,weekday,period_number,content,status,uses_electronic_device,approved_at)
     values($1,$2,$3,$4,$5,$6,$7::public.registration_status,$8,now()) returning *`,
    [student, ids.c, weeks[week], weekday, period, content, status, device])).rows[0]);
}

export async function reg(db, id) {
  return (await db.query('select * from public.registrations where id=$1', [id])).rows[0];
}

export async function fails(promise) {
  try { await promise; return null; } catch (error) { return error; }
}

/** Compose the real archive migrations with device-policy dependencies.
 * This helper covers parent/child deletion only. Registration writes and the
 * timetable resolver remain covered by createFixture's complete baseline.
 * Reuse captured DDL, including constraints, rather than inventing stubs.
 */
export async function addArchiveDeviceDependencies(db) {
  const baseline = await local('baseline.sql');
  const enumDDL = baseline.match(/^create type public\.registration_status[^;]+;/m);
  if (!enumDDL) throw new Error('registration_status baseline DDL missing');
  await db.exec(enumDDL[0]);
  await db.exec(baseline.match(/^create type public\.app_role[^;]+;/m)[0]);
  await db.exec('alter table public.profiles alter column role type public.app_role using role::public.app_role');
  for (const name of ['current_app_role', 'is_root_admin', 'teacher_has_class', 'can_manage_class', 'current_student_class_id']) {
    const ddl = baseline.match(new RegExp(`create or replace function public\\.${name}\\([\\s\\S]*?\\$function\\$;`));
    if (!ddl) throw new Error(`baseline function DDL missing: ${name}`);
    await db.exec(ddl[0]);
  }
  const tables = ['periods', 'registrations', 'study_schedule', 'week_schedule_overrides'];
  for (const table of tables) {
    const ddl = baseline.match(new RegExp(`create table public\\.${table} \\([\\s\\S]*?\\n\\);`));
    if (!ddl) throw new Error(`baseline table DDL missing: ${table}`);
    await db.exec(ddl[0]);
  }
  for (const table of tables) {
    const constraints = baseline.match(new RegExp(`^alter table public\\.${table} add constraint [^;]+;`, 'gm'));
    if (!constraints?.length) throw new Error(`baseline constraints missing: ${table}`);
    await db.exec(constraints.join('\n'));
  }
  await db.exec("insert into public.periods(period_number,start_time,end_time) values(1,'07:15','08:00')");
}
