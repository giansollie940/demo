import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { assemble, parseRows } from '../../installer/snapshot/assemble.mjs'
import { checkR2Live, signR2Request } from '../../installer/lib/checks.mjs'
import { pickServerKey } from '../../installer/lib/management.mjs'
import { createFileSource, installSteps, loadManifest, runStep } from '../../installer/lib/plan.mjs'
import { configScript, handleSetupAction, readEnv, setupStatus, siteOrigins } from '../../installer/lib/server.mjs'
import {
  checkAccessToken, checkAdmin, checkGroqKey, checkOrigin, checkR2, fillTemplate, normalizeLoginCode,
  projectRefFromUrl, sqlLiteral,
} from '../../installer/lib/validate.mjs'

const root = new URL('../../', import.meta.url).pathname
const files = createFileSource(root)
const manifest = loadManifest(files)
const REF = 'abcdefghijklmnopqrst'
const TOKEN = 'sbp_' + 'a'.repeat(40)
const env = { SUPABASE_URL: `https://${REF}.supabase.co`, SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_x', SETUP_PASSWORD: 'mat-khau-cai-dat', LOGIN_DOMAIN: 'Truong.Example.com' }

// ---------- validation
test('validation: tokens, keys, project URL', () => {
  assert.equal(projectRefFromUrl(`https://${REF}.supabase.co/`), REF)
  assert.equal(projectRefFromUrl('https://evil.example.com'), null)
  assert.equal(checkAccessToken(` ${TOKEN} `).value, TOKEN)
  assert.match(checkAccessToken('eyJhbGciOi').error, /sbp_/)
  assert.equal(checkGroqKey('').value, '')
  assert.ok(checkGroqKey('sk-123').error)
  assert.equal(checkGroqKey('gsk_' + 'x'.repeat(30)).value, 'gsk_' + 'x'.repeat(30))
  assert.equal(checkOrigin('https://a.vercel.app/setup/').value, 'https://a.vercel.app')
  assert.ok(checkOrigin('http://a.vercel.app').error)
})

test('validation: admin account mirrors the login screen rules', () => {
  assert.equal(normalizeLoginCode(' Quản Trị '), 'quntr')
  assert.deepEqual(checkAdmin({ code: 'QuanTri', fullName: '  Nguyễn   Văn A ', password: 'abc12345' }).value,
    { code: 'quantri', fullName: 'Nguyễn Văn A', password: 'abc12345' })
  assert.ok(checkAdmin({ code: 'q', fullName: 'Ab', password: 'abc12345' }).error)
  assert.ok(checkAdmin({ code: 'quantri', fullName: 'Ab', password: '12345678' }).error)
  assert.ok(checkAdmin({ code: 'quantri', fullName: 'Ab', password: 'abcdefgh' }).error)
})

test('validation: R2 is all-or-nothing', () => {
  assert.equal(checkR2({}).value, null)
  assert.equal(checkR2(null).value, null, 'the page sends r2: null after "Bỏ qua"')
  assert.equal(checkR2(undefined).value, null)
  assert.ok(checkAdmin(null).error)
  assert.match(checkR2({ bucket: 'anh' }).error, /đủ cả 4/)
  const ok = { accountId: 'a'.repeat(32), bucket: 'so-tu-hoc-anh', accessKeyId: 'k'.repeat(32), secretAccessKey: 's'.repeat(64) }
  assert.deepEqual(checkR2(ok).value, ok)
  assert.ok(checkR2({ ...ok, accountId: 'xyz' }).error)
})

test('SQL literals and templates cannot break out of the string', () => {
  assert.equal(sqlLiteral("O'Brien"), "'O''Brien'")
  assert.throws(() => sqlLiteral('a\0b'))
  assert.equal(fillTemplate('select {{A}}, {{B}};', { A: "x'); drop table t; --", B: 1 }), "select 'x''); drop table t; --', '1';")
  assert.throws(() => fillTemplate('{{MISSING}}', {}))
  const jobs = fillTemplate(files.readText('installer/sql/30-jobs.sql'), { PROJECT_URL: `https://${REF}.supabase.co`, MEDIA_SECRET: 'f'.repeat(64) })
  assert.doesNotMatch(jobs, /\{\{/)
  assert.match(jobs, /'feat006_project_url', 'https:\/\/abcdefghijklmnopqrst\.supabase\.co'/)
})

// ---------- snapshot
test('snapshot: rows are parsed from a tool envelope and assembled in section order', () => {
  const rows = [{ ord: 60, name: 'public.f()', ddl: 'create function f();' }, { ord: 50, name: 'public.t', ddl: 'create table t ();' }]
  const envelope = JSON.stringify({ result: `Below is data <untrusted>\n${JSON.stringify(rows)}\n</untrusted>` })
  const sql = assemble(parseRows(envelope), { generatedAt: '2026-01-01' })
  assert.ok(sql.indexOf('create table t') < sql.indexOf('create function f'))
  assert.match(sql, /^-- 50 Tables$/m)
  assert.throws(() => assemble([{ ord: 60, name: 'x', ddl: `select 'https://${REF}.supabase.co'` }]), /project-specific/)
  assert.throws(() => assemble([{ ord: 60, name: 'x', ddl: "select 'sb_secret_abc'" }]), /project-specific/)
})

test('baseline: shipped files are consistent with the repository', () => {
  const baseline = files.readText('installer/sql/10-baseline.sql')
  assert.match(baseline, /^set check_function_bodies = off;$/m)
  assert.doesNotMatch(baseline, /[a-z]{20}\.supabase\.co|sb_secret_|sb_publishable_|eyJ[A-Za-z0-9_-]{20,}/)
  for (const t of ['public.profiles', 'public.registrations', 'public.homework_notices', 'auth_bag.credentials', 'bag_game.scores']) {
    assert.match(baseline, new RegExp(`^create table ${t.replace('.', '\\.')} \\(`, 'm'), t)
  }
  assert.match(baseline, /CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth\.users/)
  const dirs = readdirSync(`${root}supabase/functions`, { withFileTypes: true })
    .filter(d => d.isDirectory() && d.name !== '_shared').map(d => d.name).sort()
  assert.deepEqual(manifest.functions.map(f => f.slug), dirs, 'every edge function is deployed by the installer')
  for (const f of manifest.baselineMigrations) assert.ok(readdirSync(`${root}supabase/migrations`).includes(f), f)
})

// ---------- install plan against a fake Supabase
function fakeSupabase({ state = 'empty' } = {}) {
  const log = []
  const db = { hasApp: state !== 'empty' && state !== 'foreign', admins: state === 'installed' ? 1 : 0, foreign: state === 'foreign', migrations: new Set() }
  const api = {
    getProject: async ref => ({ name: 'Trường thử', region: 'ap-southeast-1', status: 'ACTIVE_HEALTHY', ref }),
    runSql: async (ref, q) => {
      log.push(['sql', q])
      const head = q.trim()
      if (head.startsWith('select') && head.includes('as public_tables')) return [{ public_tables: db.hasApp ? 66 : db.foreign ? 3 : 0, has_app: db.hasApp }]
      if (head.startsWith("select count(*)::int as n from public.profiles where role = 'admin'")) return [{ n: db.admins }]
      if (head.startsWith('select id from auth.users')) return []
      if (head.startsWith('select version from supabase_migrations')) return [...db.migrations].map(version => ({ version }))
      if (q.includes('create table public.profiles (')) db.hasApp = true
      if (head.startsWith('insert into public.profiles')) db.admins = 1
      return []
    },
    setSecrets: async (ref, s) => { log.push(['secrets', s]) },
    getApiKeys: async () => [{ name: 'anon', type: 'legacy', api_key: 'anon' }, { type: 'secret', api_key: 'sb_secret_test' }],
    updateAuthConfig: async (ref, c) => { log.push(['auth', c]) },
    deployFunction: async (ref, f) => { log.push(['deploy', f]) },
  }
  const fetchImpl = async (url, init) => {
    log.push(['fetch', String(url), init?.method, JSON.parse(init?.body || 'null')])
    return new Response(JSON.stringify({ id: '11111111-1111-4111-8111-111111111111' }), { status: 200 })
  }
  return { api, log, db, fetchImpl }
}

function ctxFor(fake, input = {}) {
  return {
    api: fake.api, ref: REF, projectUrl: `https://${REF}.supabase.co`, loginDomain: 'truong.example.com',
    origin: 'https://truong.vercel.app', allowedOrigins: ['https://truong.vercel.app'], files, manifest, input, fetchImpl: fake.fetchImpl,
  }
}

test('plan: every step runs in order and the last one locks the installer', async () => {
  const fake = fakeSupabase()
  const steps = installSteps(manifest)
  assert.deepEqual(steps.slice(0, 5).map(s => s.id), ['prepare', 'baseline', 'seed', 'migrations', 'secrets'])
  assert.equal(steps.at(-1).id, 'admin')
  const input = { groqKey: 'gsk_test', r2: null, admin: { code: 'quantri', fullName: 'Quản trị', password: 'abc12345' } }
  for (const s of steps) await runStep(s.id, ctxFor(fake, input))

  const sql = fake.log.filter(e => e[0] === 'sql').map(e => e[1]).join('\n')
  assert.match(sql, /create extension if not exists pg_cron/)
  assert.match(sql, /insert into supabase_migrations\.schema_migrations \(version, name\) values/)
  assert.match(sql, /insert into public\.periods/)
  assert.match(sql, /cron\.schedule\('feat006-media-cleanup'/)
  assert.match(sql, /select public\.bootstrap_root_admin\('11111111-1111-4111-8111-111111111111'::uuid\)/)

  const [, secrets] = fake.log.find(e => e[0] === 'secrets')
  assert.equal(secrets.GROQ_API_KEY, 'gsk_test')
  assert.equal(secrets.LOGIN_DOMAIN, 'truong.example.com')
  assert.equal(secrets.ALLOWED_ORIGINS, 'https://truong.vercel.app')
  assert.match(secrets.MEDIA_MAINTENANCE_SECRET, /^[0-9a-f]{64}$/)
  assert.ok(!('R2_ACCOUNT_ID' in secrets))
  assert.ok(sql.includes(`'${secrets.MEDIA_MAINTENANCE_SECRET}'`), 'vault gets the same media secret')

  const deploys = fake.log.filter(e => e[0] === 'deploy').map(e => e[1])
  assert.equal(deploys.length, manifest.functions.length)
  const review = deploys.find(d => d.slug === 'ai-review-registration')
  assert.equal(review.verifyJwt, true)
  assert.equal(review.entrypoint, 'supabase/functions/ai-review-registration/index.ts')
  assert.ok(review.files.some(f => f.path === 'supabase/functions/_shared/config.ts'))
  assert.equal(deploys.find(d => d.slug === 'bag-login').verifyJwt, false)

  assert.deepEqual(fake.log.find(e => e[0] === 'auth')[1],
    { disable_signup: true, site_url: 'https://truong.vercel.app', uri_allow_list: 'https://truong.vercel.app/**' })
  const create = fake.log.find(e => e[0] === 'fetch')
  assert.equal(create[1], `https://${REF}.supabase.co/auth/v1/admin/users`)
  assert.deepEqual(create[3], { email: 'quantri@truong.example.com', password: 'abc12345', email_confirm: true, user_metadata: { full_name: 'Quản trị', login_code: 'quantri' } })

  await assert.rejects(runStep('prepare', ctxFor(fake, input)), /đã khoá/)
})

test('plan: refuses a project that holds another app, skips a baseline that is already there', async () => {
  await assert.rejects(runStep('prepare', ctxFor(fakeSupabase({ state: 'foreign' }))), /project trống/)
  const partial = fakeSupabase({ state: 'partial' })
  const r = await runStep('baseline', ctxFor(partial))
  assert.match(r.message, /bỏ qua/)
  assert.ok(!partial.log.some(e => e[0] === 'sql' && e[1].includes('create table public.profiles (')))
})

test('plan: R2 keys become function secrets only when given', async () => {
  const fake = fakeSupabase()
  const r2 = { accountId: 'a'.repeat(32), bucket: 'anh', accessKeyId: 'k'.repeat(32), secretAccessKey: 's'.repeat(64) }
  await runStep('secrets', ctxFor(fake, { groqKey: '', r2 }))
  const [, secrets] = fake.log.find(e => e[0] === 'secrets')
  assert.equal(secrets.R2_HOMEWORK_BUCKET, 'anh')
  assert.ok(!('GROQ_API_KEY' in secrets))
})

test('server key: secret key first, legacy service_role as fallback', () => {
  assert.equal(pickServerKey([{ name: 'service_role', api_key: 'legacy' }, { type: 'secret', api_key: 'new' }]), 'new')
  assert.equal(pickServerKey([{ name: 'anon', api_key: 'a' }, { name: 'service_role', api_key: 'legacy' }]), 'legacy')
  assert.throws(() => pickServerKey([{ name: 'anon', api_key: 'a' }]))
})

// ---------- setup API
const noSleep = async () => {}

test('setup API: settings and password gate every action', async () => {
  const manifestStatus = setupStatus(readEnv(env), manifest)
  assert.deepEqual(manifestStatus.env, { supabaseUrl: true, publishableKey: true, setupPassword: true })
  assert.equal(manifestStatus.loginDomain, 'truong.example.com')
  assert.ok(!JSON.stringify(manifestStatus).includes('mat-khau-cai-dat'))

  const opts = { cfg: readEnv(env), manifest, files, requestOrigin: 'https://truong.vercel.app', sleep: noSleep }
  assert.equal((await handleSetupAction({ password: 'sai', action: 'login' }, opts)).status, 401)
  assert.equal((await handleSetupAction({ password: 'mat-khau-cai-dat', action: 'login' }, opts)).status, 200)
  const noPass = await handleSetupAction({ password: '', action: 'login' }, { ...opts, cfg: readEnv({ ...env, SETUP_PASSWORD: 'short' }) })
  assert.equal(noPass.status, 400)
  const badStep = await handleSetupAction({ password: 'mat-khau-cai-dat', token: TOKEN, action: 'drop-everything' }, opts)
  assert.equal(badStep.status, 400)
  const badToken = await handleSetupAction({ password: 'mat-khau-cai-dat', token: 'nope', action: 'token' }, opts)
  assert.match(badToken.body.error, /sbp_/)
})

test('setup API: token check reports the project state; a locked project answers 409', async () => {
  const calls = []
  const fetchImpl = async (url, init) => {
    calls.push(String(url))
    if (String(url).endsWith(`/projects/${REF}`)) return Response.json({ name: 'Trường thử', region: 'r', status: 'ACTIVE_HEALTHY' })
    const q = JSON.parse(init.body).query
    if (q.includes('public_tables')) return Response.json([{ public_tables: 66, has_app: true }])
    if (q.includes("role = 'admin'")) return Response.json([{ n: 1 }])
    return Response.json([])
  }
  const opts = { cfg: readEnv(env), manifest, files, requestOrigin: 'https://truong.vercel.app', fetchImpl, sleep: noSleep }
  const r = await handleSetupAction({ password: 'mat-khau-cai-dat', token: TOKEN, action: 'token' }, opts)
  assert.equal(r.status, 200)
  assert.equal(r.body.state, 'installed')
  assert.ok(calls.every(u => u.startsWith('https://api.supabase.com/v1/projects/' + REF)), 'only the configured project is touched')
  const locked = await handleSetupAction({ password: 'mat-khau-cai-dat', token: TOKEN, action: 'prepare' }, opts)
  assert.equal(locked.status, 409)
  assert.equal(locked.body.locked, true)
})

test('setup API: secrets step accepts the skipped keys exactly as the page sends them', async () => {
  const seen = []
  const fetchImpl = async (url, init) => {
    seen.push(String(url))
    if (String(url).endsWith('/secrets')) return Response.json({})
    const q = JSON.parse(init.body).query
    if (q.includes('public_tables')) return Response.json([{ public_tables: 66, has_app: true }])
    if (q.includes("role = 'admin'")) return Response.json([{ n: 0 }])
    return Response.json([])
  }
  const r = await handleSetupAction({ password: 'mat-khau-cai-dat', token: TOKEN, action: 'secrets', input: { groqKey: '', r2: null } },
    { cfg: readEnv(env), manifest, files, requestOrigin: 'https://truong.vercel.app', fetchImpl, sleep: noSleep })
  assert.equal(r.status, 200, JSON.stringify(r.body))
  assert.ok(seen.some(u => u.endsWith(`/projects/${REF}/secrets`)))
})

test('setup API: a rejected token is explained, not leaked', async () => {
  const fetchImpl = async () => new Response('{"message":"Unauthorized"}', { status: 401 })
  const r = await handleSetupAction({ password: 'mat-khau-cai-dat', token: TOKEN, action: 'token' },
    { cfg: readEnv(env), manifest, files, requestOrigin: 'https://truong.vercel.app', fetchImpl, sleep: noSleep })
  assert.equal(r.status, 401)
  assert.doesNotMatch(JSON.stringify(r.body), /sbp_/)
})

test('site origins: production domain first, then the address in use', () => {
  assert.deepEqual(siteOrigins(readEnv({ ...env, VERCEL_PROJECT_PRODUCTION_URL: 'truong.vercel.app' }), 'https://truong-git-x.vercel.app'),
    { origin: 'https://truong.vercel.app', allowedOrigins: ['https://truong.vercel.app', 'https://truong-git-x.vercel.app'] })
  assert.deepEqual(siteOrigins(readEnv(env), 'https://a.vercel.app'), { origin: 'https://a.vercel.app', allowedOrigins: ['https://a.vercel.app'] })
})

// ---------- /config.js
test('config.js: app config when installed, setup redirect otherwise', async () => {
  const installed = await configScript(readEnv(env), { fetchImpl: async () => Response.json([]) })
  const cfg = JSON.parse(installed.replace(/^window\.APP_CONFIG = /, '').replace(/;\s*$/, ''))
  assert.deepEqual(cfg, { mode: 'supabase', projectUrl: `https://${REF}.supabase.co`, publishableKey: 'sb_publishable_x', loginDomain: 'truong.example.com', fallbackRefreshSeconds: 180, authBag: true, bagGame: true })
  const missing = await configScript(readEnv(env), { fetchImpl: async () => new Response('{"code":"PGRST205"}', { status: 404 }) })
  assert.match(missing, /setup\//)
  assert.match(await configScript(readEnv({}), {}), /location\.replace/)
  const offline = await configScript(readEnv(env), { fetchImpl: async () => { throw new Error('down') } })
  assert.match(offline, /^window\.APP_CONFIG/)
})

// ---------- R2 signing
test('R2: SigV4 request shape and live-check outcomes', async () => {
  const r2 = { accountId: 'a'.repeat(32), bucket: 'anh', accessKeyId: 'AKID', secretAccessKey: 'SECRET' }
  const { url, headers } = signR2Request(r2, 'HEAD', '/anh/x', new Date('2026-01-02T03:04:05Z'))
  assert.equal(url, `https://${'a'.repeat(32)}.r2.cloudflarestorage.com/anh/x`)
  assert.equal(headers['x-amz-date'], '20260102T030405Z')
  assert.match(headers.Authorization, /^AWS4-HMAC-SHA256 Credential=AKID\/20260102\/auto\/s3\/aws4_request, SignedHeaders=host;x-amz-content-sha256;x-amz-date, Signature=[0-9a-f]{64}$/)
  assert.equal((await checkR2Live(r2, { fetchImpl: async () => new Response(null, { status: 404 }) })).ok, true)
  assert.equal((await checkR2Live(r2, { fetchImpl: async () => new Response(null, { status: 403 }) })).ok, false)
})

test('setup page ships with the build and only talks to its own server', () => {
  const js = readFileSync(`${root}public/setup/setup.js`, 'utf8')
  const urls = [...js.matchAll(/fetch\('([^']+)'/g)].map(m => m[1])
  assert.deepEqual([...new Set(urls)].sort(), ['/api/setup/status', '/api/setup/step'])
  assert.doesNotMatch(js, /localStorage|sessionStorage|document\.cookie/)
})
