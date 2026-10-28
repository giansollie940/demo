// The install plan: an ordered list of small steps. The setup page runs them one by one through the
// setup API, so each step stays well within a serverless time limit and can simply be run again.
import { randomBytes } from 'node:crypto'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { createAuthAdmin, pickServerKey } from './management.mjs'
import { fillTemplate, sqlLiteral } from './validate.mjs'

export class LockedError extends Error {}

export function createFileSource(root) {
  const list = dir => readdirSync(join(root, dir)).flatMap(name => {
    const rel = `${dir}/${name}`
    return statSync(join(root, rel)).isDirectory() ? list(rel) : [rel]
  })
  return {
    readText: rel => readFileSync(join(root, rel), 'utf8'),
    listFiles: dir => list(dir).map(p => relative(root, join(root, p)).split(sep).join('/')).sort(),
  }
}

export function loadManifest(files) {
  return JSON.parse(files.readText('installer/manifest.json'))
}

export function installSteps(manifest) {
  return [
    { id: 'prepare', label: 'Bật các tiện ích cơ sở dữ liệu cần thiết' },
    { id: 'baseline', label: 'Tạo cấu trúc cơ sở dữ liệu' },
    { id: 'seed', label: 'Thêm dữ liệu mặc định (tiết học, môn học, cài đặt)' },
    { id: 'migrations', label: 'Cập nhật cơ sở dữ liệu lên bản mới nhất' },
    { id: 'secrets', label: 'Lưu khoá cho các hàm máy chủ và việc chạy định kỳ' },
    ...manifest.functions.map(f => ({ id: `fn:${f.slug}`, label: `Đưa hàm máy chủ "${f.slug}" lên` })),
    { id: 'auth', label: 'Cấu hình đăng nhập' },
    { id: 'admin', label: 'Tạo tài khoản quản trị' },
  ]
}

const rows = result => (Array.isArray(result) ? result : [])

/** What is in the target database right now. */
export async function inspect(api, ref) {
  const [r] = rows(await api.runSql(ref, `
    select
      (select count(*) from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind in ('r', 'p'))::int as public_tables,
      to_regclass('public.registrations') is not null
        and to_regclass('public.homework_notices') is not null
        and to_regclass('public.profiles') is not null as has_app`))
  let admins = 0
  if (r?.has_app) {
    const [a] = rows(await api.runSql(ref, `select count(*)::int as n from public.profiles where role = 'admin'`))
    admins = a?.n ?? 0
  }
  const state = admins > 0 ? 'installed' : r?.has_app ? 'partial' : (r?.public_tables ?? 0) > 0 ? 'foreign' : 'empty'
  return { state, publicTables: r?.public_tables ?? 0, admins }
}

async function ensureWritable(ctx) {
  const info = await inspect(ctx.api, ctx.ref)
  if (info.state === 'installed') throw new LockedError('Sổ Tự Học đã được cài xong trên project này. Trang cài đặt đã khoá.')
  if (info.state === 'foreign') throw new Error('Project Supabase này đã có bảng dữ liệu khác. Hãy dùng một project trống.')
  return info
}

const MIGRATION_TABLE = `
  create schema if not exists supabase_migrations;
  create table if not exists supabase_migrations.schema_migrations (version text primary key, statements text[], name text);`

function migrationVersion(file) {
  const m = /^(\d+)_(.+)\.sql$/.exec(file)
  return m ? { version: m[1], name: m[2] } : null
}

