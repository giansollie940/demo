import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const local = name => readFile(new URL(name, import.meta.url), 'utf8');
const repoFile = path => readFile(new URL('../../' + path, import.meta.url), 'utf8');

export const MIGRATION = 'supabase/migrations/20261106090000_homework_due_not_past.sql';
export const ROLLBACK = 'database/upgrade/21-HOMEWORK-DUE-NOT-PAST.rollback.sql';

export const ids = {
  y: '00000000-0000-0000-0000-00000000a001',
  c: '00000000-0000-0000-0000-00000000a002',
  subj: '00000000-0000-0000-0000-00000000a003',
  student: '00000000-0000-0000-0000-00000000a010',
  monitor: '00000000-0000-0000-0000-00000000a011',
  teacher: '00000000-0000-0000-0000-00000000a012',
};

/**
 * The migration text exactly as the fixture installs it, including the
 * mutation named by HOMEWORK_DUE_MUTATION. Source assertions must read through
 * here, never through readFile — otherwise the mutation runner cannot reach
 * them (the lesson FEAT-010 RC6 paid for).
 */
export async function migrationSql() {
  let text = await repoFile(MIGRATION);
  const named = process.env.HOMEWORK_DUE_MUTATION;
  if (named) {
    const { mutations } = await import('./mutations.mjs');
    if (!mutations[named]) throw new Error(`không có mutation tên ${named}`);
    text = mutations[named].apply(text);
  }
  return text;
}

export const rollbackSql = () => repoFile(ROLLBACK);

/** crlf: store validate_revision with Windows line endings, as functions pasted into the Supabase SQL editor are. */
export async function createFixture({ migrate = true, crlf = false } = {}) {
  const db = new PGlite();
  let baseline = await local('baseline.sql');
  if (crlf) {
    baseline = baseline.replace(/create function homework_private\.validate_revision[\s\S]*?end \$\$;/, m => m.replace(/\n/g, '\r\n'));
  }
  await db.exec(baseline);
  await db.exec(`
    insert into public.school_years(id,name,start_date,end_date,is_active)
      values('${ids.y}','2026-2027',current_date-60,current_date+300,true);
    insert into public.classes(id,school_year_id,code,name,grade) values('${ids.c}','${ids.y}','7A9','7A9',7);
    insert into public.profiles(id,full_name,role,class_id) values
      ('${ids.student}','Học sinh','student','${ids.c}'),
      ('${ids.monitor}','Cán sự','monitor','${ids.c}'),
      ('${ids.teacher}','Giáo viên','teacher',null);
    insert into public.class_subjects(id,class_id,name) values('${ids.subj}','${ids.c}','Toán');
  `);
  if (migrate) await db.exec(await migrationSql());
  return db;
}

let requestSeq = 0;
/**
 * A notice written the way homework_api writes one: by the SECURITY DEFINER
 * dispatcher, i.e. as the table owner, whoever the author is. `dueOffset` is a
 * Postgres interval relative to now(), so the boundary is real time.
 */
export async function insertNotice(db, { author = ids.student, dueOffset = '2 days', due = null, requestId = null, status = 'pending_duplicate_review' } = {}) {
  const request = requestId ?? `00000000-0000-0000-0000-${String(++requestSeq).padStart(12, '0')}`;
  const r = await db.query(
    `insert into public.homework_notices(class_id,school_year_id,subject_id,author_id,title,content,due_at,request_id,status)
     values($1,$2,$3,$4,'Bài 5','Làm bài 1–4 trang 32',
            coalesce($5::timestamptz, now() + $6::interval),$7,$8)
     on conflict(author_id,request_id) do nothing
     returning *`,
    [ids.c, ids.y, ids.subj, author, due, dueOffset, request, status]);
  return r.rows[0] ?? null;
}

export async function asService(db, fn) {
  await db.exec("set role service_role");
  try { return await fn(); } finally { await db.exec('reset role'); }
}

export async function fails(promise) {
  try { await promise; return null; } catch (error) { return error; }
}