export async function runStep(id, ctx) {
  const { api, ref, files, manifest } = ctx
  const info = await ensureWritable(ctx)

  if (id === 'prepare') {
    await api.runSql(ref, files.readText('installer/sql/00-prepare.sql'))
    return { message: 'Đã bật pg_cron, pg_net, pgcrypto, uuid-ossp.' }
  }

  if (id === 'baseline') {
    if (info.state === 'partial') return { message: 'Cấu trúc cơ sở dữ liệu đã có sẵn, bỏ qua.' }
    const recorded = manifest.baselineMigrations.map(migrationVersion).filter(Boolean)
      .map(m => `(${sqlLiteral(m.version)}, ${sqlLiteral(m.name)})`).join(',\n')
    await api.runSql(ref, `${files.readText('installer/sql/10-baseline.sql')}
${MIGRATION_TABLE}
insert into supabase_migrations.schema_migrations (version, name) values
${recorded}
on conflict (version) do nothing;`)
    return { message: 'Đã tạo đầy đủ bảng, hàm, quy tắc phân quyền và chỉ mục.' }
  }

  if (id === 'seed') {
    await api.runSql(ref, files.readText('installer/sql/20-seed.sql'))
    return { message: 'Đã thêm tiết học, môn học lớp 7 và cài đặt mặc định.' }
  }

  if (id === 'migrations') {
    const known = new Set(manifest.baselineMigrations)
    const pending = files.listFiles('supabase/migrations').map(p => p.split('/').pop())
      .filter(f => f.endsWith('.sql') && !known.has(f)).sort()
    if (!pending.length) return { message: 'Không có bản cập nhật nào sau bản chụp, cơ sở dữ liệu đã mới nhất.' }
    await api.runSql(ref, MIGRATION_TABLE)
    const done = new Set(rows(await api.runSql(ref, 'select version from supabase_migrations.schema_migrations')).map(r => r.version))
    let applied = 0
    for (const file of pending) {
      const m = migrationVersion(file)
      if (!m || done.has(m.version)) continue
      await api.runSql(ref, `${files.readText(`supabase/migrations/${file}`)}
;insert into supabase_migrations.schema_migrations (version, name) values (${sqlLiteral(m.version)}, ${sqlLiteral(m.name)});`)
      applied++
    }
    return { message: `Đã áp dụng ${applied} bản cập nhật.` }
  }

  if (id === 'secrets') {
    const mediaSecret = randomBytes(32).toString('hex')
    const secrets = {
      LOGIN_DOMAIN: ctx.loginDomain,
      ALLOWED_ORIGINS: ctx.allowedOrigins.join(','),
      MEDIA_MAINTENANCE_SECRET: mediaSecret,
    }
    if (ctx.input.groqKey) secrets.GROQ_API_KEY = ctx.input.groqKey
    if (ctx.input.r2) {
      secrets.R2_ACCOUNT_ID = ctx.input.r2.accountId
      secrets.R2_HOMEWORK_BUCKET = ctx.input.r2.bucket
      secrets.R2_ACCESS_KEY_ID = ctx.input.r2.accessKeyId
      secrets.R2_SECRET_ACCESS_KEY = ctx.input.r2.secretAccessKey
    }
    await api.setSecrets(ref, secrets)
    await api.runSql(ref, fillTemplate(files.readText('installer/sql/30-jobs.sql'),
      { PROJECT_URL: ctx.projectUrl, MEDIA_SECRET: mediaSecret }))
    const extras = [ctx.input.groqKey && 'Groq', ctx.input.r2 && 'Cloudflare R2'].filter(Boolean)
    return { message: `Đã lưu khoá${extras.length ? ` (gồm ${extras.join(', ')})` : ''} và đặt lịch chạy định kỳ.` }
  }

  if (id.startsWith('fn:')) {
    const slug = id.slice(3)
    const fn = manifest.functions.find(f => f.slug === slug)
    if (!fn) throw new Error(`Không có hàm ${slug}.`)
    const paths = [...files.listFiles(`supabase/functions/${slug}`), ...files.listFiles('supabase/functions/_shared')]
    await api.deployFunction(ref, {
      slug,
      entrypoint: `supabase/functions/${slug}/index.ts`,
      verifyJwt: fn.verifyJwt,
      files: paths.map(path => ({ path, content: files.readText(path) })),
    })
    return { message: `Đã đưa hàm ${slug} lên.` }
  }

  if (id === 'auth') {
    await api.updateAuthConfig(ref, {
      disable_signup: true,
      site_url: ctx.origin,
      uri_allow_list: ctx.allowedOrigins.map(o => `${o}/**`).join(','),
    })
    return { message: 'Đã tắt tự đăng ký: chỉ quản trị viên mới tạo được tài khoản.' }
  }

  if (id === 'admin') {
    const { code, fullName, password } = ctx.input.admin
    const email = `${code}@${ctx.loginDomain}`
    const auth = createAuthAdmin(ctx.projectUrl, pickServerKey(await api.getApiKeys(ref)), { fetchImpl: ctx.fetchImpl })
    const [existing] = rows(await api.runSql(ref, `select id from auth.users where lower(email) = lower(${sqlLiteral(email)})`))
    let userId = existing?.id
    if (userId) {
      await auth.updateUser(userId, { password, email_confirm: true })
    } else {
      const created = await auth.createUser({
        email, password, email_confirm: true, user_metadata: { full_name: fullName, login_code: code },
      })
      userId = created?.id || created?.user?.id
      if (!userId) throw new Error('Supabase không trả về mã tài khoản vừa tạo.')
    }
    const id_ = sqlLiteral(userId)
    await api.runSql(ref, `
      insert into public.profiles (id, student_code, full_name, email, role, class_id, active, deleted_at)
      values (${id_}::uuid, ${sqlLiteral(code)}, ${sqlLiteral(fullName)}, ${sqlLiteral(email)}, 'teacher', null, true, null)
      on conflict (id) do update set student_code = excluded.student_code, full_name = excluded.full_name,
        email = excluded.email, role = 'teacher', class_id = null, active = true, deleted_at = null;
      select public.bootstrap_root_admin(${id_}::uuid);`)
    return { message: `Đã tạo tài khoản quản trị "${code}".`, done: true }
  }

  throw new Error(`Bước không hợp lệ: ${id}`)
}
